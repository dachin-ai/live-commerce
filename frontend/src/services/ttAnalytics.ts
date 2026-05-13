/**
 * TT Analytics API service
 */
import { useQuery } from '@tanstack/react-query'

const API = '/api/tt-analytics'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export type TtTable = 'tt_live_sessions' | 'tt_ad_sessions' | 'tt_store_products' | 'tt_product_details' | 'tt_video_sessions'

export const TABLE_LABELS: Record<TtTable, string> = {
  tt_live_sessions: '直播数据',
  tt_ad_sessions: '广告数据',
  tt_store_products: '店铺产品',
  tt_product_details: '产品明细',
  tt_video_sessions: '视频数据',
}

export const TABLE_FIELDS: Record<TtTable, { field: string; label: string; type: 'number' | 'text' }[]> = {
  tt_live_sessions: [
    { field: 'name', label: '直播名称', type: 'text' },
    { field: 'grossRevenue', label: '总收入', type: 'number' },
    { field: 'directGmv', label: '直接GMV', type: 'number' },
    { field: 'itemsSold', label: '售出件数', type: 'number' },
    { field: 'ordersPaid', label: '已付订单', type: 'number' },
    { field: 'views', label: '观看次数', type: 'number' },
    { field: 'viewers', label: '观看人数', type: 'number' },
    { field: 'peakViewers', label: '峰值观众', type: 'number' },
    { field: 'likes', label: '点赞', type: 'number' },
    { field: 'comments', label: '评论', type: 'number' },
    { field: 'shares', label: '分享', type: 'number' },
    { field: 'newFollowers', label: '新粉丝', type: 'number' },
    { field: 'ctr', label: 'CTR', type: 'number' },
    { field: 'ctor', label: 'CTOR', type: 'number' },
    { field: 'durationSeconds', label: '时长(秒)', type: 'number' },
    { field: 'productImpressions', label: '商品曝光', type: 'number' },
    { field: 'productClicks', label: '商品点击', type: 'number' },
    // 衍生指标（导入时自动计算）
    { field: 'gmvPerHour', label: '⚡ 时效/小时成交额', type: 'number' },
    { field: 'revenuePerViewer', label: '⚡ 人均GMV', type: 'number' },
    { field: 'orderCvr', label: '⚡ 下单转化率%', type: 'number' },
    { field: 'engagementRate', label: '⚡ 互动率%', type: 'number' },
  ],
  tt_ad_sessions: [
    { field: 'campaignName', label: '广告计划', type: 'text' },
    { field: 'liveName', label: '直播名称', type: 'text' },
    { field: 'cost', label: '花费', type: 'number' },
    { field: 'netCost', label: '净花费', type: 'number' },
    { field: 'grossRevenue', label: '总收入', type: 'number' },
    { field: 'roi', label: 'ROI', type: 'number' },
    { field: 'skuOrders', label: 'SKU订单', type: 'number' },
    { field: 'costPerOrder', label: '每单成本', type: 'number' },
    { field: 'liveViews', label: '直播观看', type: 'number' },
    { field: 'costPerLiveView', label: '观看成本', type: 'number' },
    { field: 'views10s', label: '10秒观看', type: 'number' },
    { field: 'liveFollows', label: '直播关注', type: 'number' },
  ],
  tt_store_products: [
    { field: 'productName', label: '产品名称', type: 'text' },
    { field: 'gmv', label: 'GMV', type: 'number' },
    { field: 'viewers', label: '浏览人数', type: 'number' },
    { field: 'views', label: '浏览次数', type: 'number' },
    { field: 'clicks', label: '点击次数', type: 'number' },
    { field: 'skuOrders', label: '订单数', type: 'number' },
    { field: 'customers', label: '客户数', type: 'number' },
    { field: 'addToCartUsers', label: '加购人数', type: 'number' },
    { field: 'viewToPaidRate', label: '浏览→付费率', type: 'number' },
    { field: 'clickToPaidRate', label: '点击→付费率', type: 'number' },
    { field: 'cartToPaidRate', label: '加购→付费率', type: 'number' },
    { field: 'contentGmv', label: '内容GMV', type: 'number' },
  ],
  tt_product_details: [
    { field: 'productName', label: '产品名称', type: 'text' },
    { field: 'totalRevenue', label: '总成交额', type: 'number' },
    { field: 'commission', label: '佣金', type: 'number' },
    { field: 'unitsSold', label: '成交件数', type: 'number' },
  ],
  tt_video_sessions: [
    { field: 'videoInfo', label: '视频标题', type: 'text' },
    { field: 'creatorName', label: '创作者', type: 'text' },
    { field: 'publishedAt', label: '发布时间', type: 'text' },
    { field: 'products', label: '关联商品', type: 'text' },
    { field: 'videoViews', label: 'VV播放量', type: 'number' },
    { field: 'likes', label: '点赞', type: 'number' },
    { field: 'comments', label: '评论', type: 'number' },
    { field: 'shares', label: '分享', type: 'number' },
    { field: 'newFollowers', label: '新增粉丝', type: 'number' },
    { field: 'videoToLiveClicks', label: 'V跳转直播点击', type: 'number' },
    { field: 'productImpressions', label: '商品曝光', type: 'number' },
    { field: 'productClicks', label: '商品点击', type: 'number' },
    { field: 'orders', label: '订单数', type: 'number' },
    { field: 'itemsSold', label: '售出件数', type: 'number' },
    { field: 'grossRevenue', label: 'GMV', type: 'number' },
    { field: 'gpm', label: 'GPM(百万播放收益)', type: 'number' },
    { field: 'attributedGmv', label: '归因GMV', type: 'number' },
    { field: 'ctr', label: 'CTR点击率%', type: 'number' },
    { field: 'videoToLiveRate', label: 'V-to-L率%', type: 'number' },
    { field: 'videoFinishRate', label: '完播率%', type: 'number' },
    { field: 'clickToOrderRate', label: '点击转单率%', type: 'number' },
  ],
}

