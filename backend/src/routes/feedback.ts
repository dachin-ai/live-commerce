import express from 'express'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = express.Router()

const feedbackUploadDir = path.join(__dirname, '../../uploads/feedback')
if (!fs.existsSync(feedbackUploadDir)) {
  fs.mkdirSync(feedbackUploadDir, { recursive: true })
}

const feedbackUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, feedbackUploadDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^a-z]/g, '')
      cb(null, `${crypto.randomUUID()}${ext || '.jpg'}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)
    cb(null, !!ok)
  },
})

export type FeedbackType = 'problem' | 'feature' | 'other'
export type FeedbackStatus = 'pending' | 'read' | 'replied'

/** 反馈图片访问（须在 /:id 之前定义） */
router.get('/uploads/:filename', (req, res) => {
  // 取纯文件名，防止路径组件注入
  const filename = path.basename(req.params.filename || '')
  if (!filename) return res.status(400).end()

  // 绝对路径边界断言：无论文件名如何编码，解析路径必须在上传目录内
  const filePath = path.resolve(feedbackUploadDir, filename)
  if (!filePath.startsWith(feedbackUploadDir + path.sep) && filePath !== feedbackUploadDir) {
    return res.status(400).end()
  }

  if (!fs.existsSync(filePath)) return res.status(404).end()

  // 在响应头中明确设置安全的 Content-Type，防止 MIME 嗅探攻击
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'")
  res.sendFile(filePath)
})


/** 上传反馈图片（需登录），返回可用于提交反馈的 url 列表 */
router.post('/upload-image', authenticate, feedbackUpload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片文件' })
  const url = `/api/feedback/uploads/${req.file.filename}`
  res.json({ url, filename: req.file.filename })
})

/** 提交反馈（需登录，客服/用户均可提交） */
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { type, subject, content, contact, imageUrls } = req.body
    const rawType = (type === 'feature' || type === 'other' ? type : 'problem') as FeedbackType
    const rawSubject = typeof subject === 'string' ? subject.trim() : ''
    const rawContent = typeof content === 'string' ? content.trim() : ''
    const rawContact = typeof contact === 'string' ? contact.trim() : undefined
    const rawImageUrls = Array.isArray(imageUrls) ? imageUrls.filter((u: any) => typeof u === 'string') : []

    if (!rawSubject) {
      return res.status(400).json({ error: '请输入反馈主题' })
    }
    if (!rawContent) {
      return res.status(400).json({ error: '请输入反馈内容' })
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const imageUrlsJson = rawImageUrls.length ? JSON.stringify(rawImageUrls) : null
    try {
      await dbRun(
        `INSERT INTO feedback (id, userId, type, subject, content, contact, status, createdAt, updatedAt, imageUrls)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [id, userId, rawType, rawSubject, rawContent, rawContact || null, now, now, imageUrlsJson]
      )
    } catch (e: any) {
      if (e?.message?.includes('no such column') && imageUrlsJson !== null) {
        await dbRun(
          `INSERT INTO feedback (id, userId, type, subject, content, contact, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [id, userId, rawType, rawSubject, rawContent, rawContact || null, now, now]
        )
      } else throw e
    }
    console.info('[反馈] 已提交:', id, 'type=', rawType, 'subject=', rawSubject.slice(0, 30))

    res.status(201).json({ id, message: '反馈已提交' })
  } catch (error: any) {
    console.error('提交反馈失败:', error)
    const msg = error?.message?.includes('no such table') ? '反馈表未初始化，请重启后端服务' : '提交失败'
    res.status(500).json({ error: msg })
  }
})

/** 管理员：获取反馈列表（支持按类型、状态筛选） */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: '仅管理员可查看反馈列表' })
    }

    const category = req.query.category as string | undefined
    const status = req.query.status as string | undefined

    let sql = `
      SELECT f.id, f.userId, f.type, f.subject, f.content, f.contact, f.status, f.createdAt, f.updatedAt,
             f.replyContent, f.replyAt, f.imageUrls,
             u.name AS userName, u.email AS userEmail
      FROM feedback f
      LEFT JOIN users u ON f.userId = u.id
      WHERE 1=1
    `
    const params: string[] = []
    if (category && category !== 'all' && ['problem', 'feature', 'other'].includes(category)) {
      sql += ' AND f.type = ?'
      params.push(category)
    }
    if (status && status !== 'all' && ['pending', 'read', 'replied'].includes(status)) {
      sql += ' AND f.status = ?'
      params.push(status)
    }
    sql += ' ORDER BY f.createdAt DESC'

    const rows = await dbAll(sql, params)
    console.info('[反馈] 列表查询:', rows.length, '条', category !== 'all' ? `category=${category}` : '', status !== 'all' ? `status=${status}` : '')
    res.json(rows)
  } catch (error: any) {
    console.error('获取反馈列表失败:', error)
    const msg = error?.message?.includes('no such table') ? '反馈表未初始化，请重启后端服务' : '获取失败'
    res.status(500).json({ error: msg })
  }
})

/** 管理员：更新反馈状态（已读/已回复），或填写回复内容 */
router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: '仅管理员可操作' })
    }
    const { status, replyContent } = req.body
    const id = req.params.id
    const now = new Date().toISOString()

    if (typeof replyContent === 'string' && replyContent.trim()) {
      try {
        const fb = await dbGet('SELECT userId, subject FROM feedback WHERE id = ?', [id]) as { userId: string | null; subject: string } | undefined
        await dbRun(
          'UPDATE feedback SET status = ?, replyContent = ?, replyAt = ?, updatedAt = ? WHERE id = ?',
          ['replied', replyContent.trim(), now, now, id]
        )
        if (fb?.userId) {
          const msgId = crypto.randomUUID()
          const extra = JSON.stringify({ feedbackId: id })
          await dbRun(
            `INSERT INTO in_app_messages (id, userId, type, title, content, linkUrl, createdAt, extra)
             VALUES (?, ?, 'feedback_reply', ?, ?, ?, ?, ?)`,
            [msgId, fb.userId, `反馈回复：${(fb.subject || '').slice(0, 50)}`, replyContent.trim(), '/messages', now, extra]
          )
        }
      } catch (err: any) {
        if (err?.message?.includes('no such column')) {
          return res.status(503).json({ error: '反馈表结构需要更新，请重启后端服务后再试' })
        }
        if (err?.message?.includes('no such table: in_app_messages')) {
          await dbRun(
            'UPDATE feedback SET status = ?, replyContent = ?, replyAt = ?, updatedAt = ? WHERE id = ?',
            ['replied', replyContent.trim(), now, now, id]
          )
          return res.json({ message: '回复已保存' })
        }
        throw err
      }
      return res.json({ message: '回复已保存' })
    }
    if (status && ['pending', 'read', 'replied'].includes(status)) {
      await dbRun('UPDATE feedback SET status = ?, updatedAt = ? WHERE id = ?', [status, now, id])
      return res.json({ message: '已更新' })
    }
    return res.status(400).json({ error: '请提供 status 或 replyContent' })
  } catch (error) {
    console.error('更新反馈失败:', error)
    res.status(500).json({ error: '更新失败' })
  }
})

/** 管理员：删除反馈 */
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const role = req.user!.role
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: '仅管理员可操作' })
    }
    const id = req.params.id
    await dbRun('DELETE FROM feedback WHERE id = ?', [id])
    res.json({ message: '已删除' })
  } catch (error) {
    console.error('删除反馈失败:', error)
    res.status(500).json({ error: '删除失败' })
  }
})

export default router
