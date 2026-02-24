import api from './api'

export interface DataImportResult {
  success: boolean
  message: string
  stats: {
    id: string
    totalGMV: number
    totalDuration: number
    totalViewers: number
    rounds: number
  } & Record<string, unknown>
  importRecord: {
    id: string
    fileName: string
    recordCount: number
  }
}

export interface ImportHistory {
  id: string
  storeId: string
  platform: string
  fileName: string
  recordCount: number
  statsId: string
  createdAt: string
  storeName?: string
}

/**
 * 导入TikTok直播数据
 */
export async function importTikTokData(storeId: string, file: File): Promise<DataImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('storeId', storeId)

  const response = await api.post('/data-import/tiktok', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

/**
 * 获取导入历史记录
 */
export async function getImportHistory(storeId?: string): Promise<ImportHistory[]> {
  const params = storeId ? { storeId } : {}
  const response = await api.get('/data-import/history', { params })
  return response.data
}

/**
 * 按店铺维度导出已上传数据（CSV 或 Excel），触发浏览器下载。
 * 管理员：导出全部店铺；普通用户：仅导出自己权限下的店铺。可选仅导出当前店铺。
 */
export async function downloadDataExport(format: 'csv' | 'xlsx', storeId?: string): Promise<void> {
  const params = new URLSearchParams({ format })
  if (storeId?.trim()) params.set('storeId', storeId.trim())
  const url = `/data-import/export?${params.toString()}`
  const response = await api.get(url, { responseType: 'blob' })
  const blob = response.data as Blob
  if (response.status === 404 || blob.type?.includes('json')) {
    const text = await blob.text()
    let msg = '导出失败'
    try {
      const j = JSON.parse(text)
      if (j.error) msg = j.error
    } catch {
      /* ignore parse error, use generic msg */
    }
    throw new Error(msg)
  }
  const ext = format === 'xlsx' ? 'xlsx' : 'csv'
  const name = `运营数据-按店铺-${new Date().toISOString().slice(0, 10)}.${ext}`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
