import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export const usePreferences = () => {
  return useQuery<{ preferences: Record<string, any> }>({
    queryKey: ['preferences'],
    queryFn: async () => {
      return await api.get('/preferences')
    },
  })
}

export const useUpdatePreferences = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (preferences: Record<string, any>) => {
      return await api.put('/preferences', { preferences })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
    },
  })
}
