import express from 'express'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'
import { StoreService } from '../services/StoreService'

const router = express.Router()
const storeService = new StoreService()

// GET / — 列表（搜索、分页、精简模式）
router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { search, page: pageStr, limit: limitStr, light: lightStr, region, platform } = req.query
    const page = Math.max(1, parseInt(String(pageStr || 1), 10))
    const limit = Math.min(100, Math.max(1, parseInt(String(limitStr || 50), 10)))
    const light = lightStr === '1' || lightStr === 'true'
    const regionVal = typeof region === 'string' ? region.trim() : Array.isArray(region) ? String(region[0] || '').trim() : ''
    const platformVal = typeof platform === 'string' ? platform.trim() : Array.isArray(platform) ? String(platform[0] || '').trim() : ''

    const result = await storeService.listStores({
      userId: req.user!.userId,
      role: req.user!.role,
      search: search ? String(search) : undefined,
      region: regionVal || undefined,
      platform: platformVal || undefined,
      page,
      limit,
      light,
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// GET /:id — 单个店铺
router.get('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const store = await storeService.getStore(req.params.id, req.user!.userId, req.user!.role)
    res.json(store)
  } catch (error) {
    next(error)
  }
})

// POST / — 创建店铺
router.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const store = await storeService.createStore(req.body, req.user!.userId, req.user!.role)
    res.status(201).json(store)
  } catch (error) {
    next(error)
  }
})

// PUT /:id — 更新店铺
router.put('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const store = await storeService.updateStore(req.params.id, req.body, req.user!.userId, req.user!.role)
    res.json(store)
  } catch (error) {
    next(error)
  }
})

// DELETE /:id — 删除店铺
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await storeService.deleteStore(req.params.id, req.user!.userId, req.user!.role)
    res.json({ message: '商店已删除' })
  } catch (error) {
    next(error)
  }
})

export default router
