import express from 'express'
import { dbRun, dbGet } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'
import { sendPasswordResetCode, isEmailConfigured } from '../services/email'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = '7d'

function getCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    // FE and BE are different Cloud Run domains, so production must allow cross-site cookies.
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  }
}

// 用户注册（内测期暂停，控制 token 使用）
router.post('/register', async (req, res) => {
  res.status(403).json({ error: '系统内测期，暂不支持注册' })
  return
  try {
    const { name, email, password, role: bodyRole } = req.body
    // 注册时不允许自行设置为 admin/manager，仅允许 user 或 operator（由管理员在用户管理中创建）
    const role = ['admin', 'manager'].includes(bodyRole) ? 'user' : (bodyRole || 'user')

    if (!name || !email || !password) {
      return res.status(400).json({ error: '姓名、邮箱和密码不能为空' })
    }

    // 检查邮箱是否已存在
    const existingUser = await dbGet('SELECT * FROM users WHERE email = ?', [email])
    if (existingUser) {
      return res.status(400).json({ error: '邮箱已被注册' })
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    await dbRun(
      'INSERT INTO users (id, name, email, password, role, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, email, hashedPassword, role, 'active', createdAt]
    )

    // 创建用户偏好设置
    await dbRun(
      'INSERT INTO user_preferences (id, userId, preferences) VALUES (?, ?, ?)',
      [crypto.randomUUID(), id, '{}']
    )

    res.status(201).json({ message: '注册成功', userId: id })
  } catch (error) {
    console.error('注册失败:', error)
    res.status(500).json({ error: '注册失败' })
  }
})

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }

    // 查找用户
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email])
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(403).json({ error: '账户已被禁用' })
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    // 账号是否首次登录（在更新 lastLoginAt 之前判断）
    const firstLoginEver = !user.lastLoginAt

    // 当前 IP 是否首次登录（用于「新 IP 首次登录」展示教程）
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req as any).ip || (req as any).socket?.remoteAddress || ''
    const ipHash = clientIp ? crypto.createHash('sha256').update(clientIp).digest('hex') : ''
    let newIpFirstLogin = false
    if (ipHash) {
      const seen = await dbGet('SELECT 1 FROM tutorial_seen_ips WHERE ipHash = ?', [ipHash])
      newIpFirstLogin = !seen
      if (newIpFirstLogin) {
        await dbRun('INSERT INTO tutorial_seen_ips (ipHash, seenAt) VALUES (?, ?) ON CONFLICT DO NOTHING', [
          ipHash,
          new Date().toISOString(),
        ])
      }
    }

    // 生成JWT token（有效期 7 天，一周后需重新登录）
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    // 保存会话
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await dbRun(
      'INSERT INTO user_sessions (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)',
      [sessionId, user.id, token, expiresAt, new Date().toISOString()]
    )

    // 更新最后登录时间
    await dbRun('UPDATE users SET lastLoginAt = ? WHERE id = ?', [new Date().toISOString(), user.id])

    const isProduction = process.env.NODE_ENV === 'production'
    res.cookie('token', token, getCookieOptions(isProduction))

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      firstLoginEver,
      newIpFirstLogin,
    })
  } catch (error) {
    console.error('登录失败:', error)
    res.status(500).json({ error: '登录失败' })
  }
})

// 用户登出
router.post('/logout', async (req, res) => {
  try {
    const token = (req as any).cookies?.token || req.headers.authorization?.replace('Bearer ', '')
    if (token) {
      await dbRun('DELETE FROM user_sessions WHERE token = ?', [token])
    }
    const isProduction = process.env.NODE_ENV === 'production'
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
    })
    res.json({ message: '登出成功' })
  } catch (error) {
    console.error('登出失败:', error)
    res.status(500).json({ error: '登出失败' })
  }
})

// 忘记密码：发送邮箱验证码（已配置 SMTP 时发邮件；未配置时仅开发环境在响应中返回 code 便于测试）
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    const rawEmail = typeof email === 'string' ? email.trim() : ''
    if (!rawEmail) {
      return res.status(400).json({ error: '请输入邮箱' })
    }
    const user = await dbGet('SELECT id, email FROM users WHERE email = ?', [rawEmail])
    if (!user) {
      return res.status(200).json({ message: '若该邮箱已注册，将收到验证码' })
    }
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresMinutes = 10
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString()
    await dbRun('DELETE FROM password_reset_codes WHERE email = ?', [rawEmail])
    await dbRun(
      'INSERT INTO password_reset_codes (email, code, expiresAt, createdAt) VALUES (?, ?, ?, ?)',
      [rawEmail, code, expiresAt, new Date().toISOString()]
    )

    const emailConfigured = isEmailConfigured()
    const sent = await sendPasswordResetCode({ to: rawEmail, code, expiresMinutes })
    if (!emailConfigured) console.warn('[忘记密码] 未配置 SMTP，未发邮件')
    else if (!sent) console.warn('[忘记密码] SMTP 已配置但发送失败，请查看上方 [邮件] 错误')
    const isDev = process.env.NODE_ENV !== 'production'
    const includeCodeInResponse = !sent && isDev
    res.status(200).json({
      message: sent ? '验证码已发送至您的邮箱，请查收' : isDev ? '未配置邮件服务，请使用下方验证码（仅开发环境）' : '若该邮箱已注册，将收到验证码',
      ...(includeCodeInResponse && { code }),
    })
  } catch (error) {
    console.error('忘记密码请求失败:', error)
    res.status(500).json({ error: '请求失败' })
  }
})

