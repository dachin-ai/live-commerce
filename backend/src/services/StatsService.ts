import { StatsRepository, StatsAggRow } from '../repositories/StatsRepository'

// ─── 日期工具（纯函数，无副作用） ─────────────────────────────────────────

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function getDateRange(
  timeRange: string,
  dateFrom?: string,
  dateTo?: string
): { dateFrom: string; dateTo: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  const dow = today.getDay()

  if (timeRange === 'custom') {
    const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : toStr(today)
    const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : toStr(today)
    return { dateFrom: from, dateTo: to }
  }
  switch (timeRange) {
    case 'today':
      return { dateFrom: toStr(today), dateTo: toStr(today) }
    case 'week': {
      const daysToMonday = dow === 0 ? 6 : dow - 1
      return {
        dateFrom: toStr(new Date(y, m, d - daysToMonday)),
        dateTo: toStr(new Date(y, m, d - daysToMonday + 6)),
      }
    }
    case 'month':
      return { dateFrom: toStr(new Date(y, m, 1)), dateTo: toStr(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const qs = Math.floor(m / 3) * 3
      return { dateFrom: toStr(new Date(y, qs, 1)), dateTo: toStr(new Date(y, qs + 3, 0)) }
    }
    case 'year':
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` }
    default:
      return { dateFrom: toStr(new Date(y, m, d - 6)), dateTo: toStr(today) }
  }
}

export function getDateRangeFromMonthOrYear(month?: string, year?: string): { dateFrom: string; dateTo: string } | null {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, mo] = month.split('-').map(Number)
    return { dateFrom: toStr(new Date(y, mo - 1, 1)), dateTo: toStr(new Date(y, mo, 0)) }
  }
  if (year && /^\d{4}$/.test(year)) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` }
  }
  return null
}

export function getPreviousPeriodRange(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo))
    return { dateFrom, dateTo }
  const from = new Date(dateFrom + 'T00:00:00')
  const to = new Date(dateTo + 'T00:00:00')
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1)
  return { dateFrom: toStr(prevFrom), dateTo: toStr(prevTo) }
}

export function getYoYBaselineRange(timeRange: string, dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo))
    return { dateFrom, dateTo }
  const from = new Date(dateFrom + 'T00:00:00')
  const to = new Date(dateTo + 'T00:00:00')
  const tr = (timeRange || '').trim()
  if (tr === 'month' || tr === 'monthPick') {
    from.setMonth(from.getMonth() - 1); to.setMonth(to.getMonth() - 1)
  } else {
    from.setFullYear(from.getFullYear() - 1); to.setFullYear(to.getFullYear() - 1)
  }
  return { dateFrom: toStr(from), dateTo: toStr(to) }
}

export function normalizeDateParam(s: string | undefined): string {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim().replace(/\//g, '-')
  const mo = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!mo) return t.slice(0, 10)
  return `${mo[1]}-${String(parseInt(mo[2], 10)).padStart(2, '0')}-${String(parseInt(mo[3], 10)).padStart(2, '0')}`
}

