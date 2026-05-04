import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const api = axios.create({ baseURL: '/api/tt-bi' })
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ─── Live Performance ─────────────────────────────────────────────────
export function useLivePerformance(
  storeId?: string,
  dateFrom?: string, dateTo?: string,
  compareDateFrom?: string, compareDateTo?: string
) {
  return useQuery({
    queryKey: ['tt-bi-live', storeId, dateFrom, dateTo, compareDateFrom, compareDateTo],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (compareDateFrom) params.compareDateFrom = compareDateFrom
      if (compareDateTo) params.compareDateTo = compareDateTo
      const { data } = await api.get('/live-performance', { params })
      return data as {
        summary: Record<string, number>
        compareSummary: Record<string, number> | null
        topSessions: Record<string, unknown>[]
        dailyTrend: Record<string, unknown>[]
        compareDailyTrend: Record<string, unknown>[]
      }
    },
    enabled: !!storeId,
  })
}

// ─── Ad Matrix ───────────────────────────────────────────────────────
export function useAdMatrix(
  storeId?: string,
  dateFrom?: string, dateTo?: string,
  compareDateFrom?: string, compareDateTo?: string
) {
  return useQuery({
    queryKey: ['tt-bi-ad', storeId, dateFrom, dateTo, compareDateFrom, compareDateTo],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (compareDateFrom) params.compareDateFrom = compareDateFrom
      if (compareDateTo) params.compareDateTo = compareDateTo
      const { data } = await api.get('/ad-matrix', { params })
      return data as {
        overall: Record<string, number>
        compareOverall: Record<string, number> | null
        byCampaign: Record<string, unknown>[]
        byLive: Record<string, unknown>[]
        byStatus: Record<string, unknown>[]
      }
    },
    enabled: !!storeId,
  })
}

// ─── Product Radar ───────────────────────────────────────────────────
export function useProductRadar(
  storeId?: string,
  cwFrom?: string, cwTo?: string,
  pwFrom?: string, pwTo?: string
) {
  return useQuery({
    queryKey: ['tt-bi-radar', storeId, cwFrom, cwTo, pwFrom, pwTo],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (cwFrom) params.currentWeekFrom = cwFrom
      if (cwTo) params.currentWeekTo = cwTo
      if (pwFrom) params.prevWeekFrom = pwFrom
      if (pwTo) params.prevWeekTo = pwTo
      const { data } = await api.get('/product-radar', { params })
      return data as {
        period: { current: { from: string; to: string }; previous: { from: string; to: string } }
        rising: any[]
        falling: any[]
        all: any[]
      }
    },
    enabled: !!storeId,
  })
}

// ─── Results Overview ───────────────────────────────────────────────
export function useResultsOverview(storeId?: string, month?: string) {
  return useQuery({
    queryKey: ['tt-bi-results', storeId, month],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (month) params.month = month
      const { data } = await api.get('/results-overview', { params })
      return data as {
        month: string
        targets: Record<string, number>
        targetNotes: Record<string, { note: string | null; isAiGenerated: boolean }>
        actual: Record<string, number>
        monthlyTrend: { month: string; gmv: number; orders: number; sessions: number }[]
      }
    },
    enabled: !!storeId,
  })
}

// ─── Targets ─────────────────────────────────────────────────────────
export function useTargets(storeId?: string, month?: string) {
  return useQuery({
    queryKey: ['tt-bi-targets', storeId, month],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (month) params.month = month
      const { data } = await api.get('/targets', { params })
      return data as { id: string; metric: string; targetValue: number; month: string; isAiGenerated: number; note: string }[]
    },
    enabled: !!storeId,
  })
}

export function useSaveTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { storeId: string; month: string; metric: string; targetValue: number; note?: string }) => {
      const { data } = await api.post('/targets', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tt-bi-targets'] })
      qc.invalidateQueries({ queryKey: ['tt-bi-results'] })
    },
  })
}

export function useGenerateTargets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { storeId: string; month: string }) => {
      const { data } = await api.post('/targets/generate', body)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tt-bi-targets'] })
      qc.invalidateQueries({ queryKey: ['tt-bi-results'] })
    },
  })
}

// ─── Omni-Channel Overview ──────────────────────────────────────────
export function useOmniChannel(
  storeId?: string,
  dateFrom?: string, dateTo?: string,
  compareDateFrom?: string, compareDateTo?: string
) {
  return useQuery({
    queryKey: ['tt-bi-omni', storeId, dateFrom, dateTo, compareDateFrom, compareDateTo],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (compareDateFrom) params.compareDateFrom = compareDateFrom
      if (compareDateTo) params.compareDateTo = compareDateTo
      const { data } = await api.get('/omni-channel', { params })
      return data as {
        channels: { channel: string; label: string; gmv: number; orders: number; views: number; sessions: number; gmvPct: number; ordersPct: number }[]
        total: { gmv: number; orders: number }
        ad: { cost: number; gmv: number; orders: number }
        trends: { live: { date: string; gmv: number; orders: number }[]; shopTab: { date: string; gmv: number; orders: number }[] }
        compare: {
          channels: { channel: string; label: string; gmv: number; orders: number; views: number; sessions: number; gmvPct: number; ordersPct: number }[]
          total: { gmv: number; orders: number }
          ad: { cost: number; gmv: number; orders: number }
          trends: { live: any[]; shopTab: any[] }
        } | null
      }
    },
    enabled: !!storeId,
  })
}

// ─── Video Performance ──────────────────────────────────────────────
export function useVideoPerformance(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-bi-video', storeId, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = { storeId: storeId! }
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const { data } = await api.get('/video-performance', { params })
      return data as {
        summary: {
          totalVideos: number
          totalVV: number
          totalOrders: number
          totalBuyers: number
          totalGmv: number
          totalNewFollowers: number
          totalImpressions: number
          totalClicks: number
          totalVtoLClicks: number
          avgGPM: number
          avgCTR: number
          avgFinishRate: number
          avgClickToOrderRate: number
          avgVtoLRate: number
        }
        topVideos: {
          creatorName: string
          videoInfo: string
          videoId: string
          publishedAt: string
          products: string
          videoViews: number
          grossRevenue: number
          gpm: number
          orders: number
          uniqueCustomers: number
          productImpressions: number
          productClicks: number
          ctr: number
          videoFinishRate: number
          videoToLiveRate: number
          videoToLiveClicks: number
          clickToOrderRate: number
          newFollowers: number
          likes: number
          comments: number
          shares: number
          mark: string
        }[]
        dailyTrend: { date: string; vv: number; gmv: number; orders: number; videos: number }[]
      }
    },
    enabled: !!storeId,
  })
}
