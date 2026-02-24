import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type UserPreferences = Record<string, unknown>

export const usePreferences = () => {
  return useQuery<{ preferences: UserPreferences }>({
    queryKey: ['preferences'],
    queryFn: async () => {
      return await api.get('/preferences')
    },
  })
}

export const useUpdatePreferences = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (preferences: UserPreferences) => {
      return await api.put('/preferences', { preferences })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
    },
  })
}