export interface QueryConfig {
  table: TtTable
  storeId: string
  dateFrom?: string
  dateTo?: string
  select: string[]
  aggregates?: { fn: string; field: string; alias: string }[]
  groupBy?: string[]
  orderBy?: { field: string; dir: 'ASC' | 'DESC' }
  limit?: number
}

export interface QueryResult {
  rows: Record<string, unknown>[]
  total: number
}

export async function runQuery(config: QueryConfig): Promise<QueryResult> {
  const res = await fetch(`${API}/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '查询失败' }))
    throw new Error(err.message || '查询失败')
  }
  return res.json()
}

async function fetchSummary(endpoint: string, storeId: string, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams({ storeId })
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo) params.set('dateTo', dateTo)
  const res = await fetch(`${API}/${endpoint}?${params}`, { headers: getAuthHeaders() })
  if (!res.ok) throw new Error('查询失败')
  return res.json()
}

export function useLiveSummary(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-live-summary', storeId, dateFrom, dateTo],
    queryFn: () => fetchSummary('live-summary', storeId!, dateFrom, dateTo),
    enabled: !!storeId,
  })
}

export function useAdSummary(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-ad-summary', storeId, dateFrom, dateTo],
    queryFn: () => fetchSummary('ad-summary', storeId!, dateFrom, dateTo),
    enabled: !!storeId,
  })
}

export function useProductFunnel(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-product-funnel', storeId, dateFrom, dateTo],
    queryFn: () => fetchSummary('product-funnel', storeId!, dateFrom, dateTo),
    enabled: !!storeId,
  })
}

export function useProductEnriched(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-product-enriched', storeId, dateFrom, dateTo],
    queryFn: () => fetchSummary('product-enriched', storeId!, dateFrom, dateTo),
    enabled: !!storeId,
  })
}

export function useCrossAnalysis(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-cross-analysis', storeId, dateFrom, dateTo],
    queryFn: () => fetchSummary('cross-analysis', storeId!, dateFrom, dateTo),
    enabled: !!storeId,
  })
}

export function useVideoSummary(storeId?: string, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['tt-video-summary', storeId, dateFrom, dateTo],
    queryFn: () => fetchSummary('video-summary', storeId!, dateFrom, dateTo),
    enabled: !!storeId,
  })
}
