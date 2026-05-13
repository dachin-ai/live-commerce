/**
 * frontend/src/services/ttImport.ts
 * TikTok 数据导入 & 分析 API 服务
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_BASE = '/api/tt-import'

// ─── 类型 ─────────────────────────────────────────────────────────

export type TtDataType = 'live_sessions' | 'ad_sessions' | 'store_products' | 'product_details' | 'product_overview' | 'video_sessions'

export const TT_DATA_TYPE_LABELS: Record<TtDataType, string> = {
  live_sessions: '直播数据明细',
  ad_sessions: '广告消耗明细',
  store_products: '店铺产品数据',
  product_details: '产品数据明细',
  product_overview: '全渠道商品大盘',
  video_sessions: '视频数据明细',
}

export interface TtPreviewResult {
  dataType: TtDataType
  dataTypeLabel: string
  dateFrom: string | null
  dateTo: string | null
  currency: string
  totalRows: number
  previewRows: Record<string, unknown>[]
  headers: string[]
  needsDateInput: boolean
}

export interface TtImportRecord {
  id: string
  storeId: string
  dataType: TtDataType
  dataTypeLabel: string
  dateFrom: string | null
  dateTo: string | null
  fileName: string
  recordCount: number
  currency: string
  importedBy: string
  importedAt: string
}

export interface TtCommitResult {
  importId: string
  dataType: TtDataType
  dataTypeLabel: string
  recordCount: number
  dateFrom: string
  dateTo: string
  currency: string
  overwritten: boolean
}

// ─── 辅助 ─────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ─── Preview（解析不入库） ─────────────────────────────────────────

export async function previewTtFile(
  file: File,
  storeId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TtPreviewResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('storeId', storeId)
  if (dateFrom) fd.append('dateFrom', dateFrom)
  if (dateTo) fd.append('dateTo', dateTo)

  const res = await fetch(`${API_BASE}/preview`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '解析失败' }))
    throw new Error(err.message || '解析失败')
  }
  return res.json()
}

// ─── Commit（正式写库） ────────────────────────────────────────────

export async function commitTtImport(params: {
  file: File
  storeId: string
  dateFrom?: string
  dateTo?: string
  advertiserType?: string
  adType?: string
  contentType?: string
  channelType?: string
}): Promise<TtCommitResult> {
  const fd = new FormData()
  fd.append('file', params.file)
  fd.append('storeId', params.storeId)
  if (params.dateFrom) fd.append('dateFrom', params.dateFrom)
  if (params.dateTo) fd.append('dateTo', params.dateTo)
  if (params.advertiserType) fd.append('advertiserType', params.advertiserType)
  if (params.adType) fd.append('adType', params.adType)
  if (params.contentType) fd.append('contentType', params.contentType)
  if (params.channelType) fd.append('channelType', params.channelType)

  const res = await fetch(`${API_BASE}/commit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '导入失败' }))
    throw new Error(err.message || '导入失败')
  }
  return res.json()
}

// ─── History ──────────────────────────────────────────────────────

async function fetchImportHistory(storeId: string): Promise<TtImportRecord[]> {
  const res = await fetch(`${API_BASE}/history?storeId=${storeId}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('获取导入历史失败')
  return res.json()
}

export function useTtImportHistory(storeId: string | undefined) {
  return useQuery({
    queryKey: ['tt-import-history', storeId],
    queryFn: () => fetchImportHistory(storeId!),
    enabled: !!storeId,
  })
}

// ─── Rollback ─────────────────────────────────────────────────────

export function useDeleteTtImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (importId: string) => {
      const res = await fetch(`${API_BASE}/${importId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('删除失败')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tt-import-history'] })
    },
  })
}
