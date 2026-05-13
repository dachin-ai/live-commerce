/**
 * 直播录屏视频上传与分析 API
 * POST /api/upload-video - 上传视频并触发异步 AI 分析
 * GET /api/videos - 列表
 * GET /api/videos/:id - 详情
 * DELETE /api/videos/:id - 软删除
 */

import express from 'express'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'
import { getScriptLLMAllowedUserIds, getScriptLLMEnabledFeatures } from '../services/scriptLLMConfig'
import crypto from 'crypto'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { videoAnalysisService } from '../services/videoAnalysisService'
import { normalizeVideoAnalysisParams } from '../constants/videoAnalysisParams'

const router = express.Router()
router.use(authenticate)

const MAX_VIDEO_SIZE = 500 * 1024 * 1024 // 500MB
const VALID_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']

const videosDir = path.join(__dirname, '../../uploads/videos')
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, videosDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4'
    const safe = (file.originalname || 'video').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80)
    const name = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safe}`
    cb(null, name.endsWith(ext) ? name : name + ext)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (VALID_VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('仅支持 MP4、WebM、MOV、AVI、MKV 格式'))
    }
  },
})

function getVideoBaseUrl(): string {
  const base = process.env.API_BASE_URL || process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
  return base.replace(/\/$/, '')
}

// POST /api/upload-video
router.post('/upload-video', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: '请选择视频文件' })
    }

    const userId = req.user!.userId
    const allowedUserIds = await getScriptLLMAllowedUserIds()
    const enabledFeatures = await getScriptLLMEnabledFeatures()
    const hasUserAccess = allowedUserIds === null || allowedUserIds.includes(userId)
    const videoEnabled = enabledFeatures === null || enabledFeatures.includes('video')
    if (!hasUserAccess || !videoEnabled) {
      return res.status(403).json({
        error: '您暂无视频分析权限，请联系管理员在「权限配置 → LLM 配置」中勾选「视频分析」并指定可使用用户',
      })
    }

    const storeId = (req.body.storeId as string)?.trim() || null
    const sessionId = (req.body.sessionId as string)?.trim() || null

    // 标准化入参：platform、country、video_type、analysis_focus（参考 LLM 入参文档）
    const inputParams = normalizeVideoAnalysisParams({
      platform: req.body.platform,
      country: req.body.country,
      videoType: req.body.videoType,
      analysisFocus: req.body.analysisFocus,
    })

    const videoId = crypto.randomUUID()
    const fileKey = `videos/${file.filename}`
    const baseUrl = getVideoBaseUrl()
    const videoUrl = `${baseUrl}/uploads/${fileKey.replace('videos/', 'videos/')}`

    await dbRun(
      `INSERT INTO videos (id, userId, shopId, sessionId, fileName, fileKey, videoUrl, fileSize, contentType, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', NOW())`,
      [videoId, userId, storeId || null, sessionId || null, file.originalname, fileKey, videoUrl, file.size, file.mimetype]
    )

    // 异步 AI 分析（不阻塞响应）
    setImmediate(async () => {
      try {
        if (videoUrl.includes('localhost') || videoUrl.includes('127.0.0.1')) {
          throw new Error('LOCALHOST_URL')
        }
        let lang: 'zh-CN' | 'th-TH' | 'en-US' = 'zh-CN'
        try {
          const user = await dbGet<{ language?: string }>('SELECT language FROM users WHERE id = ?', [userId])
          const l = user?.language
          if (l === 'th-TH' || l === 'en-US') lang = l
          else if (typeof l === 'string' && l.startsWith('th')) lang = 'th-TH'
          else if (typeof l === 'string' && l.startsWith('en')) lang = 'en-US'
        } catch {
          // 忽略，使用默认 zh-CN
        }

        const result = await videoAnalysisService.analyzeVideo(videoUrl, storeId || undefined, lang, userId, inputParams)

        await dbRun(`UPDATE videos SET status = 'active', description = ? WHERE id = ?`, [
          result.overallSummary?.slice(0, 2000) || null,
          videoId,
        ])

        for (const m of result.excellentMoments) {
          const matId = crypto.randomUUID()
          const tags = JSON.stringify(['优秀案例'])
          const metadata = JSON.stringify({
            startTime: m.startTime,
            score: m.score,
            script: m.script || '',
            fullAnalysis: m,
          })
          await dbRun(
            `INSERT INTO materials (id, name, type, url, storeId, userId, title, content, videoId, tags, rating, metadata, description, createdAt)
             VALUES (?, ?, 'excellent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              matId,
              m.title || '优秀片段',
              videoUrl,
              storeId,
              userId,
              m.title || '优秀片段',
              `${m.startTime} - ${m.description || ''}`,
              videoId,
              tags,
              m.score ?? null,
              metadata,
              m.script || m.description || null,
            ]
          )
        }

        for (const p of result.problemMoments) {
          const matId = crypto.randomUUID()
          const tags = JSON.stringify(['问题片段'])
          const metadata = JSON.stringify({
            startTime: p.startTime,
            severity: p.severity,
            script: p.script || '',
            fullAnalysis: p,
          })
          await dbRun(
            `INSERT INTO materials (id, name, type, url, storeId, userId, title, content, videoId, tags, metadata, description, createdAt)
             VALUES (?, ?, 'problem', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              matId,
              p.title || '问题片段',
              videoUrl,
              storeId,
              userId,
              p.title || '问题片段',
              `${p.startTime} - ${p.description || ''}`,
              videoId,
              tags,
              metadata,
              p.script || p.description || null,
            ]
          )
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error('视频 AI 分析失败:', err)
        let userMsg = errMsg
        if (errMsg === 'LOCALHOST_URL' || videoUrl.includes('localhost') || videoUrl.includes('127.0.0.1')) {
          userMsg = 'Vision 模型无法访问本地地址。请在 backend/.env 中配置 API_BASE_URL 或 PUBLIC_URL 为公网可访问地址（如 ngrok 或部署域名）后重试。'
        } else if (errMsg.includes('需要配置') || errMsg.includes('LLM')) {
          userMsg = '视频分析需要配置支持视觉的 LLM。管理员请在「LLM 配置」中为「视频分析」指定 Vision 模型。'
        } else if (errMsg.includes('超时')) {
          userMsg = '分析超时，视频可能较大，请稍后重试。'
        }
        await dbRun(`UPDATE videos SET status = 'failed', description = ? WHERE id = ?`, [userMsg, videoId])
      }
    })

    res.status(201).json({
      success: true,
      videoId,
      videoUrl,
      message: '视频上传成功，分析正在进行中',
    })
  } catch (err: any) {
    console.error('上传视频失败:', err)
    if (err.message?.includes('仅支持')) {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '视频大小不能超过 500MB' })
    }
    res.status(500).json({ error: err.message || '上传失败' })
  }
})

