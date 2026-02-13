import express from 'express'
import { dbRun, dbGet } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'
import crypto from 'crypto'

const router = express.Router()

// 所有路由都需要认证
router.use(authenticate)

// 获取用户偏好设置
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId

    let preferences = await dbGet('SELECT * FROM user_preferences WHERE userId = ?', [userId])

    if (!preferences) {
      // 创建默认偏好设置
      const id = crypto.randomUUID()
      await dbRun(
        'INSERT INTO user_preferences (id, userId, preferences) VALUES (?, ?, ?)',
        [id, userId, '{}']
      )
      preferences = await dbGet('SELECT * FROM user_preferences WHERE userId = ?', [userId])
    }

    res.json({
      preferences: JSON.parse(preferences.preferences || '{}'),
    })
  } catch (error) {
    console.error('获取偏好设置失败:', error)
    res.status(500).json({ error: '获取偏好设置失败' })
  }
})

// 更新用户偏好设置
router.put('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { preferences } = req.body

    const existing = await dbGet('SELECT * FROM user_preferences WHERE userId = ?', [userId])

    if (existing) {
      await dbRun(
        'UPDATE user_preferences SET preferences = ?, updatedAt = ? WHERE userId = ?',
        [JSON.stringify(preferences), new Date().toISOString(), userId]
      )
    } else {
      const id = crypto.randomUUID()
      await dbRun(
        'INSERT INTO user_preferences (id, userId, preferences, updatedAt) VALUES (?, ?, ?, ?)',
        [id, userId, JSON.stringify(preferences), new Date().toISOString()]
      )
    }

    res.json({ message: '偏好设置已更新' })
  } catch (error) {
    console.error('更新偏好设置失败:', error)
    res.status(500).json({ error: '更新偏好设置失败' })
  }
})

export default router
