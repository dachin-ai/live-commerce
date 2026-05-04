import express from 'express'
import multer from 'multer'
import { authenticate, AuthRequest } from '../middleware/auth'
import { TtImportService } from '../services/TtImportService'
import { BadRequestError } from '../utils/errors'

const router = express.Router()
const service = new TtImportService()

// 用内存存储（解析后不落盘 Excel）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

router.use(authenticate)

/**
 * POST /api/tt-import/preview
 * 上传 Excel → 解析 → 返回预览（不写库）
 * Body(multipart): file, storeId, dateFrom?(可选), dateTo?(可选)
 */
router.post('/preview', upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) throw new BadRequestError('请上传 Excel 文件')
    const { storeId, dateFrom, dateTo } = req.body
    if (!storeId) throw new BadRequestError('请选择店铺')

    const result = await service.parsePreview(
      req.file.buffer,
      req.file.originalname,
      dateFrom,
      dateTo
    )
    res.json(result)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/tt-import/commit
 * 上传 Excel → 解析 → 覆盖写入数据库
 * Body(multipart): file, storeId, dateFrom?(可选), dateTo?(可选),
 *                  advertiserType?(self|influencer), adType?(live|video), contentType?(live_room|short_video)
 */
router.post('/commit', upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) throw new BadRequestError('请上传 Excel 文件')
    const { storeId, dateFrom, dateTo, advertiserType, adType, contentType, channelType } = req.body
    if (!storeId) throw new BadRequestError('请选择店铺')

    const result = await service.commitImport({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      storeId,
      importedBy: req.user!.userId,
      dateFrom,
      dateTo,
      advertiserType,
      adType,
      contentType,
      channelType,
    })
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/tt-import/history?storeId=xxx
 * 列出导入历史
 */
router.get('/history', async (req: AuthRequest, res, next) => {
  try {
    const storeId = req.query.storeId as string
    if (!storeId) throw new BadRequestError('请传入 storeId')
    const history = await service.listHistory(storeId)
    res.json(history)
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/tt-import/:importId
 * 回滚删除某次导入批次
 */
router.delete('/:importId', async (req: AuthRequest, res, next) => {
  try {
    const result = await service.rollbackImport(
      req.params.importId,
      req.user!.userId,
      req.user!.role
    )
    res.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
