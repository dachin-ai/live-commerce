import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requestPasswordReset, resetPasswordWithCode } from '../services/auth'
import { Mail, ArrowLeft, Lock, CheckCircle } from 'lucide-react'

const REDIRECT_SECONDS = 3

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [sentCode, setSentCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email?.trim()) {
      setError('请输入邮箱')
      return
    }
    setLoading(true)
    try {
      const res = await requestPasswordReset(email.trim())
      setStep('code')
      if (res.code) setSentCode(res.code)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      setError(error.response?.data?.error || error.message || '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleResetWithCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!code?.trim()) {
      setError('请输入验证码')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      await resetPasswordWithCode(email.trim(), code.trim(), password)
      setSuccess(true)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      setError(error.response?.data?.error || error.message || '重置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!success) return
    setCountdown(REDIRECT_SECONDS)
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t)
          navigate('/login', { replace: true })
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [success, navigate])

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">密码已重置</h1>
          <p className="text-slate-600 mb-2">请使用新密码登录</p>
          <p className="text-sm text-slate-500 mb-6">{countdown > 0 ? `${countdown} 秒后自动跳转至登录页` : '正在跳转...'}</p>
          <Link
            to="/login"
            className="inline-block w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-center"
          >
            立即去登录
          </Link>
        </div>
      </div>
    )
  }

  const codeSent = step === 'code'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-indigo-100 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 my-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-4">
            <Mail className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">找回密码</h1>
          <p className="text-slate-600 text-sm">
            {codeSent
              ? `验证码已发送至 ${email}，请在下表填写验证码并设置新密码。`
              : '输入注册邮箱，我们将发送验证码至该邮箱。若未收到请检查垃圾箱或联系管理员。'}
          </p>
        </div>

        {/* 邮箱 + 发送验证码（始终显示，发送成功后邮箱只读可改） */}
        <form onSubmit={handleSendCode} className="space-y-4">
          {error && !codeSent && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">邮箱</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={codeSent}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${codeSent ? 'border-slate-200 bg-slate-50' : 'border-slate-300'}`}
                placeholder="注册时使用的邮箱"
                required
              />
            </div>
          </div>
          {!codeSent && (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  发送中...
                </>
              ) : (
                '发送验证码'
              )}
            </button>
          )}
        </form>

        {/* 发送成功后：同页展开验证码 + 新密码 */}
        {codeSent && (
          <>
            {sentCode && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                开发环境验证码：<strong className="text-lg">{sentCode}</strong>
              </div>
            )}
            <form onSubmit={handleResetWithCode} className="mt-4 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {/* 验证码输入区：单独高亮，避免用户找不到 */}
              <div className="p-4 rounded-xl bg-primary-50 border-2 border-primary-200">
                <p className="text-sm font-medium text-primary-900 mb-2">请在此输入邮件中的 6 位验证码</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 text-lg font-mono tracking-[0.3em] border-2 border-primary-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  aria-label="邮箱验证码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">新密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="至少 6 位"
                    minLength={6}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="再次输入"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    提交中...
                  </>
                ) : (
                  '确认重置密码'
                )}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-600">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-primary-600 hover:underline"
              >
                更换邮箱
              </button>
              {' · '}
              <Link to="/login" className="text-primary-600 hover:underline">
                返回登录
              </Link>
            </p>
          </>
        )}

        {!codeSent && (
          <p className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
              <ArrowLeft className="w-4 h-4" />
              返回登录
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
