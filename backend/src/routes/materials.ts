import express from 'express'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'
import crypto from 'crypto'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const router = express.Router()

// 所有路由都需要认证
router.use(authenticate)

// 配置文件上传
const upload = multer({
  dest: path.join(__dirname, '../../uploads/'),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
})

// 确保上传目录存在
const uploadsDir = path.join(__dirname, '../../uploads/')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// 获取所有素材 - 普通用户只能看到自己商店的素材或自己创建的视频分析素材
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { storeId, videoId } = req.query
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    let query = `
      SELECT m.* FROM materials m
      LEFT JOIN stores s ON m.storeId = s.id
      WHERE 1=1
    `
    const params: any[] = []

    // 普通用户：自己商店的素材 或 自己创建的视频分析素材（m.userId = userId）
    if (!isAdmin) {
      query += ` AND (s.userId = ? OR m.userId = ?)`
      params.push(userId, userId)
    }

    if (storeId) {
      query += ' AND m.storeId = ?'
      params.push(storeId as string)
    }

    if (videoId) {
      query += ' AND m.videoId = ?'
      params.push(videoId as string)
    }

    query += ' ORDER BY m.createdAt DESC'

    const materials = await dbAll(query, params)
    res.json(materials)
  } catch (error) {
    console.error('获取素材列表失败:', error)
    res.status(500).json({ error: '获取素材列表失败' })
  }
})

// 获取单个素材
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const material = await dbGet('SELECT * FROM materials WHERE id = ?', [id])

    if (!material) {
      return res.status(404).json({ error: '素材不存在' })
    }

    res.json(material)
  } catch (error) {
    console.error('获取素材失败:', error)
    res.status(500).json({ error: '获取素材失败' })
  }
})

// 上传素材
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { name, type = 'video', storeId, description } = req.body
    const file = req.file

    if (!file && !req.body.url) {
      return res.status(400).json({ error: '请上传文件或提供URL' })
    }

    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const url = file ? `/uploads/${file.filename}` : req.body.url

    await dbRun(
      'INSERT INTO materials (id, name, type, url, storeId, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name || file?.originalname || '未命名素材', type, url, storeId || null, description || null, createdAt]
    )

    const newMaterial = await dbGet('SELECT * FROM materials WHERE id = ?', [id])
    res.status(201).json(newMaterial)
  } catch (error) {
    console.error('上传素材失败:', error)
    res.status(500).json({ error: '上传素材失败' })
  }
})

// 更新素材
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description } = req.body

    const material = await dbGet('SELECT * FROM materials WHERE id = ?', [id])

    if (!material) {
      return res.status(404).json({ error: '素材不存在' })
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description

    const updateFields = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ')
    const updateValues = Object.values(updates)

    await dbRun(`UPDATE materials SET ${updateFields} WHERE id = ?`, [...updateValues, id])

    const updatedMaterial = await dbGet('SELECT * FROM materials WHERE id = ?', [id])
    res.json(updatedMaterial)
  } catch (error) {
    console.error('更新素材失败:', error)
    res.status(500).json({ error: '更新素材失败' })
  }
})

// 删除素材
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const material = await dbGet('SELECT * FROM materials WHERE id = ?', [id])
    if (!material) {
      return res.status(404).json({ error: '素材不存在' })
    }

    // 删除文件（如果存在）
    if (material.url && material.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../', material.url)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    await dbRun('DELETE FROM materials WHERE id = ?', [id])
    res.json({ message: '素材已删除' })
  } catch (error) {
    console.error('删除素材失败:', error)
    res.status(500).json({ error: '删除素材失败' })
  }
})

export default router