export function normalizeMonthParam(s: string | undefined): string {
  if (!s || typeof s !== 'string') return ''
  const t = s.trim().replace(/\//g, '-')
  const parts = t.split('-')
  if (parts.length < 2) return t.slice(0, 7)
  const y = parts[0].replace(/\D/g, '')
  const mo = parts[1].replace(/\D/g, '')
  if (y.length !== 4 || !mo) return t.slice(0, 7)
  return `${y}-${String(parseInt(mo, 10)).padStart(2, '0')}`
}

// ─── 空结构 ──────────────────────────────────────────────────────────────

export function emptyStats(timeRange: string) {
  const zero = {
    totalGMV: 0, totalDuration: 0, totalViewers: 0, activeViewers: 0,
    totalInteractions: 0, totalOrders: 0, completedOrders: 0,
    averageDailyDuration: 0, rounds: 0, averageConversionRate: 0,
    averageDurationPerRound: 0, gmvPerHour: 0, averageDurationPerDay: 0,
    roundsPerDay: 0, avgWatchDurationMinutes: 0, gpm: 0,
    likes: 0, comments: 0, shares: 0, follows: 0,
    productViews: 0, productClicks: 0, clickThroughRate: 0, interactionRate: 0,
  }
  const zeroPeriod = { ...zero, avgWatchDurationMinutes: 0, gpm: 0 }
  return {
    ...zero,
    previousPeriod: zeroPeriod,
    yearOverYearPeriod: zeroPeriod,
    trend: [] as { date: string; value: number }[],
  }
}

// ─── 统计字段映射 ─────────────────────────────────────────────────────────

function buildPeriod(row: StatsAggRow | null) {
  if (!row) return {
    totalGMV: 0, totalDuration: 0, activeViewers: 0, totalOrders: 0,
    completedOrders: 0, rounds: 0, averageConversionRate: 0,
    averageDurationPerRound: 0, gmvPerHour: 0, averageDurationPerDay: 0,
    roundsPerDay: 0, avgWatchDurationMinutes: 0, gpm: 0,
    totalInteractions: 0, likes: 0, comments: 0, shares: 0, follows: 0,
    productViews: 0, productClicks: 0, clickThroughRate: 0, interactionRate: 0,
  }
  const g = Number(row.totalGMV) || 0
  const dur = Number(row.totalDuration) || 0
  const v = Number(row.totalViewers) || 0
  const ord = Number(row.totalOrders) || 0
  const rnd = Number(row.rounds) || 0
  const comp = Number(row.completedOrders) || 0
  return {
    totalGMV: g, totalDuration: dur,
    activeViewers: Number(row.activeViewers) || 0,
    totalOrders: ord, completedOrders: comp, rounds: rnd,
    averageConversionRate: v > 0 ? (comp / v) * 100 : 0,
    averageDurationPerRound: rnd > 0 ? dur / rnd : 0,
    gmvPerHour: dur > 0 ? g / dur : 0,
    averageDurationPerDay: Number(row.averageDurationPerDay) || 0,
    roundsPerDay: Number(row.roundsPerDay) || 0,
    avgWatchDurationMinutes: v > 0 ? (dur * 60) / v : 0,
    gpm: v > 0 ? (g / v) * 1000 : 0,
    totalInteractions: Number(row.totalInteractions) || 0,
    likes: Number(row.likes) || 0, comments: Number(row.comments) || 0,
    shares: Number(row.shares) || 0, follows: Number(row.follows) || 0,
    productViews: Number(row.productViews) || 0,
    productClicks: Number(row.productClicks) || 0,
    clickThroughRate: Number(row.clickThroughRate) || 0,
    interactionRate: Number(row.interactionRate) || 0,
  }
}

// ─── Mock 数据（无店铺时兜底） ───────────────────────────────────────────

const MOCK = {
  totalGMV: 1250000, totalDuration: 28.5, totalViewers: 12845,
  activeViewers: 3240, totalInteractions: 45892, totalOrders: 24791,
  completedOrders: 326, rounds: 312, averageConversionRate: 2.54,
  averageDurationPerRound: 1.02, gmvPerHour: 43860,
  averageDurationPerDay: 4.07, roundsPerDay: 4,
  previousPeriod: {
    totalGMV: 980000, totalDuration: 24.0, activeViewers: 2800,
    totalOrders: 20000, completedOrders: 280, rounds: 280,
    averageConversionRate: 2.1, averageDurationPerRound: 0.96,
    gmvPerHour: 40833, averageDurationPerDay: 3.5, roundsPerDay: 3,
    avgWatchDurationMinutes: 0, gpm: 0,
  },
}

export function buildMockStats(timeRange: string) {
  const periodFactor: Record<string, number> = {
    today: 0.15, week: 1, month: 4.3, quarter: 13, year: 52,
  }
  const factor = periodFactor[timeRange] ?? 1
  const daysInRange = timeRange === 'today' ? 1 : timeRange === 'week' ? 7 :
    timeRange === 'month' ? 30 : timeRange === 'quarter' ? 90 : 365

  const totalG = Math.round(MOCK.totalGMV * factor)
  const totalV = Math.round(MOCK.totalViewers * factor)
  const totalD = Math.round(MOCK.totalDuration * factor * 10) / 10
  const baseGMV = totalG / Math.max(1, daysInRange)

  const today = new Date()
  const trend: { date: string; value: number }[] = []
  for (let i = daysInRange - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    trend.push({ date: d.toISOString().slice(0, 10), value: Math.round(baseGMV * (0.8 + Math.random() * 0.4)) })
  }

  return {
    ...MOCK, totalGMV: totalG, totalDuration: totalD, totalViewers: totalV,
    totalOrders: Math.round(MOCK.totalOrders * factor),
    rounds: Math.round(MOCK.rounds * factor),
    avgWatchDurationMinutes: totalV > 0 ? (totalD * 60) / totalV : 0,
    gpm: totalV > 0 ? (totalG / totalV) * 1000 : 0,
    previousPeriod: {
      ...MOCK.previousPeriod,
      totalGMV: Math.round(MOCK.previousPeriod.totalGMV * factor * 0.9),
      totalDuration: Math.round(MOCK.previousPeriod.totalDuration * factor * 0.9 * 10) / 10,
      totalOrders: Math.round(MOCK.previousPeriod.totalOrders * factor * 0.9),
      rounds: Math.round(MOCK.previousPeriod.rounds * factor * 0.9),
    },
    yearOverYearPeriod: {
      ...MOCK.previousPeriod,
      totalGMV: Math.round(MOCK.previousPeriod.totalGMV * factor * 0.85),
      totalDuration: Math.round(MOCK.previousPeriod.totalDuration * factor * 0.85 * 10) / 10,
      totalOrders: Math.round(MOCK.previousPeriod.totalOrders * factor * 0.85),
      rounds: Math.round(MOCK.previousPeriod.rounds * factor * 0.85),
      avgWatchDurationMinutes: 0, gpm: 0,
    },
    trend,
  }
}

// ─── 主计算入口 ───────────────────────────────────────────────────────────

export class StatsService {
  private repo = new StatsRepository()

  async getLiveStats(params: {
    timeRange: string
    dateFrom?: string
    dateTo?: string
    month?: string
    year?: string
    storeId?: string
  }) {
    const { timeRange, storeId } = params

    // 解析日期范围
    let dateFrom: string
    let dateTo: string

    const monthQ = normalizeMonthParam(params.month?.trim())
    const yearQ = params.year?.trim()
    const dateFromQ = normalizeDateParam(params.dateFrom)
    const dateToQ = normalizeDateParam(params.dateTo)

    if (timeRange === 'monthPick' && monthQ) {
      const range = getDateRangeFromMonthOrYear(monthQ, undefined)
      if (!range) return emptyStats('week')
      ;({ dateFrom, dateTo } = range)
    } else if (timeRange === 'yearPick' && yearQ) {
      const range = getDateRangeFromMonthOrYear(undefined, yearQ)
      if (!range) return emptyStats('week')
      ;({ dateFrom, dateTo } = range)
    } else {
      const range = getDateRange(timeRange, dateFromQ, dateToQ)
      if (timeRange === 'custom' && (!dateFromQ || !dateToQ)) return emptyStats('week')
      ;({ dateFrom, dateTo } = range)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))

    if (!storeId) return buildMockStats(timeRange)

    const prevRange = getPreviousPeriodRange(dateFrom, dateTo)
    const yoyRange = getYoYBaselineRange(timeRange, dateFrom, dateTo)

    const [agg, trend, inRangeCount, available, prevAgg, yoyAgg] = await Promise.all([
      this.repo.aggregateByDateRange(storeId, dateFrom, dateTo),
      this.repo.getTrend(storeId, dateFrom, dateTo),
      this.repo.getInRangeCount(storeId, dateFrom, dateTo),
      this.repo.getAvailableDateRange(storeId),
      this.repo.aggregateByDateRange(storeId, prevRange.dateFrom, prevRange.dateTo),
      this.repo.aggregateByDateRange(storeId, yoyRange.dateFrom, yoyRange.dateTo),
    ])

    if (!agg) return { ...emptyStats(timeRange), trend }

    const totalGMV = Number(agg.totalGMV) || 0
    const totalDuration = Number(agg.totalDuration) || 0
    const totalViewers = Number(agg.totalViewers) || 0
    const totalOrders = Number(agg.totalOrders) || 0
    const rounds = Number(agg.rounds) || 0
    const completedOrders = Number(agg.completedOrders) || 0
    const gmvPerHour = totalDuration > 0 ? totalGMV / totalDuration : 0
    const averageConversionRate = totalViewers > 0 ? (completedOrders / totalViewers) * 100 : 0
    const averageDurationPerRound = rounds > 0 ? totalDuration / rounds : 0
    const avgWatchDurationMinutes = totalViewers > 0 ? (totalDuration * 60) / totalViewers : 0
    const gpm = totalViewers > 0 ? (totalGMV / totalViewers) * 1000 : 0

    return {
      totalGMV, totalDuration, totalViewers,
      activeViewers: Number(agg.activeViewers) || 0,
      totalInteractions: Number(agg.totalInteractions) || 0,
      totalOrders, completedOrders,
      averageDailyDuration: Number(agg.averageDurationPerDay) || 0,
      rounds, averageConversionRate, averageDurationPerRound, gmvPerHour,
      averageDurationPerDay: Number(agg.averageDurationPerDay) || 0,
      roundsPerDay: Number(agg.roundsPerDay) || 0,
      avgWatchDurationMinutes, gpm,
      likes: Number(agg.likes) || 0,
      comments: Number(agg.comments) || 0,
      shares: Number(agg.shares) || 0,
      follows: Number(agg.follows) || 0,
      productViews: Number(agg.productViews) || 0,
      productClicks: Number(agg.productClicks) || 0,
      clickThroughRate: Number(agg.clickThroughRate) || 0,
      interactionRate: Number(agg.interactionRate) || 0,
      previousPeriod: buildPeriod(prevAgg),
      yearOverYearPeriod: buildPeriod(yoyAgg),
      trend,
      meta: {
        requested: { dateFrom, dateTo, timeRange },
        inRangeCount,
        available,
      },
    }
  }
}
