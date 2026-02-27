import express from 'express'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const router = express.Router()

// 获取所有用户 - 管理员看全部；经理只能看到运营和普通用户（用于分配店铺）
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    let users: any[]
    if (req.user!.role === 'manager') {
      users = await dbAll(
        "SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users WHERE role IN ('operator', 'user') ORDER BY createdAt DESC"
      )
    } else {
      users = await dbAll(
        'SELECT id, name, email, role, status, createdAt, lastLoginAt FROM users ORDER BY createdAt DESC'
      )
    }
    res.json(users)
  } catch (error) {
    console.error('获取用户列表失败:', error)
    res.status(500).json({ error: '获取用户列表失败' })
  }
})

/** 获取用户可查看的店铺（归属 + 授权） - 用于「店铺可见」配置 */
router.get('/:id/store-access', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const user = await dbGet('SELECT id, role FROM users WHERE id = ?', [id])
    if (!user) return res.status(404).json({ error: '用户不存在' })
    if (req.user!.role === 'manager' && user.role !== 'operator' && user.role !== 'user') {
      return res.status(403).json({ error: '经理只能查看运营或普通用户的店铺配置' })
    }
    const owned = await dbAll<{ id: string }>('SELECT id FROM stores WHERE userId = ?', [id])
    const access = await dbAll<{ storeId: string }>('SELECT storeId FROM user_store_access WHERE userId = ?', [id])
    res.json({
      ownedStoreIds: owned.map((r) => r.id),
      accessStoreIds: access.map((r) => r.storeId),
    })
  } catch (error) {
    console.error('获取用户店铺权限失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

/** 设置用户可查看的店铺（仅 accessStoreIds，不含归属店） */
router.put('/:id/store-access', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { accessStoreIds = [] } = req.body
    const user = await dbGet('SELECT id, role FROM users WHERE id = ?', [id])
    if (!user) return res.status(404).json({ error: '用户不存在' })
    if (req.user!.role === 'manager' && user.role !== 'operator' && user.role !== 'user') {
      return res.status(403).json({ error: '经理只能配置运营或普通用户的店铺权限' })
    }
    const ids = Array.isArray(accessStoreIds) ? accessStoreIds.filter((x: unknown) => typeof x === 'string') : []
    const owned = await dbAll<{ id: string }>('SELECT id FROM stores WHERE userId = ?', [id])
    const ownedSet = new Set(owned.map((r) => r.id))
    const toAdd = ids.filter((sid: string) => !ownedSet.has(sid))
    await dbRun('DELETE FROM user_store_access WHERE userId = ?', [id])
    const now = new Date().toISOString()
    for (const storeId of toAdd) {
      await dbRun(
        'INSERT OR IGNORE INTO user_store_access (id, userId, storeId, createdAt) VALUES (?, ?, ?, ?)',
        [crypto.randomUUID(), id, storeId, now]
      )
    }
    res.json({ message: '已保存', accessStoreIds: toAdd })
  } catch (error) {
    console.error('保存用户店铺权限失败:', error)
    res.status(500).json({ error: '保存失败' })
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

// 创建用户 - 管理员可创建任意角色；经理只能创建运营或普通用户
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role: rawRole = 'user', status = 'active' } = req.body
    const allowedRoles = ['user', 'admin', 'operator', 'manager'] as const
    let role = allowedRoles.includes(rawRole) ? rawRole : 'user'
    if (req.user!.role === 'manager') {
      if (role !== 'operator' && role !== 'user') {
        return res.status(403).json({ error: '经理只能创建运营或普通用户账号' })
      }
    }

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

// 更新用户 - 管理员可更新任意用户；经理只能更新运营或普通用户
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, email, role: rawRole, status, password } = req.body
    const allowedRoles = ['user', 'admin', 'operator', 'manager'] as const
    let role = rawRole !== undefined ? (allowedRoles.includes(rawRole) ? rawRole : undefined) : undefined

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }
    if (req.user!.role === 'manager') {
      if (user.role !== 'operator' && user.role !== 'user') {
        return res.status(403).json({ error: '经理只能管理运营或普通用户账号' })
      }
      if (role !== undefined && role !== 'operator' && role !== 'user') {
        return res.status(403).json({ error: '经理只能将用户角色设为运营或普通用户' })
      }
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

// 删除用户 - 管理员可删除任意用户；经理只能删除运营或普通用户
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [id])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }
    if (req.user!.role === 'manager') {
      if (user.role !== 'operator' && user.role !== 'user') {
        return res.status(403).json({ error: '经理只能删除运营或普通用户账号' })
      }
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
