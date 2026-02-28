import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Material {
  id: string
  name: string
  type: 'video' | 'image' | 'document' | 'excellent' | 'problem'
  url?: string
  storeId?: string
  description?: string
  createdAt: string
  userId?: string
  title?: string
  content?: string
  videoId?: string
  tags?: string
  rating?: number
  metadata?: string
}

export const useMaterials = (storeId?: string, videoId?: string) => {
  return useQuery<Material[]>({
    queryKey: ['materials', storeId, videoId],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (storeId) params.storeId = storeId
      if (videoId) params.videoId = videoId
      const data = await api.get('/materials', { params })
      return data as unknown as Material[]
    },
    retry: false,
    enabled: !!storeId || !!videoId,
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
