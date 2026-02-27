import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Store {
  id: string
  name: string
  nameTh?: string
  description?: string
  platform: string
  userId?: string
  userName?: string
  /** 额外可查看该店铺的用户ID（不含主归属人 userId），详情接口返回 */
  accessUserIds?: string[]
  /** 更新时传入的可查看用户ID列表 */
  userIds?: string[]
  region?: string
  currency?: string
  currencySymbol?: string
  minPrice?: number
  maxPrice?: number
  targetAudience?: string
  brandPositioning?: string
  brandStrategy?: string
  categories?: Array<{ id: string; name: string; level: number; parentId?: string }>
  status: 'active' | 'inactive'
  createdAt: string
}

export interface CreateStoreData {
  name: string
  nameTh?: string
  description?: string
  platform?: string
  userId?: string
  /** 额外可查看该店铺的用户ID（多人可见） */
  userIds?: string[]
  region?: string
  currency?: string
  currencySymbol?: string
  minPrice?: number
  maxPrice?: number
  targetAudience?: string
  brandPositioning?: string
  brandStrategy?: string
  categoryIds?: string[]
  status?: 'active' | 'inactive'
}

export interface StoresResponse {
  items: Store[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface UseStoresOptions {
  search?: string
  page?: number
  limit?: number
  /** 精简列表：仅 id/name/platform 等，不含 categories，选中店铺后用 useStoreById 取详情 */
  light?: boolean
  /** 按国家/地区筛选（stores.region） */
  region?: string
  /** 按平台筛选（stores.platform） */
  platform?: string
}

export const useStores = (searchOrOptions?: string | UseStoresOptions) => {
  const opts = typeof searchOrOptions === 'string'
    ? { search: searchOrOptions }
    : (searchOrOptions ?? {})
  const { search, page = 1, limit = 50, light = true, region, platform } = opts

  return useQuery<StoresResponse>({
    queryKey: ['stores', search, page, limit, light, region ?? '', platform ?? ''],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit, light: light ? '1' : '0' }
      if (search && String(search).trim()) params.search = String(search).trim()
      if (region && String(region).trim()) params.region = String(region).trim()
      if (platform && String(platform).trim()) params.platform = String(platform).trim()
      const data = await api.get('/stores', { params })
      return data as unknown as StoresResponse
    },
    retry: false,
  })
}

// 注意：此函数已重命名为 useStoreById，避免与 StoreContext 中的 useStore hook 冲突
export const useStoreById = (id: string) => {
  return useQuery<Store>({
    queryKey: ['stores', id],
    queryFn: async () => {
      const data = await api.get(`/stores/${id}`)
      return data as unknown as Store
    },
    enabled: !!id,
  })
}

export const useCreateStore = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (store: CreateStoreData) => {
      const data = await api.post('/stores', store)
      return data as unknown as Store
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })
}

export const useUpdateStore = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Store> & { id: string }) => {
      const data = await api.put(`/stores/${id}`, updates)
      return data as unknown as Store
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      queryClient.invalidateQueries({ queryKey: ['stores', variables.id] })
    },
  })
}

export const useDeleteStore = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/stores/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })
}
