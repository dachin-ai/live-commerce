import express from 'express'
import { cacheMiddleware } from '../middleware/cache'
import { authenticate, AuthRequest } from '../middleware/auth'
import { dbGet, dbAll } from '../db'

const router = express.Router()

// 所有路由都需要认证
router.use(authenticate)

// 应用缓存中间件（5分钟TTL）
router.use(cacheMiddleware(5 * 60 * 1000))

// 模拟数据 - 实际项目中应该从数据库获取
const mockStats = {
  totalGMV: 1250000,
  totalDuration: 28.5,
  totalViewers: 12845,
  activeViewers: 3240,
  totalInteractions: 45892,
  totalOrders: 24791, // 总订单数
  completedOrders: 326, // 成交订单
  averageDailyDuration: 0.02, // 日均直播时长（小时）
  rounds: 312, // 总场次
  averageConversionRate: 2.54,
  averageDurationPerRound: 1.02,
  gmvPerHour: 43860,
  averageDurationPerDay: 4.07,
  roundsPerDay: 4,
  previousPeriod: {
    totalGMV: 980000,
    totalDuration: 24.0,
    activeViewers: 2800,
    totalOrders: 20000,
    completedOrders: 280,
    averageDailyDuration: 0.01,
    rounds: 280,
    averageConversionRate: 2.1,
    averageDurationPerRound: 0.96,
    gmvPerHour: 40833,
    averageDurationPerDay: 3.5,
    roundsPerDay: 3,
  },
}

// 根据 timeRange 或 dateFrom/dateTo 计算查询日期范围（YYYY-MM-DD）
// 符合用户习惯：本周=自然周(周一～周日)、本月=自然月、本季度=自然季度、本年=自然年
function getDateRange(
  timeRange: string,
  dateFrom?: string,
  dateTo?: string
): { dateFrom: string; dateTo: string } {
  const today = new Date()
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (timeRange === 'custom') {
    const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : toStr(today)
    const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : toStr(today)
    return { dateFrom: from, dateTo: to }
  }
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const dayOfWeek = today.getDay() // 0=周日, 1=周一, ..., 6=周六

  switch (timeRange) {
    case 'today':
      return { dateFrom: toStr(today), dateTo: toStr(today) }
    case 'week': {
      // 自然周：周一为第一天，周日为最后一天
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      const monday = new Date(y, m, d - daysToMonday)
      const sunday = new Date(y, m, d - daysToMonday + 6)
      return { dateFrom: toStr(monday), dateTo: toStr(sunday) }
    }
    case 'month': {
      // 本月：本月1日 ～ 本月最后一天
      const firstDay = new Date(y, m, 1)
      const lastDay = new Date(y, m + 1, 0)
      return { dateFrom: toStr(firstDay), dateTo: toStr(lastDay) }
    }
    case 'quarter': {
      // 本季度：本季度第一天 ～ 本季度最后一天（Q1=1-3月, Q2=4-6月, Q3=7-9月, Q4=10-12月）
      const qStartMonth = Math.floor(m / 3) * 3
      const qEndMonth = qStartMonth + 3
      const firstDay = new Date(y, qStartMonth, 1)
      const lastDay = new Date(y, qEndMonth, 0)
      return { dateFrom: toStr(firstDay), dateTo: toStr(lastDay) }
    }
    case 'year': {
      // 本年：1月1日 ～ 12月31日
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` }
    }
    default:
      // 兜底：最近 7 天
      const from = new Date(y, m, d - 6)
      return { dateFrom: toStr(from), dateTo: toStr(today) }
  }
}

// 空统计结构（无数据时返回，保证店铺间信息隔离）
function emptyStats(timeRange: string) {
  const periodFactor: Record<string, number> = {
    today: 0.15,
    week: 1,
    month: 4.3,
    quarter: 13,
    year: 52,
  }
  const factor = periodFactor[timeRange] ?? 1
  return {
    totalGMV: 0,
    totalDuration: 0,
    totalViewers: 0,
    activeViewers: 0,
    totalInteractions: 0,
    totalOrders: 0,
    completedOrders: 0,
    averageDailyDuration: 0,
    rounds: 0,
    averageConversionRate: 0,
    averageDurationPerRound: 0,
    gmvPerHour: 0,
    averageDurationPerDay: 0,
    roundsPerDay: 0,
    previousPeriod: {
      totalGMV: 0,
      totalDuration: 0,
      activeViewers: 0,
      totalOrders: 0,
      completedOrders: 0,
      averageDailyDuration: 0,
      rounds: 0,
      averageConversionRate: 0,
      averageDurationPerRound: 0,
      gmvPerHour: 0,
      averageDurationPerDay: 0,
      roundsPerDay: 0,
      avgWatchDurationMinutes: 0,
      gpm: 0,
    },
    yearOverYearPeriod: {
      totalGMV: 0,
      totalDuration: 0,
      activeViewers: 0,
      totalOrders: 0,
      completedOrders: 0,
      averageDailyDuration: 0,
      rounds: 0,
      averageConversionRate: 0,
      averageDurationPerRound: 0,
      gmvPerHour: 0,
      averageDurationPerDay: 0,
      roundsPerDay: 0,
      avgWatchDurationMinutes: 0,
      gpm: 0,
    },
    avgWatchDurationMinutes: 0,
    gpm: 0,
    trend: [] as { date: string; value: number }[],
  }
}

// 根据月份 YYYY-MM 或年份 YYYY 计算日期范围
function getDateRangeFromMonthOrYear(
  month?: string,
  year?: string
): { dateFrom: string; dateTo: string } | null {
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 0)
    return { dateFrom: toStr(from), dateTo: toStr(to) }
  }
  if (year && /^\d{4}$/.test(year)) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` }
  }
  return null
}

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 环比：上一周期（与当前区间等长、结束于当前开始前一天） */
function getPreviousPeriodRange(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return { dateFrom, dateTo }
  }
  const from = new Date(dateFrom + 'T00:00:00')
  const to = new Date(dateTo + 'T00:00:00')
  const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - days + 1)
  return { dateFrom: toStr(prevFrom), dateTo: toStr(prevTo) }
}

