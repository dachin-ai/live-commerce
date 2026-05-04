/**
 * AI 统计数据分析模块
 * 负责：DB 数据聚合、趋势分析、异常检测、动态阈值、同比/环比
 * 原属 aiTasksService.ts
 */

import { dbGet, dbAll } from '../../db'
import { getConversionRateBenchmark, getCategoryAOVBenchmark } from './dataBenchmarks'

export const TODO_STATS_DAYS = 30

export const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ==================== 日期区间计算 ====================

export function getPeriodDateRange(n: number): { dateFrom: string; dateTo: string } {
  const today = new Date()
  const end = new Date(today)
  end.setDate(end.getDate() - n * TODO_STATS_DAYS)
  const start = new Date(end)
  start.setDate(start.getDate() - (TODO_STATS_DAYS - 1))
  return { dateFrom: toStr(start), dateTo: toStr(end) }
}

export function getPeriodDateRangeFromEnd(endDate: string, n: number): { dateFrom: string; dateTo: string } {
  const end = new Date(endDate + 'T00:00:00')
  const endN = new Date(end)
  endN.setDate(endN.getDate() - n * TODO_STATS_DAYS)
  const start = new Date(endN)
  start.setDate(start.getDate() - (TODO_STATS_DAYS - 1))
  return { dateFrom: toStr(start), dateTo: toStr(endN) }
}

// ==================== DB 数据查询 ====================

export async function getStoreLatestStatsDate(storeId: string): Promise<string | null> {
  const row = await dbGet<{ maxDate: string }>(
    'SELECT MAX(date) as maxDate FROM stats WHERE storeId = ? AND date IS NOT NULL',
    [storeId]
  )
  return row?.maxDate ?? null
}

export async function aggregateStatsForRange(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  totalGMV: number
  totalDuration: number
  totalViewers: number
  totalOrders: number
  totalInteractions: number
  totalRounds?: number
  totalLikes?: number
  totalComments?: number
  totalShares?: number
  totalFollows?: number
  totalProductViews?: number
  totalProductClicks?: number
  totalCompletedOrders?: number
} | null> {
  const row = await dbGet<{
    totalGMV: number
    totalDuration: number
    totalViewers: number
    totalOrders: number
    totalInteractions: number
    totalRounds: number
    totalLikes: number
    totalComments: number
    totalShares: number
    totalFollows: number
    totalProductViews: number
    totalProductClicks: number
    totalCompletedOrders: number
  }>(
    `SELECT
       COALESCE(SUM(totalGMV), 0) as totalGMV,
       COALESCE(SUM(totalDuration), 0) as totalDuration,
       COALESCE(SUM(totalViewers), 0) as totalViewers,
       COALESCE(SUM(totalOrders), 0) as totalOrders,
       COALESCE(SUM(totalInteractions), 0) as totalInteractions,
       COALESCE(SUM(rounds), 0) as totalRounds,
       COALESCE(SUM(likes), 0) as totalLikes,
       COALESCE(SUM(comments), 0) as totalComments,
       COALESCE(SUM(shares), 0) as totalShares,
       COALESCE(SUM(follows), 0) as totalFollows,
       COALESCE(SUM(productViews), 0) as totalProductViews,
       COALESCE(SUM(productClicks), 0) as totalProductClicks,
       COALESCE(SUM(completedOrders), 0) as totalCompletedOrders
     FROM stats WHERE storeId = ? AND date >= ? AND date <= ?`,
    [storeId, dateFrom, dateTo]
  )
  if (!row) return null
  return {
    totalGMV: Number(row.totalGMV) || 0,
    totalDuration: Number(row.totalDuration) || 0,
    totalViewers: Number(row.totalViewers) || 0,
    totalOrders: Number(row.totalOrders) || 0,
    totalInteractions: Number(row.totalInteractions) || 0,
    totalRounds: Number(row.totalRounds) || 0,
    totalLikes: Number(row.totalLikes) || 0,
    totalComments: Number(row.totalComments) || 0,
    totalShares: Number(row.totalShares) || 0,
    totalFollows: Number(row.totalFollows) || 0,
    totalProductViews: Number(row.totalProductViews) || 0,
    totalProductClicks: Number(row.totalProductClicks) || 0,
    totalCompletedOrders: Number(row.totalCompletedOrders) || 0,
  }
}

