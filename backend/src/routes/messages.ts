import express from 'express'
import { dbRun, dbAll, dbGet } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = express.Router()

/** 当前用户的站内信列表（支持 type 筛选） */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const type = req.query.type as string | undefined
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Number(req.query.offset) || 0

    let sql = 'SELECT * FROM in_app_messages WHERE userId = ?'
    const params: (string | number)[] = [userId]
    if (type && ['feedback_reply', 'system', 'version'].includes(type)) {
      sql += ' AND type = ?'
      params.push(type)
    }
    sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const rows = await dbAll(sql, params)
    res.json(rows)
  } catch (error) {
    console.error('获取站内信失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

/** 未读数量 */
router.get('/unread-count', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const row = await dbGet(
      'SELECT COUNT(*) AS c FROM in_app_messages WHERE userId = ? AND readAt IS NULL',
      [userId]
    )
    res.json({ count: (row as any)?.c ?? 0 })
  } catch (error) {
    console.error('获取未读数失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

/** 全部标为已读（用 POST 避免与 PATCH /:id/read 冲突） */
router.post('/read-all', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const now = new Date().toISOString()
    await dbRun(
      'UPDATE in_app_messages SET readAt = ? WHERE userId = ? AND readAt IS NULL',
      [now, userId]
    )
    res.json({ message: '已全部标为已读' })
  } catch (error) {
    console.error('全部已读失败:', error)
    res.status(500).json({ error: '操作失败' })
  }
})

/** 标为已读 */
router.patch('/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const id = req.params.id
    const now = new Date().toISOString()
    await dbRun(
      'UPDATE in_app_messages SET readAt = ? WHERE id = ? AND userId = ?',
      [now, id, userId]
    )
    res.json({ message: '已读' })
  } catch (error) {
    console.error('标为已读失败:', error)
    res.status(500).json({ error: '操作失败' })
  }
})

export default router
