import axios from 'axios'

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // 多语言：带用户当前语言与地区，供后端/LLM 入参
    try {
      const locale = localStorage.getItem('lvbcsym_locale')
      if (locale) config.headers['Accept-Language'] = locale
    } catch {
      // ignore
    }
    // 如果是FormData，不设置Content-Type，让浏览器自动设置
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API 请求失败:', {
      url: error?.config?.url,
      method: error?.config?.method,
      status: error?.response?.status,
      message: error?.message,
      data: error?.response?.data,
    })

    const status = error?.response?.status
    const errorMessage = error?.response?.data?.error

    if (status === 401 || errorMessage === '未登录') {
      console.warn('未授权，需要登录')
      localStorage.removeItem('token')
      localStorage.removeItem('userId')
      localStorage.removeItem('userRole')
      localStorage.removeItem('userName')
      localStorage.removeItem('selectedStoreId')
      sessionStorage.setItem('loginExpiredMessage', '1') // 登录页将据此展示「登录已过期，请重新登录」
      setTimeout(() => {
        window.location.href = '/login'
      }, 100)
    }
    return Promise.reject(error)
  }
)

export default api
