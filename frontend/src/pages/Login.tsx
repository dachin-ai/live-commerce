import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useLogin } from '../services/auth'
import { LogIn, Mail, Lock } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const state = location.state as { message?: string } | null
    if (state?.message) {
      toast.success(state.message)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [])

  useEffect(() => {
    if (sessionStorage.getItem('loginExpiredMessage')) {
      sessionStorage.removeItem('loginExpiredMessage')
      toast.info('登录已过期，请重新登录')
    }
  }, [toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('请输入邮箱和密码')
      return
    }

    try {
      await login.mutateAsync({ email, password })
      navigate('/', { replace: true })
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        (err.code === 'ECONNABORTED' ? '请求超时，请确认后端已启动' : '登录失败，请检查邮箱和密码')
      setError(msg)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">直播电商中台</h1>
          <p className="text-gray-600">请登录您的账户</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              邮箱地址
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入密码"
                required
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">默认账号：admin@example.com / 123456</p>
              <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                忘记密码？
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
          >
            {login.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                登录中...
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                登录
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          还没有账号？{' '}
          <Link to="/register" className="text-blue-600 hover:underline font-medium">
            立即注册
          </Link>
        </p>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-center text-gray-500">
            测试账号（仅区分运营与管理员）：
            <br />
            管理员：admin@example.com / 123456
            <br />
            运营：operator@example.com / 123456
          </p>
        </div>
      </div>
    </div>
  )
}
