import express from 'express'
import { cacheMiddleware } from '../middleware/cache'
import { authenticate } from '../middleware/auth'
import { StatsService } from '../services/StatsService'

const router = express.Router()
const statsService = new StatsService()

router.use(authenticate)
router.use(cacheMiddleware(5 * 60 * 1000))

router.get('/live', async (req, res, next) => {
  try {
    const result = await statsService.getLiveStats({
      timeRange: (req.query.timeRange as string) || 'week',
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      month: req.query.month as string | undefined,
      year: req.query.year as string | undefined,
      storeId: (req.query.storeId as string)?.trim() || undefined,
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

export default router