/** 同比：去年同期（与当前区间等长、整体前移一年） */
function getYearOverYearRange(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return { dateFrom, dateTo }
  }
  const from = new Date(dateFrom + 'T00:00:00')
  const to = new Date(dateTo + 'T00:00:00')
  from.setFullYear(from.getFullYear() - 1)
  to.setFullYear(to.getFullYear() - 1)
  return { dateFrom: toStr(from), dateTo: toStr(to) }
}

// 将客户端可能传来的 YYYY/MM/DD 或 YYYY-MM-DD 规范为 YYYY-MM-DD
function normalizeDateParam(s: string | undefined): string {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim().replace(/\//g, '-')
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return t.slice(0, 10)
  return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`
}

// 将月份参数规范为 YYYY-MM（选择月份与选择年份均走 date >= dateFrom AND date <= dateTo 的按日汇总）
function normalizeMonthParam(s: string | undefined): string {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim().replace(/\//g, '-')
  const parts = t.split('-')
  if (parts.length < 2) return t.slice(0, 7)
  const y = parts[0].replace(/\D/g, '')
  const m = parts[1].replace(/\D/g, '')
  if (y.length !== 4 || !m) return t.slice(0, 7)
  return `${y}-${String(parseInt(m, 10)).padStart(2, '0')}`
}

// 获取直播统计数据（支持 timeRange、dateFrom/dateTo、month、year、storeId）
router.get('/live', async (req, res) => {
  try {
    const timeRange = (req.query.timeRange as string) || 'week'
    const dateFromQ = normalizeDateParam(req.query.dateFrom as string)
    const dateToQ = normalizeDateParam(req.query.dateTo as string)
    const monthQ = normalizeMonthParam((req.query.month as string)?.trim())
    const yearQ = (req.query.year as string)?.trim()
    const storeId = (req.query.storeId as string)?.trim() || undefined

    let dateFrom: string
    let dateTo: string

    // 选择月份 / 选择年份：与本周/自定义等一致，均按 date >= dateFrom AND date <= dateTo 汇总该区间内所有按日写入的 stats
    if (timeRange === 'monthPick' && monthQ) {
      const range = getDateRangeFromMonthOrYear(monthQ, undefined)
      if (!range) return res.json(emptyStats('week'))
      dateFrom = range.dateFrom
      dateTo = range.dateTo
    } else if (timeRange === 'yearPick' && yearQ) {
      const range = getDateRangeFromMonthOrYear(undefined, yearQ)
      if (!range) return res.json(emptyStats('week'))
      dateFrom = range.dateFrom
      dateTo = range.dateTo
    } else {
      const range = getDateRange(timeRange, dateFromQ, dateToQ)
      if (timeRange === 'custom' && (!dateFromQ || !dateToQ)) {
        return res.json(emptyStats('week'))
      }
      dateFrom = range.dateFrom
      dateTo = range.dateTo
    }

    await new Promise((resolve) => setTimeout(resolve, 100))

    // 有 storeId 时：从 stats 表按店铺与日期范围查询并聚合；同时查环比（上一周期）与同比（去年同期）
    if (storeId) {
      type AggRow = {
        totalGMV: number
        totalDuration: number
        totalViewers: number
        activeViewers: number
        totalInteractions: number
        totalOrders: number
        completedOrders: number
        rounds: number
        averageConversionRate: number
        averageDurationPerRound: number
        gmvPerHour: number
        averageDurationPerDay: number
        roundsPerDay: number
        likes: number
        comments: number
        shares: number
        follows: number
        productViews: number
        productClicks: number
        clickThroughRate: number
        interactionRate: number
      }
      const aggSelect = `SELECT 
        COALESCE(SUM(totalGMV), 0) as totalGMV,
        COALESCE(SUM(totalDuration), 0) as totalDuration,
        COALESCE(SUM(totalViewers), 0) as totalViewers,
        COALESCE(SUM(activeViewers), 0) as activeViewers,
        COALESCE(SUM(totalInteractions), 0) as totalInteractions,
        COALESCE(SUM(totalOrders), 0) as totalOrders,
        COALESCE(SUM(completedOrders), 0) as completedOrders,
        COALESCE(SUM(rounds), 0) as rounds,
        AVG(averageConversionRate) as averageConversionRate,
        AVG(averageDurationPerRound) as averageDurationPerRound,
        AVG(gmvPerHour) as gmvPerHour,
        AVG(averageDurationPerDay) as averageDurationPerDay,
        AVG(roundsPerDay) as roundsPerDay,
        COALESCE(SUM(likes), 0) as likes,
        COALESCE(SUM(comments), 0) as comments,
        COALESCE(SUM(shares), 0) as shares,
        COALESCE(SUM(follows), 0) as follows,
        COALESCE(SUM(productViews), 0) as productViews,
        COALESCE(SUM(productClicks), 0) as productClicks,
        AVG(clickThroughRate) as clickThroughRate,
        AVG(interactionRate) as interactionRate
      FROM stats WHERE storeId = ? AND date >= ? AND date <= ?`
      const sql = aggSelect
      const currentParams = [storeId, dateFrom, dateTo]
      const [currentRows, trendRows, prevRange, yoyRange] = await Promise.all([
        dbAll<AggRow>(sql, currentParams),
        dbAll<{ date: string; value: number }>(
          `SELECT date, COALESCE(SUM(totalGMV), 0) as value
           FROM stats WHERE storeId = ? AND date >= ? AND date <= ? AND date IS NOT NULL
           GROUP BY date ORDER BY date`,
          currentParams
        ),
        getPreviousPeriodRange(dateFrom, dateTo),
        getYearOverYearRange(dateFrom, dateTo),
      ])
      const agg = currentRows?.[0]
      const trend = (trendRows || []).map((r) => ({
        date: String(r.date),
        value: Number(r.value) || 0,
      }))

      if (!agg) {
        return res.json({ ...emptyStats(timeRange), trend })
      }
      const totalGMV = Number(agg.totalGMV) || 0
      const totalDuration = Number(agg.totalDuration) || 0
      const totalViewers = Number(agg.totalViewers) || 0
      const totalOrders = Number(agg.totalOrders) || 0
      const rounds = Number(agg.rounds) || 0
      const completedOrders = Number(agg.completedOrders) || 0
      const gmvPerHour = totalDuration > 0 ? totalGMV / totalDuration : 0
      const averageConversionRate = totalViewers > 0 ? (completedOrders / totalViewers) * 100 : 0
      const averageDurationPerRound = rounds > 0 ? totalDuration / rounds : 0
      const totalDurationMinutes = totalDuration * 60
      const avgWatchDurationMinutes = totalViewers > 0 ? totalDurationMinutes / totalViewers : 0
      const gpm = totalViewers > 0 ? (totalGMV / totalViewers) * 1000 : 0

      const prevParams = [storeId, prevRange.dateFrom, prevRange.dateTo]
      const yoyParams = [storeId, yoyRange.dateFrom, yoyRange.dateTo]
      const [prevRows, yoyRows] = await Promise.all([
        dbAll<AggRow>(aggSelect, prevParams),
        dbAll<AggRow>(aggSelect, yoyParams),
      ])
      const prevAgg = prevRows?.[0]
      const yoyAgg = yoyRows?.[0]

      const buildPeriod = (row: AggRow | undefined) => {
        if (!row) {
          return {
            totalGMV: 0,
            totalDuration: 0,
            activeViewers: 0,
            totalOrders: 0,
            completedOrders: 0,
            rounds: 0,
            averageConversionRate: 0,
            averageDurationPerRound: 0,
            gmvPerHour: 0,
            averageDurationPerDay: 0,
            roundsPerDay: 0,
            avgWatchDurationMinutes: 0,
            gpm: 0,
          }
        }
        const g = Number(row.totalGMV) || 0
        const dur = Number(row.totalDuration) || 0
        const v = Number(row.totalViewers) || 0
        const ord = Number(row.totalOrders) || 0
        const rnd = Number(row.rounds) || 0
        const comp = Number(row.completedOrders) || 0
        return {
          totalGMV: g,
          totalDuration: dur,
          activeViewers: Number(row.activeViewers) || 0,
          totalOrders: ord,
          completedOrders: comp,
          rounds: rnd,
          averageConversionRate: v > 0 ? (comp / v) * 100 : 0,
          averageDurationPerRound: rnd > 0 ? dur / rnd : 0,
          gmvPerHour: dur > 0 ? g / dur : 0,
          averageDurationPerDay: Number(row.averageDurationPerDay) || 0,
          roundsPerDay: Number(row.roundsPerDay) || 0,
          avgWatchDurationMinutes: v > 0 ? (dur * 60) / v : 0,
          gpm: v > 0 ? (g / v) * 1000 : 0,
        }
      }
      const previousPeriod = buildPeriod(prevAgg)
      const yearOverYearPeriod = buildPeriod(yoyAgg)

      res.json({
        totalGMV,
        totalDuration,
        totalViewers,
        activeViewers: Number(agg.activeViewers) || 0,
        totalInteractions: Number(agg.totalInteractions) || 0,
        totalOrders,
        completedOrders,
        averageDailyDuration: Number(agg.averageDurationPerDay) || 0,
        rounds,
        averageConversionRate,
        averageDurationPerRound,
        gmvPerHour,
        averageDurationPerDay: Number(agg.averageDurationPerDay) || 0,
        roundsPerDay: Number(agg.roundsPerDay) || 0,
        avgWatchDurationMinutes,
        gpm,
        likes: Number(agg.likes) || 0,
        comments: Number(agg.comments) || 0,
        shares: Number(agg.shares) || 0,
        follows: Number(agg.follows) || 0,
        productViews: Number(agg.productViews) || 0,
        productClicks: Number(agg.productClicks) || 0,
        clickThroughRate: Number(agg.clickThroughRate) || 0,
        interactionRate: Number(agg.interactionRate) || 0,
        previousPeriod,
        yearOverYearPeriod,
        trend,
      })
      return
    }

    // 无 storeId 时：返回模拟数据（兼容未选店铺时的展示），并按周期变化
    const periodFactor: Record<string, number> = {
      today: 0.15,
      week: 1,
      month: 4.3,
      quarter: 13,
      year: 52,
    }
    const factor = periodFactor[timeRange] ?? 1
    const daysInRange = timeRange === 'today' ? 1 : timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : timeRange === 'quarter' ? 90 : 365
    const baseGMV = Math.round(mockStats.totalGMV * factor) / Math.max(1, daysInRange)
    const trend: { date: string; value: number }[] = []
    const today = new Date()
    for (let i = daysInRange - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      trend.push({
        date: d.toISOString().slice(0, 10),
        value: Math.round(baseGMV * (0.8 + Math.random() * 0.4)),
      })
    }
    const totalV = Math.round(mockStats.totalViewers * factor)
    const totalD = Math.round(mockStats.totalDuration * factor * 10) / 10
    const totalG = Math.round(mockStats.totalGMV * factor)
    const stats = {
      ...mockStats,
      totalGMV: totalG,
      totalDuration: totalD,
      totalViewers: totalV,
      totalOrders: Math.round(mockStats.totalOrders * factor),
      rounds: Math.round(mockStats.rounds * factor),
      avgWatchDurationMinutes: totalV > 0 ? (totalD * 60) / totalV : 0,
      gpm: totalV > 0 ? (totalG / totalV) * 1000 : 0,
      previousPeriod: {
        ...mockStats.previousPeriod,
        totalGMV: Math.round(mockStats.previousPeriod.totalGMV * factor * 0.9),
        totalDuration: Math.round(mockStats.previousPeriod.totalDuration * factor * 0.9 * 10) / 10,
        totalOrders: Math.round((mockStats.previousPeriod.totalOrders ?? 0) * factor * 0.9),
        rounds: Math.round((mockStats.previousPeriod.rounds ?? 0) * factor * 0.9),
        avgWatchDurationMinutes: 0,
        gpm: 0,
      },
      yearOverYearPeriod: {
        ...mockStats.previousPeriod,
        totalGMV: Math.round(mockStats.previousPeriod.totalGMV * factor * 0.85),
        totalDuration: Math.round(mockStats.previousPeriod.totalDuration * factor * 0.85 * 10) / 10,
        totalOrders: Math.round((mockStats.previousPeriod.totalOrders ?? 0) * factor * 0.85),
        rounds: Math.round((mockStats.previousPeriod.rounds ?? 0) * factor * 0.85),
        avgWatchDurationMinutes: 0,
        gpm: 0,
      },
      trend,
    }
    res.json(stats)
  } catch (error) {
    console.error('获取统计数据失败:', error)
    res.status(500).json({ error: '获取统计数据失败' })
  }
})

export default router
