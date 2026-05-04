import api from './api'
import { useQuery } from '@tanstack/react-query'

export interface LiveStats {
  totalGMV: number
  totalDuration: number
  totalViewers: number
  activeViewers: number
  totalInteractions: number
  totalOrders: number
  completedOrders?: number
  averageDailyDuration?: number
  rounds: number
  averageConversionRate: number
  averageDurationPerRound: number
  gmvPerHour: number
  averageDurationPerDay: number
  roundsPerDay: number
  /** 人均观看时长（分钟），抖店罗盘类时效指标，由总时长/观看人数推导 */
  avgWatchDurationMinutes?: number
  /** 千次观看成交金额（GPM），抖店罗盘类指标，由 GMV/观看人数*1000 推导 */
  gpm?: number
  previousPeriod: {
    totalGMV: number
    totalDuration: number
    totalViewers?: number
    activeViewers: number
    totalOrders?: number
    completedOrders?: number
    averageDailyDuration?: number
    rounds?: number
    averageConversionRate: number
    averageDurationPerRound: number
    gmvPerHour: number
    averageDurationPerDay: number
    roundsPerDay: number
    avgWatchDurationMinutes?: number
    gpm?: number
    totalInteractions?: number
    likes?: number
    comments?: number
    shares?: number
    follows?: number
    productViews?: number
    productClicks?: number
    clickThroughRate?: number
    interactionRate?: number
  }
  /** 去年同期（同比基准） */
  yearOverYearPeriod?: {
    totalGMV: number
    totalDuration: number
    totalViewers?: number
    activeViewers: number
    totalOrders?: number
    completedOrders?: number
    averageDailyDuration?: number
    rounds?: number
    averageConversionRate: number
    averageDurationPerRound: number
    gmvPerHour: number
    averageDurationPerDay: number
    roundsPerDay: number
    avgWatchDurationMinutes?: number
    gpm?: number
    totalInteractions?: number
  }
  /** 按日期的销售趋势，用于图表 */
  trend?: { date: string; value: number }[]
  /** 互动细分与商品数据（Excel 导入时有则写入） */
  likes?: number
  comments?: number
  shares?: number
  follows?: number
  productViews?: number
  productClicks?: number
  clickThroughRate?: number
  interactionRate?: number
  meta?: {
    requested?: { dateFrom: string; dateTo: string; timeRange?: string }
    inRangeCount?: number
    available?: { minDate: string | null; maxDate: string | null; count: number }
  }
}

/** timePeriod：today | week | month | quarter | year | custom | monthPick | yearPick；custom 传 dateFrom/dateTo；monthPick 传 month(YYYY-MM)；yearPick 传 year(YYYY) */
export const useLiveStats = (
  storeId?: string,
  timePeriod?: string,
  options?: { dateFrom?: string; dateTo?: string; month?: string; year?: string }
) => {
  return useQuery<LiveStats>({
    queryKey: ['liveStats', storeId, timePeriod, options?.dateFrom, options?.dateTo, options?.month, options?.year],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (storeId) params.storeId = storeId
      if (timePeriod) params.timeRange = timePeriod
      if (timePeriod === 'custom') {
        if (options?.dateFrom) params.dateFrom = options.dateFrom
        if (options?.dateTo) params.dateTo = options.dateTo
      }
      if (timePeriod === 'monthPick' && options?.month) params.month = options.month
      if (timePeriod === 'yearPick' && options?.year) params.year = options.year
      const data = await api.get('/stats/live', { params })
      return data as unknown as LiveStats
    },
    retry: false,
    enabled:
      !!storeId &&
      (timePeriod !== 'custom' || !!(options?.dateFrom && options?.dateTo)) &&
      (timePeriod !== 'monthPick' || !!options?.month) &&
      (timePeriod !== 'yearPick' || !!options?.year),
  })
}
