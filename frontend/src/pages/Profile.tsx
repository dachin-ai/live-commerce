import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import AppLayout from '../components/AppLayout'
import { GlassInput } from '../components/ui/GlassInput'
import { GlassButton } from '../components/ui/GlassButton'
import { useCurrentUser, updateProfile, changePassword, changeEmail, type User as AuthUser } from '../services/auth'
import { useToast } from '../contexts/ToastContext'
import { User, Lock, Mail, Save } from 'lucide-react'

export default function Profile() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [name, setName] = useState(user?.name ?? '')
  const [nameSaving, setNameSaving] = useState(false)
  useEffect(() => {
    if (user?.name !== undefined) setName(user.name)
  }, [user?.name])
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const updateProfileMutation = useMutation({
    mutationFn: (newName: string) => updateProfile(newName),
    onSuccess: (data) => {
      if (data?.name) {
        localStorage.setItem('userName', data.name)
        queryClient.setQueryData<AuthUser | undefined>(['currentUser'], (old) =>
          old ? { ...old, name: data.name } : old
        )
      }
      toast.success(t('profile.updated'))
      setNameSaving(false)
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || error.message || t('profile.updateFailed'))
      setNameSaving(false)
    },
  })

  const changeEmailMutation = useMutation({
    mutationFn: ({ email, pwd }: { email: string; pwd: string }) => changeEmail(email, pwd),
    onSuccess: (data) => {
      if (data?.email) {
        queryClient.setQueryData<AuthUser | undefined>(['currentUser'], (old) =>
          old ? { ...old, email: data.email } : old
        )
      }
      toast.success(t('profile.emailUpdated'))
      setNewEmail('')
      setEmailPassword('')
      setEmailSaving(false)
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || error.message || t('profile.changeFailed'))
      setEmailSaving(false)
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ current, newPwd }: { current: string; newPwd: string }) =>
      changePassword(current, newPwd),
    onSuccess: () => {
      toast.success(t('profile.passwordUpdated'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaving(false)
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(error.response?.data?.error || error.message || t('profile.changeFailed'))
      setPasswordSaving(false)
    },
  })

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.warning(t('profile.nameRequired'))
      return
    }
    if (trimmed === user?.name) {
      toast.info(t('profile.noChanges'))
      return
    }
    setNameSaving(true)
    updateProfileMutation.mutate(trimmed)
  }

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.warning(t('profile.fillPasswordFields'))
      return
    }
    if (newPassword.length < 6) {
      toast.warning(t('profile.passwordMinLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.warning(t('profile.passwordMismatch'))
      return
    }
    setPasswordSaving(true)
    changePasswordMutation.mutate({ current: currentPassword, newPwd: newPassword })
  }

  const handleChangeEmail = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!trimmed) {
      toast.warning(t('profile.enterNewEmail'))
      return
    }
    if (trimmed === user?.email) {
      toast.info(t('profile.emailSameAsCurrent'))
      return
    }
    if (!emailPassword) {
      toast.warning(t('profile.enterCurrentPassword'))
      return
    }
    setEmailSaving(true)
    changeEmailMutation.mutate({ email: trimmed, pwd: emailPassword })
  }

  return (
    <AppLayout
      title="个人中心"
      subtitle="管理您的账号资料与密码"
    >
      <div className="max-w-2xl mx-auto">
        {/* 基本资料 */}
        <section className="card mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-slate-500" />
            基本资料
          </h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
              <GlassInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="您的姓名"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">当前邮箱</label>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/50 backdrop-blur-md border border-white/60 rounded-xl text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                {user?.email ?? '—'}
              </div>
            </div>
            <GlassButton
              type="submit"
              variant="primary"
              disabled={nameSaving}
              className="gap-2"
            >
              {nameSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  保存资料
                </>
              )}
            </GlassButton>
          </form>
        </section>

        {/* 修改邮箱 */}
        <section className="card mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-slate-500" />
            修改邮箱
          </h2>
          <form onSubmit={handleChangeEmail} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">新邮箱</label>
              <GlassInput
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="请输入新邮箱地址"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">当前密码</label>
              <GlassInput
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="请输入当前密码以验证身份"
              />
            </div>
            <GlassButton
              type="submit"
              variant="primary"
              disabled={emailSaving}
              className="gap-2"
            >
              {emailSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  提交中...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  修改邮箱
                </>
              )}
            </GlassButton>
          </form>
        </section>

        {/* 修改密码 */}
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-500" />
            修改密码
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">当前密码</label>
              <GlassInput
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
              <GlassInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
              <GlassInput
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
              />
            </div>
            <GlassButton
              type="submit"
              variant="primary"
              disabled={passwordSaving}
              className="gap-2"
            >
              {passwordSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  提交中...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  修改密码
                </>
              )}
            </GlassButton>
          </form>
        </section>
      </div>
    </AppLayout>
  )
}
