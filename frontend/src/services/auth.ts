import api from './api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface User {
  id: string
  name: string
  email: string
  role: 'user' | 'admin' | 'operator' | 'manager'
  status: string
  createdAt: string
  lastLoginAt?: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
  role?: 'user' | 'admin'
}

export interface AuthResponse {
  user: User
  /** 账号首次登录（仅首次会为 true，用于展示欢迎语） */
  firstLoginEver?: boolean
  /** 当前 IP 首次登录（仅新 IP 首次会为 true，用于展示教程） */
  newIpFirstLogin?: boolean
}

// 登录
export const useLogin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const data = await api.post('/auth/login', credentials)
      const response = data as unknown as AuthResponse
      // 防御：确保后端返回格式正确
      if (!response?.user?.id) {
        throw new Error('登录响应格式错误，请确认后端服务正常')
      }
      // Token 由 httpOnly Cookie 自动管理，前端只存 UI 状态
      localStorage.setItem('userId', response.user.id)
      localStorage.setItem('userRole', response.user.role ?? 'user')
      localStorage.setItem('userName', response.user.name ?? '')
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      queryClient.invalidateQueries({ queryKey: ['liveStats'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// 注册
export const useRegister = () => {
  return useMutation({
    mutationFn: async (data: RegisterData) => {
      return await api.post('/auth/register', data)
    },
  })
}

// 登出
export const useLogout = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      return await api.post('/auth/logout')
    },
    onSuccess: () => {
      // Cookie 由后端 clearCookie 管理
      localStorage.removeItem('userId')
      localStorage.removeItem('userRole')
      localStorage.removeItem('userName')
      localStorage.removeItem('selectedStoreId')
      queryClient.clear()
    },
  })
}

// 获取当前用户信息（成功时同步 role/userId/userName 到 localStorage，避免重新登录后管理员状态丢失）
export const useCurrentUser = () => {
  return useQuery<User>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const data = await api.get('/auth/me')
      const user = data as unknown as User
      if (user?.id) {
        localStorage.setItem('userId', user.id)
        if (user.role) localStorage.setItem('userRole', user.role)
        if (user.name) localStorage.setItem('userName', user.name)
      }
      return user
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5分钟内不重新获取
  })
}

// 检查是否已登录
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('userId')  // Cookie 由浏览器管理，前端用 userId 判断
}

// 获取当前用户角色（与后端 users.role 一致，含 operator/manager）
export const getCurrentUserRole = (): 'user' | 'admin' | 'operator' | 'manager' | null => {
  const r = localStorage.getItem('userRole')
  if (!r) return null
  if (['user', 'admin', 'operator', 'manager'].includes(r)) return r as 'user' | 'admin' | 'operator' | 'manager'
  return r as 'user' | 'admin' | 'operator' | 'manager'
}

// 获取当前用户ID
export const getCurrentUserId = (): string | null => {
  return localStorage.getItem('userId')
}

// 忘记密码
export async function requestPasswordReset(email: string): Promise<{ message: string; resetToken?: string; code?: string }> {
  const data = await api.post('/auth/forgot-password', { email })
  return data as unknown as { message: string; resetToken?: string; code?: string }
}

// 重置密码（凭 token）
export const resetPasswordWithToken = (token: string, newPassword: string) =>
  api.post('/auth/reset-password', { token, newPassword })

// 重置密码（凭验证码）
export const resetPasswordWithCode = (email: string, code: string, newPassword: string) =>
  api.post('/auth/reset-password', { email, code, newPassword })

// 更新当前用户资料（姓名）
export async function updateProfile(name: string): Promise<User> {
  const data = await api.put('/auth/me', { name })
  return data as unknown as User
}

// 修改当前用户密码
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword })

// 修改当前用户邮箱（需当前密码）
export async function changeEmail(newEmail: string, currentPassword: string): Promise<User> {
  const data = await api.post('/auth/change-email', { newEmail, currentPassword })
  return data as unknown as User
}