// 重置密码（支持两种方式：1. 邮箱+验证码 2. 链接 token）
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, code, newPassword } = req.body
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' })
    }
    let userId: string | null = null

    if (email && code) {
      const rawEmail = String(email).trim()
      const rawCode = String(code).trim()
      const row = await dbGet(
        'SELECT * FROM password_reset_codes WHERE email = ? AND code = ? AND expiresAt > ?',
        [rawEmail, rawCode, new Date().toISOString()]
      )
      if (!row) {
        return res.status(400).json({ error: '验证码错误或已过期' })
      }
      const user = await dbGet('SELECT id FROM users WHERE email = ?', [rawEmail])
      if (!user) return res.status(400).json({ error: '该邮箱未注册' })
      userId = user.id
      await dbRun('DELETE FROM password_reset_codes WHERE email = ?', [rawEmail])
    } else if (token) {
      const row = await dbGet(
        'SELECT * FROM password_reset_tokens WHERE token = ? AND expiresAt > ?',
        [token, new Date().toISOString()]
      )
      if (!row) {
        return res.status(400).json({ error: '链接无效或已过期' })
      }
      userId = row.userId
      await dbRun('DELETE FROM password_reset_tokens WHERE token = ?', [token])
    } else {
      return res.status(400).json({ error: '请提供验证码或重置链接' })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    const now = new Date().toISOString()
    await dbRun('UPDATE users SET password = ?, updatedAt = ? WHERE id = ?', [hashedPassword, now, userId])
    res.json({ message: '密码已重置，请登录' })
  } catch (error) {
    console.error('重置密码失败:', error)
    res.status(500).json({ error: '重置失败' })
  }
})

// 获取当前用户信息（统一使用 authenticate 中间件）
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const user = await dbGet('SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users WHERE id = ?', [
      userId,
    ])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }
    res.json(user)
  } catch (error) {
    console.error('获取用户信息失败:', error)
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

// 更新当前用户资料（姓名）
router.put('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { name } = req.body
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: '姓名不能为空' })
    }
    const now = new Date().toISOString()
    await dbRun('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?', [name.trim(), now, userId])
    const user = await dbGet('SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users WHERE id = ?', [
      userId,
    ])
    res.json(user)
  } catch (error) {
    console.error('更新用户信息失败:', error)
    res.status(500).json({ error: '更新失败' })
  }
})

// 修改当前用户邮箱（需验证当前密码）
router.post('/change-email', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { newEmail, currentPassword } = req.body
    const rawNew = typeof newEmail === 'string' ? newEmail.trim() : ''
    if (!rawNew) return res.status(400).json({ error: '请输入新邮箱' })
    if (!currentPassword) return res.status(400).json({ error: '请输入当前密码' })
    const user = await dbGet('SELECT id, email, password FROM users WHERE id = ?', [userId])
    if (!user) return res.status(404).json({ error: '用户不存在' })
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return res.status(401).json({ error: '当前密码错误' })
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [rawNew])
    if (existing) return res.status(400).json({ error: '该邮箱已被使用' })
    const now = new Date().toISOString()
    await dbRun('UPDATE users SET email = ?, updatedAt = ? WHERE id = ?', [rawNew, now, userId])
    const updated = await dbGet('SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users WHERE id = ?', [
      userId,
    ])
    res.json(updated)
  } catch (error) {
    console.error('修改邮箱失败:', error)
    res.status(500).json({ error: '修改失败' })
  }
})

// 修改当前用户密码（需验证旧密码）
router.post('/change-password', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '请提供当前密码和新密码' })
    }
    if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少 6 位' })
    const user = await dbGet('SELECT password FROM users WHERE id = ?', [userId])
    if (!user) return res.status(404).json({ error: '用户不存在' })
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return res.status(401).json({ error: '当前密码错误' })
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    const now = new Date().toISOString()
    await dbRun('UPDATE users SET password = ?, updatedAt = ? WHERE id = ?', [hashedPassword, now, userId])
    res.json({ message: '密码已修改' })
  } catch (error) {
    console.error('修改密码失败:', error)
    res.status(500).json({ error: '修改失败' })
  }
})

export default router
