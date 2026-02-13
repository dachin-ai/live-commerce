import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Sidebar from '../components/Sidebar'
import { useCurrentUser, updateProfile, changePassword, changeEmail } from '../services/auth'
import { useToast } from '../contexts/ToastContext'
import { User, Lock, Mail, Save } from 'lucide-react'

export default function Profile() {
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
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
        queryClient.setQueryData(['currentUser'], (old: any) => (old ? { ...old, name: data.name } : old))
      }
      toast.success('资料已更新')
      setNameSaving(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || '更新失败')
      setNameSaving(false)
    },
  })

  const changeEmailMutation = useMutation({
    mutationFn: ({ email, pwd }: { email: string; pwd: string }) => changeEmail(email, pwd),
    onSuccess: (data) => {
      if (data?.email) {
        queryClient.setQueryData(['currentUser'], (old: any) => (old ? { ...old, email: data.email } : old))
      }
      toast.success('邮箱已修改')
      setNewEmail('')
      setEmailPassword('')
      setEmailSaving(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || '修改失败')
      setEmailSaving(false)
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ current, newPwd }: { current: string; newPwd: string }) =>
      changePassword(current, newPwd),
    onSuccess: () => {
      toast.success('密码已修改')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaving(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || '修改失败')
      setPasswordSaving(false)
    },
  })

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.warning('姓名不能为空')
      return
    }
    if (trimmed === user?.name) {
      toast.info('未做修改')
      return
    }
    setNameSaving(true)
    updateProfileMutation.mutate(trimmed)
  }

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.warning('请填写当前密码、新密码并确认')
      return
    }
    if (newPassword.length < 6) {
      toast.warning('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.warning('两次输入的新密码不一致')
      return
    }
    setPasswordSaving(true)
    changePasswordMutation.mutate({ current: currentPassword, newPwd: newPassword })
  }

  const handleChangeEmail = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newEmail.trim()
    if (!trimmed) {
      toast.warning('请输入新邮箱')
      return
    }
    if (trimmed === user?.email) {
      toast.info('新邮箱与当前邮箱相同')
      return
    }
    if (!emailPassword) {
      toast.warning('请输入当前密码')
      return
    }
    setEmailSaving(true)
    changeEmailMutation.mutate({ email: trimmed, pwd: emailPassword })
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar 
        isExpanded={sidebarExpanded}
        onToggle={setSidebarExpanded}
      />
      <main className="flex-1 overflow-auto p-6 transition-all duration-300">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">个人中心</h1>
          <p className="text-gray-500 text-sm mb-8">管理您的账号资料与密码</p>

          {/* 基本资料 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gray-500" />
              基本资料
            </h2>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="您的姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前邮箱</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {user?.email ?? '—'}
                </div>
              </div>
              <button
                type="submit"
                disabled={nameSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
              </button>
            </form>
          </section>

          {/* 修改邮箱 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-gray-500" />
              修改邮箱
            </h2>
            <form onSubmit={handleChangeEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新邮箱</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入新邮箱地址"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
                <input
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入当前密码以验证身份"
                />
              </div>
              <button
                type="submit"
                disabled={emailSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
              </button>
            </form>
          </section>

          {/* 修改密码 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-gray-500" />
              修改密码
            </h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入当前密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="至少 6 位"
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="再次输入新密码"
                />
              </div>
              <button
                type="submit"
                disabled={passwordSaving}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
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
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
