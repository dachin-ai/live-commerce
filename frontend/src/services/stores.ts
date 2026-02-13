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
  region?: string
  currency?: string
  currencySymbol?: string
  minPrice?: number
  maxPrice?: number
  targetAudience?: string
  brandPositioning?: string
  brandStrategy?: string
  categories?: Array<{ id: string; name: string; level: number }>
  status: 'active' | 'inactive'
  createdAt: string
}

export interface CreateStoreData {
  name: string
  nameTh?: string
  description?: string
  platform?: string
  userId?: string
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

export const useStores = (search?: string) => {
  return useQuery<Store[]>({
    queryKey: ['stores', search],
    queryFn: async () => {
      const params = search ? { search } : {}
      const data = await api.get('/stores', { params })
      return data as unknown as Store[]
    },
    // 需要认证才能获取商店列表
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
      return await api.put(`/stores/${id}`, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] })
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