export async function getRawDailyStatsForLLM(
  storeId: string,
  dateFrom: string,
  dateTo: string,
  options?: { compact?: boolean }
): Promise<string> {
  const compact = options?.compact === true
  const limit = compact ? 21 : 31
  if (compact) {
    const rows = await dbAll<{
      date: string
      totalGMV: number
      totalDuration: number
      totalViewers: number
      totalOrders: number
      totalInteractions: number
      averageConversionRate: number
      gmvPerHour: number
    }>(
      `SELECT date, totalGMV, totalDuration, totalViewers, totalOrders,
              COALESCE(totalInteractions, 0) as totalInteractions,
              COALESCE(averageConversionRate, 0) as averageConversionRate,
              COALESCE(gmvPerHour, 0) as gmvPerHour
       FROM stats WHERE storeId = ? AND date >= ? AND date <= ?
       ORDER BY date ASC LIMIT ${limit}`,
      [storeId, dateFrom, dateTo]
    )
    if (!rows || rows.length === 0) return ''
    const header = '日期\tGMV\t时长(h)\t观看\t订单\t互动\t转化率(%)\t时均GMV'
    const lines = rows.map((r) => {
      const conv = ((Number(r.averageConversionRate) || 0) * 100).toFixed(2)
      const gph = Math.round(Number(r.gmvPerHour) || 0)
      return `${r.date}\t${Math.round(Number(r.totalGMV) || 0)}\t${(Number(r.totalDuration) || 0).toFixed(1)}\t${Number(r.totalViewers) || 0}\t${Number(r.totalOrders) || 0}\t${Number(r.totalInteractions) || 0}\t${conv}\t${gph}`
    })
    return [header, ...lines].join('\n')
  }
  const rows = await dbAll<{
    date: string
    totalGMV: number
    totalDuration: number
    totalViewers: number
    activeViewers: number
    totalOrders: number
    completedOrders: number
    totalInteractions: number
    likes: number
    comments: number
    shares: number
    follows: number
    productViews: number
    productClicks: number
    rounds: number
    averageConversionRate: number
    clickThroughRate: number
    interactionRate: number
    gmvPerHour: number
  }>(
    `SELECT date, totalGMV, totalDuration, totalViewers, 
            COALESCE(activeViewers, 0) as activeViewers,
            totalOrders, 
            COALESCE(completedOrders, 0) as completedOrders,
            totalInteractions,
            COALESCE(likes, 0) as likes,
            COALESCE(comments, 0) as comments,
            COALESCE(shares, 0) as shares,
            COALESCE(follows, 0) as follows,
            COALESCE(productViews, 0) as productViews,
            COALESCE(productClicks, 0) as productClicks,
            COALESCE(rounds, 0) as rounds,
            COALESCE(averageConversionRate, 0) as averageConversionRate,
            COALESCE(clickThroughRate, 0) as clickThroughRate,
            COALESCE(interactionRate, 0) as interactionRate,
            COALESCE(gmvPerHour, 0) as gmvPerHour
     FROM stats WHERE storeId = ? AND date >= ? AND date <= ?
     ORDER BY date ASC LIMIT ${limit}`,
    [storeId, dateFrom, dateTo]
  )
  if (!rows || rows.length === 0) return ''
  const header = '日期\tGMV\t时长(h)\t观看\t在线\t订单\t完成\t互动\t点赞\t评论\t分享\t关注\t商品曝光\t商品点击\t场次\t转化率(%)\t点击率(%)\t互动率(%)\t时均GMV'
  const lines = rows.map((r) => {
    const conv = ((Number(r.averageConversionRate) || 0) * 100).toFixed(2)
    const ctr = ((Number(r.clickThroughRate) || 0) * 100).toFixed(2)
    const ir = ((Number(r.interactionRate) || 0) * 100).toFixed(2)
    const gph = Math.round(Number(r.gmvPerHour) || 0)
    return `${r.date}\t${Math.round(Number(r.totalGMV) || 0)}\t${(Number(r.totalDuration) || 0).toFixed(1)}\t${Number(r.totalViewers) || 0}\t${Number(r.activeViewers) || 0}\t${Number(r.totalOrders) || 0}\t${Number(r.completedOrders) || 0}\t${Number(r.totalInteractions) || 0}\t${Number(r.likes) || 0}\t${Number(r.comments) || 0}\t${Number(r.shares) || 0}\t${Number(r.follows) || 0}\t${Number(r.productViews) || 0}\t${Number(r.productClicks) || 0}\t${Number(r.rounds) || 0}\t${conv}\t${ctr}\t${ir}\t${gph}`
  })
  return [header, ...lines].join('\n')
}

// ==================== 同比/环比数据查询 ====================

