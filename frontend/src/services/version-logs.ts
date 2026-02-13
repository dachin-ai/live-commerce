import api from './api'
import { useQuery } from '@tanstack/react-query'

export interface VersionLog {
  id: string
  version: string
  title: string
  content: string
  type: 'feature' | 'bugfix' | 'improvement' | 'release'
  createdAt: string
}

export const useVersionLogs = (limit = 10, offset = 0) => {
  return useQuery<VersionLog[]>({
    queryKey: ['versionLogs', limit, offset],
    queryFn: async () => {
      return await api.get('/version-logs', { params: { limit, offset } })
    },
  })
}
