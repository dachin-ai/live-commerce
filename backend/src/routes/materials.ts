import express from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { MaterialRepository } from '../repositories/MaterialRepository'
import { NotFoundError, BadRequestError } from '../utils/errors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const router = express.Router()
const materialRepo = new MaterialRepository()

router.use(authenticate)

// 文件上传配置（与 HTTP 层强相关，保留在路由层）
const upload = multer({
  dest: path.join(__dirname, '../../uploads/'),
  limits: { fileSize: 100 * 1024 * 1024 },
})
const uploadsDir = path.join(__dirname, '../../uploads/')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

// GET / — 列表
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const materials = await materialRepo.findAll({
      userId: req.user!.userId,
      isAdmin: req.user!.role === 'admin',
      storeId: req.query.storeId as string | undefined,
      videoId: req.query.videoId as string | undefined,
    })
    res.json(materials)
  } catch (error) { next(error) }
})

// GET /:id
router.get('/:id', async (req, res, next) => {
  try {
    const material = await materialRepo.findById(req.params.id)
    if (!material) throw new NotFoundError('素材不存在')
    res.json(material)
  } catch (error) { next(error) }
})

// POST / — 上传
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file
    if (!file && !req.body.url) throw new BadRequestError('请上传文件或提供URL')
    const url = file ? `/uploads/${file.filename}` : req.body.url
    const material = await materialRepo.create({
      name: req.body.name || file?.originalname || '未命名素材',
      type: req.body.type || 'video',
      url,
      storeId: req.body.storeId,
      description: req.body.description,
    })
    res.status(201).json(material)
  } catch (error) { next(error) }
})

// PUT /:id
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await materialRepo.findById(req.params.id)
    if (!existing) throw new NotFoundError('素材不存在')
    const updates: Record<string, unknown> = {}
    if (req.body.name !== undefined) updates.name = req.body.name
    if (req.body.description !== undefined) updates.description = req.body.description
    const updated = await materialRepo.update(req.params.id, updates)
    res.json(updated)
  } catch (error) { next(error) }
})

// DELETE /:id
router.delete('/:id', async (req, res, next) => {
  try {
    const material = await materialRepo.findById(req.params.id)
    if (!material) throw new NotFoundError('素材不存在')
    if (material.url && material.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../../', material.url)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    await materialRepo.delete(req.params.id)
    res.json({ message: '素材已删除' })
  } catch (error) { next(error) }
})

export default router
