import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useLogin, isAuthenticated } from '../services/auth'
import { LogIn, Mail, Lock } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useLanguage, type Locale } from '../contexts/LanguageContext'
import { GlassInput } from '../components/ui/GlassInput'
import { GlassButton } from '../components/ui/GlassButton'

export default function Login() {
  const { t } = useTranslation()
  const { locale, setLocale } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated()) {
      window.location.href = '/'
      return
    }
  }, [])

  useEffect(() => {
    const state = location.state as { message?: string } | null
    if (state?.message) {
      toast.success(state.message)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate, toast])

  useEffect(() => {
    if (sessionStorage.getItem('loginExpiredMessage')) {
      sessionStorage.removeItem('loginExpiredMessage')
      toast.info(t('auth.sessionExpired'))
    }
  }, [toast, t])

  const languageOptions: Array<{ value: Locale; label: string }> = [
    { value: 'en-US', label: 'EN' },
    { value: 'zh-CN', label: '中文' },
    { value: 'id-ID', label: 'ID' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError(t('auth.enterEmailPassword'))
      return
    }

    try {
      const res = await login.mutateAsync({ email, password })
      if (res.firstLoginEver) sessionStorage.setItem('showWelcome', '1')
      if (res.newIpFirstLogin) sessionStorage.setItem('showTutorial', '1')
      // 刷新并加载完整应用（StoreProvider、Dashboard 等）
      window.location.href = '/'
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string; code?: string }
      const msg =
        error.response?.data?.error ||
        error.message ||
        (error.code === 'ECONNABORTED' ? t('auth.requestTimeout') : t('auth.loginFailedCheck'))
      setError(msg)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-primary-950 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow background effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-1000" />

      <div className="max-w-md w-full relative z-10">
        {/* Glassmorphism card */}
        <div className="bg-white/10 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/20 p-8">
          <div className="flex justify-end mb-4">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="bg-white/10 text-white text-sm border border-white/25 rounded-lg px-3 py-1.5 outline-none focus:border-primary-400/70"
              aria-label={t('sidebar.language')}
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value} className="text-slate-900">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-2xl mb-4 shadow-lg shadow-primary-500/30">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{t('auth.loginTitle')}</h1>
            <p className="text-white/60">{t('auth.loginSubtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 backdrop-blur-md border border-red-400/30 text-red-200 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                {t('auth.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40 z-10 pointer-events-none" />
                <GlassInput
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 !bg-white/5 !border-white/20 !text-white placeholder:!text-white/30 focus:!border-primary-400/60 focus:!ring-primary-500/20"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40 z-10 pointer-events-none" />
                <GlassInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 !bg-white/5 !border-white/20 !text-white placeholder:!text-white/30 focus:!border-primary-400/60 focus:!ring-primary-500/20"
                  placeholder="请输入密码"
                  required
                />
              </div>
              <div className="flex justify-end mt-2">
                <Link to="/forgot-password" className="text-xs text-primary-300 hover:text-primary-200 transition-colors">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            </div>

            <GlassButton
              type="submit"
              disabled={login.isPending}
              variant="primary"
              className="w-full !bg-gradient-to-r !from-primary-500 !to-indigo-600 hover:!from-primary-400 hover:!to-indigo-500 !shadow-lg !shadow-primary-500/25 gap-2"
            >
              {login.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('auth.loggingIn')}
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {t('auth.login')}
                </>
              )}
            </GlassButton>
          </form>

          <p className="mt-6 text-center text-sm text-white/40">
            {t('auth.noRegisterDuringBeta')}
          </p>
        </div>
      </div>
    </div>
  )
}
