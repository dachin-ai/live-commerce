import express from 'express'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const router = express.Router()

// 获取所有用户 - 仅管理员
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await dbAll(
      'SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users ORDER BY createdAt DESC'
    )
    res.json(users)
  } catch (error) {
    console.error('获取用户列表失败:', error)
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

// 获取单个用户（仅管理员/经理，且不返回密码）
router.get('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const user = await dbGet(
      'SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users WHERE id = ?',
      [id]
    )

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    res.json(user)
  } catch (error) {
    console.error('获取用户失败:', error)
    res.status(500).json({ error: '获取用户失败' })
  }
})

// 创建用户 - 仅管理员
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role: rawRole = 'user', status = 'active' } = req.body
    const allowedRoles = ['user', 'admin', 'operator', 'manager', 'viewer'] as const
    const role = allowedRoles.includes(rawRole) ? rawRole : 'user'

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
      [id, name, email, hashedPassword, role, status, createdAt]
    )

    // 创建用户偏好设置
    await dbRun(
      'INSERT INTO user_preferences (id, userId, preferences) VALUES (?, ?, ?)',
      [crypto.randomUUID(), id, '{}']
    )

    const newUser = await dbGet(
      'SELECT id, name, email, role, status, createdAt FROM users WHERE id = ?',
      [id]
    )
    res.status(201).json(newUser)
  } catch (error) {
    console.error('创建用户失败:', error)
    res.status(500).json({ error: '创建用户失败' })
  }
})

// 更新用户 - 仅管理员
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, email, role: rawRole, status, password } = req.body
    const allowedRoles = ['user', 'admin', 'operator', 'manager', 'viewer'] as const
    const role = rawRole !== undefined ? (allowedRoles.includes(rawRole) ? rawRole : undefined) : undefined

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (email !== undefined) updates.email = email
    if (role !== undefined) updates.role = role
    if (status !== undefined) updates.status = status
    if (password !== undefined) {
      updates.password = await bcrypt.hash(password, 10)
    }

    const updateFields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ')
    const updateValues = Object.values(updates)

    await dbRun(`UPDATE users SET ${updateFields} WHERE id = ?`, [...updateValues, id])

    const updatedUser = await dbGet(
      'SELECT id, name, email, role, status, createdAt FROM users WHERE id = ?',
      [id]
    )
    res.json(updatedUser)
  } catch (error) {
    console.error('更新用户失败:', error)
    res.status(500).json({ error: '更新用户失败' })
  }
})

// 删除用户 - 仅管理员
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 不能删除自己
    if (id === req.user!.userId) {
      return res.status(400).json({ error: '不能删除自己的账户' })
    }

    await dbRun('DELETE FROM users WHERE id = ?', [id])
    res.json({ message: '用户已删除' })
  } catch (error) {
    console.error('删除用户失败:', error)
    res.status(500).json({ error: '删除用户失败' })
  }
})

export default router
