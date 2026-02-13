import api from './api'
import { useQuery } from '@tanstack/react-query'

export interface Category {
  id: string
  name: string
  nameTh?: string
  level: number
  parentId?: string
  sortOrder: number
}

export const useCategories = (level?: number, parentId?: string) => {
  return useQuery<Category[]>({
    queryKey: ['categories', level, parentId ?? ''],
    queryFn: async () => {
      const params: Record<string, number | string> = {}
      if (level != null) params.level = level
      if (parentId != null && parentId !== '') params.parentId = parentId
      const res = await api.get<Category[]>('/categories', { params })
      return Array.isArray(res) ? res : []
    },
    enabled: level === 1 || level === 2 || level === 3,
    staleTime: 0,
    refetchOnMount: true,
  })
}
