import { dbAll, dbGet } from '../db'

export interface StatsAggRow {
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

const AGG_SELECT = `SELECT
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

export class StatsRepository {
  async aggregateByDateRange(storeId: string, dateFrom: string, dateTo: string): Promise<StatsAggRow | null> {
    const rows = await dbAll<StatsAggRow>(AGG_SELECT, [storeId, dateFrom, dateTo])
    return rows?.[0] ?? null
  }

  async getTrend(storeId: string, dateFrom: string, dateTo: string): Promise<{ date: string; value: number }[]> {
    const rows = await dbAll<{ date: string; value: number }>(
      `SELECT date, COALESCE(SUM(totalGMV), 0) as value
       FROM stats WHERE storeId = ? AND date >= ? AND date <= ? AND date IS NOT NULL
       GROUP BY date ORDER BY date`,
      [storeId, dateFrom, dateTo]
    )
    return (rows || []).map((r) => ({ date: String(r.date), value: Number(r.value) || 0 }))
  }

  async getInRangeCount(storeId: string, dateFrom: string, dateTo: string): Promise<number> {
    const row = await dbGet<{ c: number }>(
      `SELECT COUNT(*) as c FROM stats WHERE storeId = ? AND date >= ? AND date <= ?`,
      [storeId, dateFrom, dateTo]
    )
    return Number((row as any)?.c ?? 0) || 0
  }

  async getAvailableDateRange(storeId: string): Promise<{ minDate: string | null; maxDate: string | null; count: number } | null> {
    const row = await dbGet<{ minDate: string | null; maxDate: string | null; c: number }>(
      `SELECT MIN(date) as minDate, MAX(date) as maxDate, COUNT(*) as c FROM stats WHERE storeId = ?`,
      [storeId]
    )
    if (!row) return null
    return {
      minDate: (row as any).minDate ? String((row as any).minDate) : null,
      maxDate: (row as any).maxDate ? String((row as any).maxDate) : null,
      count: Number((row as any).c ?? 0) || 0,
    }
  }
}
