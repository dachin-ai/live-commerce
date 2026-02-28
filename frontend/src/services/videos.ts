import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Video {
  id: string
  userId: string
  shopId: string | null
  sessionId: string | null
  fileName: string
  fileKey: string
  videoUrl: string
  fileSize: number
  contentType: string | null
  status: 'processing' | 'active' | 'failed'
  description: string | null
  createdAt: string
}

export const useVideos = (storeId?: string) => {
  return useQuery<Video[]>({
    queryKey: ['videos', storeId],
    queryFn: async () => {
      const params = storeId ? { storeId } : {}
      const data = await api.get('/videos', { params })
      return data as unknown as Video[]
    },
    enabled: !!storeId,
  })
}

export const useVideo = (videoId: string | null) => {
  return useQuery<Video>({
    queryKey: ['video', videoId],
    queryFn: async () => {
      const data = await api.get(`/videos/${videoId}`)
      return data as unknown as Video
    },
    enabled: !!videoId,
  })
}

export const useUploadVideo = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      return await api.post('/videos/upload-video', formData, {
        timeout: 300000, // 5 分钟，支持大视频上传
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}

export const useDeleteVideo = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/videos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}