// GET /api/videos
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    let query = `SELECT * FROM videos WHERE deletedAt IS NULL`
    const params: any[] = []

    if (!isAdmin) {
      query += ` AND userId = ?`
      params.push(userId)
    }
    if (storeId) {
      query += ` AND shopId = ?`
      params.push(storeId as string)
    }

    query += ` ORDER BY createdAt DESC`
    const rows = await dbAll(query, params)
    res.json(rows)
  } catch (err) {
    console.error('获取视频列表失败:', err)
    res.status(500).json({ error: '获取视频列表失败' })
  }
})

// GET /api/videos/:id
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    const row = await dbGet('SELECT * FROM videos WHERE id = ? AND deletedAt IS NULL', [id])
    if (!row) {
      return res.status(404).json({ error: '视频不存在' })
    }
    if (!isAdmin && (row as any).userId !== userId) {
      return res.status(403).json({ error: '无权限查看' })
    }
    res.json(row)
  } catch (err) {
    console.error('获取视频详情失败:', err)
    res.status(500).json({ error: '获取视频详情失败' })
  }
})

// DELETE /api/videos/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    const row = await dbGet('SELECT * FROM videos WHERE id = ? AND deletedAt IS NULL', [id])
    if (!row) {
      return res.status(404).json({ error: '视频不存在' })
    }
    if (!isAdmin && (row as any).userId !== userId) {
      return res.status(403).json({ error: '无权限删除' })
    }

    await dbRun(`UPDATE videos SET deletedAt = NOW() WHERE id = ?`, [id])
    res.json({ message: '已删除' })
  } catch (err) {
    console.error('删除视频失败:', err)
    res.status(500).json({ error: '删除视频失败' })
  }
})

export default router
