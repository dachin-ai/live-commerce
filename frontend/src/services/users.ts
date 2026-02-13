import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  status?: 'active' | 'inactive'
  createdAt: string
  lastLoginAt?: string
}

export interface CreateUserData {
  name: string
  email: string
  password: string
  role?: 'user' | 'admin'
  status?: 'active' | 'inactive'
}

export const useUsers = () => {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      return await api.get('/users')
    },
  })
}

export const useCreateUser = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (user: CreateUserData) => {
      return await api.post('/users', user)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<User> & { id: string; password?: string }) => {
      return await api.put(`/users/${id}`, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export const useDeleteUser = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/users/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
