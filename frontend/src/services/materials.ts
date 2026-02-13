import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Material {
  id: string
  name: string
  type: 'video' | 'image' | 'document'
  url: string
  storeId?: string
  description?: string
  createdAt: string
}

export const useMaterials = (storeId?: string) => {
  return useQuery<Material[]>({
    queryKey: ['materials', storeId],
    queryFn: async () => {
      const params = storeId ? { storeId } : {}
      const data = await api.get('/materials', { params })
      return data as unknown as Material[]
    },
    retry: false,
    // 仅在有店铺时请求，实现不同商店间素材隔离
    enabled: !!storeId,
  })
}

export const useCreateMaterial = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: FormData) => {
      return await api.post('/materials', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}

export const useUpdateMaterial = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Material> & { id: string }) => {
      return await api.put(`/materials/${id}`, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}

export const useDeleteMaterial = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/materials/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}
