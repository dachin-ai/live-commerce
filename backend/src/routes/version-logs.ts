import express from 'express'
import { dbRun, dbAll, dbGet } from '../db'
import crypto from 'crypto'
import { authenticate, requireAdmin } from '../middleware/auth'

const router = express.Router()

// 获取版本更新日志（公开只读）
router.get('/', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query
    const logs = await dbAll(
      'SELECT * FROM version_logs ORDER BY createdAt DESC LIMIT ? OFFSET ?',
      [Number(limit), Number(offset)]
    )
    res.json(logs)
  } catch (error) {
    console.error('获取版本日志失败:', error)
    res.status(500).json({ error: '获取版本日志失败' })
  }
})

// 获取单个版本日志
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const log = await dbGet('SELECT * FROM version_logs WHERE id = ?', [id])
    
    if (!log) {
      return res.status(404).json({ error: '版本日志不存在' })
    }
    
    res.json(log)
  } catch (error) {
    console.error('获取版本日志失败:', error)
    res.status(500).json({ error: '获取版本日志失败' })
  }
})

// 创建版本日志（仅管理员）
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { version, title, content, type = 'feature' } = req.body

    if (!version || !title || !content) {
      return res.status(400).json({ error: '版本号、标题和内容不能为空' })
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    await dbRun(
      'INSERT INTO version_logs (id, version, title, content, type, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [id, version, title, content, type, createdAt]
    )

    const newLog = await dbGet('SELECT * FROM version_logs WHERE id = ?', [id])
    res.status(201).json(newLog)
  } catch (error) {
    console.error('创建版本日志失败:', error)
    res.status(500).json({ error: '创建版本日志失败' })
  }
})

export default router