export async function getYearOverYearStats(
  storeId: string,
  currentDateFrom: string,
  currentDateTo: string
): Promise<{ totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null> {
  const currentFrom = new Date(currentDateFrom)
  const currentTo = new Date(currentDateTo)
  const lastYearFrom = new Date(currentFrom)
  lastYearFrom.setFullYear(lastYearFrom.getFullYear() - 1)
  const lastYearTo = new Date(currentTo)
  lastYearTo.setFullYear(lastYearTo.getFullYear() - 1)
  const yoyFrom = toStr(lastYearFrom)
  const yoyTo = toStr(lastYearTo)
  return await aggregateStatsForRange(storeId, yoyFrom, yoyTo)
}

export async function getMonthOverMonthStats(
  storeId: string,
  currentDateFrom: string,
  currentDateTo: string
): Promise<{ totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null> {
  const currentFrom = new Date(currentDateFrom + 'T00:00:00')
  const currentTo = new Date(currentDateTo + 'T00:00:00')
  const lastMonthFrom = new Date(currentFrom)
  lastMonthFrom.setMonth(lastMonthFrom.getMonth() - 1)
  const lastMonthTo = new Date(currentTo)
  lastMonthTo.setMonth(lastMonthTo.getMonth() - 1)
  const momFrom = toStr(lastMonthFrom)
  const momTo = toStr(lastMonthTo)
  return await aggregateStatsForRange(storeId, momFrom, momTo)
}

// ==================== 趋势分析 ====================

export function analyzeTrend(recentStats: any[]): {
  trend: 'rising' | 'declining' | 'stable' | 'insufficient_data'
  description: string
} {
  if (recentStats.length < 3) {
    return {
      trend: 'insufficient_data',
      description: '历史数据不足，需要至少3期数据才能分析趋势',
    }
  }

  const gmvTrend = recentStats.map(s => s.totalGMV || 0)

  const isDecreasing = gmvTrend.every((val, i) => i === 0 || val < gmvTrend[i - 1])
  const isIncreasing = gmvTrend.every((val, i) => i === 0 || val > gmvTrend[i - 1])

  if (isDecreasing) {
    const decline = ((gmvTrend[gmvTrend.length - 1] / gmvTrend[0] - 1) * 100).toFixed(1)
    return {
      trend: 'declining',
      description: `GMV连续下降，总下降${Math.abs(Number(decline))}%`,
    }
  }

  if (isIncreasing) {
    const growth = ((gmvTrend[gmvTrend.length - 1] / gmvTrend[0] - 1) * 100).toFixed(1)
    return {
      trend: 'rising',
      description: `GMV连续增长，总增长${growth}%`,
    }
  }

  const avgGMV = gmvTrend.reduce((sum, val) => sum + val, 0) / gmvTrend.length
  const variance = gmvTrend.reduce((sum, val) => sum + Math.pow(val - avgGMV, 2), 0) / gmvTrend.length
  const stdDev = Math.sqrt(variance)
  const volatility = (stdDev / avgGMV) * 100

  if (volatility > 30) {
    return {
      trend: 'stable',
      description: `数据波动较大（波动率${volatility.toFixed(1)}%），建议稳定运营`,
    }
  }

  return {
    trend: 'stable',
    description: '数据整体稳定',
  }
}

// ==================== 异常检测 ====================

export interface Anomaly {
  type: string
  severity: 'critical' | 'high' | 'medium'
  metric: string
  currentValue: number
  expectedValue: number
  change: string
  description: string
  aiFeature?: string
}

export function detectAnomalies(
  currentStats: any,
  historicalStats: any,
  categories: string[]
): Anomaly[] {
  const anomalies: Anomaly[] = []

  if (historicalStats.avgGMV > 0 && currentStats.totalGMV < historicalStats.avgGMV * 0.5) {
    const change = (((currentStats.totalGMV / historicalStats.avgGMV) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'gmv_drop',
      severity: 'critical',
      metric: 'GMV',
      currentValue: currentStats.totalGMV,
      expectedValue: historicalStats.avgGMV,
      change: `${change}%`,
      description: `GMV突然下降${Math.abs(Number(change))}%，可能是选品、定价或市场环境变化导致`,
      aiFeature: 'product_recommend',
    })
  }

  const currentConversionRate = currentStats.totalViewers > 0
    ? (currentStats.totalOrders / currentStats.totalViewers) * 100
    : 0
  const historicalConversionRate = historicalStats.avgConversionRate || 0

  if (historicalConversionRate > 0 && currentConversionRate < historicalConversionRate * 0.7) {
    const change = (((currentConversionRate / historicalConversionRate) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'conversion_drop',
      severity: 'high',
      metric: '转化率',
      currentValue: currentConversionRate,
      expectedValue: historicalConversionRate,
      change: `${change}%`,
      description: `转化率突然下降${Math.abs(Number(change))}%，可能是话术、互动或商品展示问题`,
      aiFeature: 'script',
    })
  }

  if (historicalStats.avgViewers > 0 && currentStats.totalViewers < historicalStats.avgViewers * 0.6) {
    const change = (((currentStats.totalViewers / historicalStats.avgViewers) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'viewers_drop',
      severity: 'high',
      metric: '观看人数',
      currentValue: currentStats.totalViewers,
      expectedValue: historicalStats.avgViewers,
      change: `${change}%`,
      description: `观看人数突然下降${Math.abs(Number(change))}%，可能是时段、标题或推流问题`,
      aiFeature: 'time_recommend',
    })
  }

  const currentInteractionRate = currentStats.totalViewers > 0
    ? (currentStats.totalInteractions / currentStats.totalViewers) * 100
    : 0
  const historicalInteractionRate = historicalStats.avgInteractionRate || 0

  if (historicalInteractionRate > 0 && currentInteractionRate < historicalInteractionRate * 0.5) {
    const change = (((currentInteractionRate / historicalInteractionRate) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'interaction_drop',
      severity: 'medium',
      metric: '互动率',
      currentValue: currentInteractionRate,
      expectedValue: historicalInteractionRate,
      change: `${change}%`,
      description: `互动率突然下降${Math.abs(Number(change))}%，可能是缺少互动环节或活动吸引力不足`,
      aiFeature: 'engagement',
    })
  }

  if (
    currentStats.totalViewers >= historicalStats.avgViewers * 0.8 &&
    currentConversionRate < historicalConversionRate * 0.6
  ) {
    anomalies.push({
      type: 'conversion_viewers_mismatch',
      severity: 'high',
      metric: '转化率与观看人数',
      currentValue: currentConversionRate,
      expectedValue: historicalConversionRate,
      change: '-',
      description: '观看人数正常但转化率暴跌，可能是商品质量、价格或话术问题',
      aiFeature: 'script',
    })
  }

  const currentAOV = currentStats.totalOrders > 0 ? currentStats.totalGMV / currentStats.totalOrders : 0
  const historicalAOV = historicalStats.avgAOV || 0

  if (
    currentStats.totalGMV >= historicalStats.avgGMV * 0.9 &&
    currentStats.totalOrders > historicalStats.avgOrders * 1.5 &&
    currentAOV < historicalAOV * 0.7
  ) {
    anomalies.push({
      type: 'aov_drop',
      severity: 'medium',
      metric: '客单价',
      currentValue: currentAOV,
      expectedValue: historicalAOV,
      change: '-',
      description: 'GMV正常但客单价暴跌，可能是低价商品占比过高或促销力度过大',
      aiFeature: 'pricing',
    })
  }

  return anomalies
}

// ==================== 动态阈值 ====================

export function getDynamicThresholds(
  historicalStats: any,
  categories: string[],
  minPrice?: number,
  maxPrice?: number,
  platform?: string
): {
  conversionRate: { min: number; target: number }
  gmvPerHour: { min: number; target: number }
  interactionRate: { min: number; target: number }
  avgOrderValue: { min: number; target: number }
  viewers: { min: number; target: number }
} {
  const industryBenchmark = getConversionRateBenchmark(categories, minPrice, maxPrice, platform)
  const categoryAOV = getCategoryAOVBenchmark(categories)

  const conversionRateThreshold = {
    min: historicalStats.avgConversionRate > industryBenchmark.rate
      ? historicalStats.avgConversionRate * 0.9
      : industryBenchmark.rate * 0.8,
    target: Math.max(historicalStats.avgConversionRate * 1.1, industryBenchmark.rate),
  }

  const gmvPerHourThreshold = {
    min: historicalStats.avgGMVPerHour > 0
      ? historicalStats.avgGMVPerHour * 0.8
      : 3000,
    target: historicalStats.avgGMVPerHour > 0
      ? historicalStats.avgGMVPerHour * 1.2
      : 5000,
  }

  const interactionRateThreshold = {
    min: historicalStats.avgInteractionRate > 0
      ? historicalStats.avgInteractionRate * 0.8
      : 10,
    target: Math.max(historicalStats.avgInteractionRate * 1.2, 15),
  }

  const avgOrderValueThreshold = {
    min: historicalStats.avgAOV > 0
      ? historicalStats.avgAOV * 0.9
      : categoryAOV * 0.8,
    target: Math.max(historicalStats.avgAOV * 1.1, categoryAOV),
  }

  const viewersThreshold = {
    min: historicalStats.avgViewers > 0
      ? historicalStats.avgViewers * 0.8
      : 300,
    target: historicalStats.avgViewers > 0
      ? historicalStats.avgViewers * 1.2
      : 500,
  }

  return {
    conversionRate: conversionRateThreshold,
    gmvPerHour: gmvPerHourThreshold,
    interactionRate: interactionRateThreshold,
    avgOrderValue: avgOrderValueThreshold,
    viewers: viewersThreshold,
  }
}
