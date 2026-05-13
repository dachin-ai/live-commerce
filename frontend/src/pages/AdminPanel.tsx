import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Edit, Key, CheckCircle, AlertCircle, Cpu, Users, Shield, Server } from 'lucide-react'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../services/users'
import { User, type UserRole } from '../services/users'
import { getScriptLLMConfig, saveScriptLLMConfig, saveScriptLLMPermissions, getLlmTools, setFeatureLlmMapping, DEFAULT_SCRIPT_LLM_URL, DOUBAO_LLM_BASE_URL } from '../services/ai'
import AppLayout from '../components/AppLayout'
import UserMultiSelectModal from '../components/UserMultiSelectModal'
import { useToast } from '../contexts/ToastContext'
import { copyToClipboard } from '../utils/clipboard'
import { getCurrentUserRole } from '../services/auth'
import { GlassInput } from '../components/ui/GlassInput'
import { GlassButton } from '../components/ui/GlassButton'

type UsersQueryError = {
  response?: { status?: number; data?: { error?: string } }
}

const LLM_PERMISSION_FEATURES: { id: string; labelKey: string; desc: string }[] = [
  { id: 'script', labelKey: 'admin.llmFeatureScript', desc: '话术生成' },
  { id: 'tasks', labelKey: 'admin.llmFeatureTasks', desc: '智能生成待办' },
]

type AdminTab = 'llm' | 'users'

export default function AdminPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const currentRole = getCurrentUserRole()
  const { data: users = [], isLoading, isError, error } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const [activeTab, setActiveTab] = useState<AdminTab>('llm')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<{
    name: string; email: string; password: string; role: User['role']; status: 'active' | 'inactive'
  }>({ name: '', email: '', password: '', role: 'user', status: 'active' })

  const [llmUrl, setLlmUrl] = useState(DEFAULT_SCRIPT_LLM_URL)
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmAllowedUserIds, setLlmAllowedUserIds] = useState<string[]>([])
  const [llmEnabledFeatures, setLlmEnabledFeatures] = useState<string[]>(LLM_PERMISSION_FEATURES.map((f) => f.id))
  const [showLlmUserModal, setShowLlmUserModal] = useState(false)

  const queryClient = useQueryClient()
  const { data: llmToolsData } = useQuery({ queryKey: ['llm-tools'], queryFn: getLlmTools, staleTime: 60_000 })
  const [featureMapping, setFeatureMapping] = useState<{ script?: string; tasks?: string; anomaly?: string; video?: string; systemAgent?: string }>({})

  useEffect(() => {
    if (llmToolsData?.featureMapping) setFeatureMapping(llmToolsData.featureMapping)
  }, [llmToolsData?.featureMapping])

  const setFeatureMappingMutation = useMutation({
    mutationFn: setFeatureLlmMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-tools'] })
      toast.success(t('admin.featureMappingSaved', { fallback: '功能映射已保存' }))
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      toast.error(e.response?.data?.error || '保存失败')
    },
  })

  useEffect(() => {
    getScriptLLMConfig()
      .then((r) => {
        setLlmConfigured(r.configured)
        if (r.allowedUserIds !== undefined) {
          setLlmAllowedUserIds(
            Array.isArray(r.allowedUserIds) ? r.allowedUserIds :
            r.allowedUserIds === null && users.length > 0 ? users.map((u) => u.id) : []
          )
        }
        if (r.enabledFeatures !== undefined) {
          const allIds = LLM_PERMISSION_FEATURES.map((f) => f.id)
          setLlmEnabledFeatures(
            r.enabledFeatures === null || r.enabledFeatures === undefined ? allIds :
            Array.isArray(r.enabledFeatures) ? r.enabledFeatures.filter((id) => allIds.includes(id)) : allIds
          )
        }
      })
      .catch(() => setLlmConfigured(false))
  }, [users])

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.password) { toast.warning(t('admin.fillRequired')); return }
    try {
      await createUser.mutateAsync(formData)
      setShowCreateModal(false)
      setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
    } catch { toast.error(t('admin.createUserFailed')) }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({ name: user.name, email: user.email, password: '', role: user.role, status: user.status || 'active' })
  }

  const handleUpdate = async () => {
    if (!editingUser || !formData.name || !formData.email) { toast.warning(t('common.fillAllRequired')); return }
    try {
      await updateUser.mutateAsync({ id: editingUser.id, ...formData, password: formData.password || undefined })
      setEditingUser(null)
      setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
    } catch { toast.error(t('admin.updateUserFailed')) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin.confirmDeleteUser'))) return
    try {
      await deleteUser.mutateAsync(id)
      toast.success(t('admin.userDeleted'))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      toast.error(err.response?.data?.error || err.message || t('admin.deleteUserFailed'))
    }
  }

  const handleSaveLLMConfig = async () => {
    const url = llmUrl.trim(); const key = llmApiKey.trim(); const model = llmModel.trim() || undefined
    if (!url || !key) { toast.warning(t('admin.fillApiUrlAndKey')); return }
    setLlmSaving(true)
    try {
      const toSend = llmAllowedUserIds.length === users.length ? undefined : llmAllowedUserIds
      const allFeatureIds = LLM_PERMISSION_FEATURES.map((f) => f.id)
      const featuresToSend = llmEnabledFeatures.length === allFeatureIds.length ? undefined : llmEnabledFeatures
      await saveScriptLLMConfig(url, key, model, toSend, featuresToSend)
      setLlmConfigured(true); setLlmApiKey('')
      toast.success(toSend === undefined ? 'LLM 配置已保存，对所有用户生效。' : 'LLM 配置已保存，仅选定用户可使用。')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || '保存失败')
    } finally { setLlmSaving(false) }
  }

  const handleSaveLLMPermissionsOnly = async () => {
    setLlmSaving(true)
    try {
      const allFeatureIds = LLM_PERMISSION_FEATURES.map((f) => f.id)
      await saveScriptLLMPermissions(llmAllowedUserIds, llmEnabledFeatures, users.length, allFeatureIds.length)
      toast.success('权限已保存，无需填写 API 密钥。')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || '保存失败')
    } finally { setLlmSaving(false) }
  }

  const toggleLlmFeature = (featureId: string) => {
    setLlmEnabledFeatures((prev) => prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId])
  }

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'llm', label: 'LLM 配置', icon: <Server className="w-4 h-4" /> },
    { id: 'users', label: '用户管理', icon: <Users className="w-4 h-4" /> },
  ]

  const toolOptions = llmToolsData?.tools ?? []
  const hasTools = toolOptions.length > 0

  return (
    <AppLayout title="管理员" subtitle="权限配置、用户管理、LLM 配置">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── LLM 配置 Tab ── */}
      {activeTab === 'llm' && (
        <div className="space-y-5">
          {/* Status Banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
            llmConfigured === true
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : llmConfigured === false
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            {llmConfigured === true ? (
              <><CheckCircle className="w-4 h-4 shrink-0" /><span>LLM 已配置并生效；下方勾选用户可使用话术生成与智能生成待办。</span></>
            ) : llmConfigured === false ? (
              <><AlertCircle className="w-4 h-4 shrink-0" /><span>尚未配置 LLM，请填写 API 地址与密钥后保存配置。</span></>
            ) : (
              <span>检查配置中…</span>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Card 1: API 配置 */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">API 配置</h3>
                  <p className="text-xs text-slate-500">支持 Coze、豆包、OpenAI 等兼容接口</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.apiUrl')}
                  </label>
                  <GlassInput
                    type="url"
                    value={llmUrl}
                    onChange={(e) => setLlmUrl(e.target.value)}
                    placeholder={DOUBAO_LLM_BASE_URL}
                  />
                  <p className="text-xs text-slate-400 mt-1">{t('admin.apiUrlHint')}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.apiKey')} <span className="text-red-500">*</span>
                  </label>
                  <GlassInput
                    type="password"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={t('admin.apiKeyPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('admin.modelLabel')}{' '}
                    <span className="text-slate-400 font-normal">(可选)</span>
                  </label>
                  <GlassInput
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={t('admin.modelPlaceholder')}
                  />
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <GlassButton onClick={handleSaveLLMConfig} disabled={llmSaving} variant="primary" className="w-full justify-center">
                  {llmSaving ? t('admin.saving') : '保存 API 配置'}
                </GlassButton>
              </div>
            </div>

            {/* Card 2: 访问权限 */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">访问权限</h3>
                  <p className="text-xs text-slate-500">控制哪些用户可使用 LLM 功能</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* User Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">可使用 LLM 的用户</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowLlmUserModal(true)}
                      className="px-3 py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors"
                    >
                      {llmAllowedUserIds.length === 0
                        ? '选择用户'
                        : `已选 ${llmAllowedUserIds.length} 人`}
                    </button>
                    <span className="text-xs text-slate-400">
                      {llmAllowedUserIds.length === users.length && users.length > 0
                        ? '全选 · 所有用户可用'
                        : llmAllowedUserIds.length === 0
                        ? '未选 · 仅管理员可用'
                        : null}
                    </span>
                    {llmAllowedUserIds.length > 0 && llmAllowedUserIds.length < users.length && (
                      <div className="flex gap-2 ml-auto">
                        <button type="button" onClick={() => setLlmAllowedUserIds(users.map((u) => u.id))} className="text-xs text-indigo-600 hover:underline">全选</button>
                        <button type="button" onClick={() => setLlmAllowedUserIds([])} className="text-xs text-slate-400 hover:underline">清除</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Feature Toggles */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">开放的功能</label>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setLlmEnabledFeatures(LLM_PERMISSION_FEATURES.map((f) => f.id))} className="text-xs text-indigo-600 hover:underline">全选</button>
                      <button type="button" onClick={() => setLlmEnabledFeatures([])} className="text-xs text-slate-400 hover:underline">清除</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {LLM_PERMISSION_FEATURES.map((f) => (
                      <label key={f.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={llmEnabledFeatures.includes(f.id)}
                          onChange={() => toggleLlmFeature(f.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{f.desc}</p>
                          <p className="text-xs text-slate-400">{t(f.labelKey)}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100">
                <GlassButton onClick={handleSaveLLMPermissionsOnly} disabled={llmSaving} variant="secondary" className="w-full justify-center">
                  {llmSaving ? t('admin.saving') : '仅保存权限设置'}
                </GlassButton>
              </div>
            </div>
          </div>

          {/* Card 3: 功能与模型映射 */}
          {hasTools && llmToolsData?.featureMapping !== undefined && (
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center shrink-0">
                  <Cpu className="w-4 h-4 text-cyan-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">功能与模型映射</h3>
                  <p className="text-xs text-slate-500">为各功能指定使用的 LLM 工具；未指定时使用默认配置</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: 'script' as const, label: '话术生成' },
                  { key: 'tasks' as const, label: '智能待办' },
                  { key: 'anomaly' as const, label: '异常分析' },
                  { key: 'systemAgent' as const, label: '系统 Agent' },
                ].map((item) => (
                  <div key={item.key}>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">{item.label}</label>
                    <select
                      value={featureMapping[item.key] ?? ''}
                      onChange={(e) => setFeatureMapping((p) => ({ ...p, [item.key]: e.target.value || undefined }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">— 使用默认 —</option>
                      {toolOptions.map((tool) => (
                        <option key={tool.id} value={tool.id}>
                          {tool.url?.includes('coze.site') ? `${tool.name} (Coze)` : tool.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <GlassButton
                  onClick={() => setFeatureMappingMutation.mutate({
                    script: featureMapping.script || undefined,
                    tasks: featureMapping.tasks || undefined,
                    anomaly: featureMapping.anomaly || undefined,
                    video: featureMapping.video || undefined,
                    systemAgent: featureMapping.systemAgent || undefined,
                  })}
                  disabled={setFeatureMappingMutation.isPending}
                  variant="primary"
                >
                  {setFeatureMappingMutation.isPending ? t('admin.saving') : '保存映射'}
                </GlassButton>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 用户管理 Tab ── */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{t('admin.title')}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{t('admin.subtitle')}</p>
            </div>
            <GlassButton onClick={() => setShowCreateModal(true)} variant="primary" className="gap-2">
              <Plus className="w-4 h-4" />
              {t('admin.createUser')}
            </GlassButton>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">{t('common.loading')}</div>
          ) : isError ? (
            <div className="text-center py-12 px-4">
              <p className="text-red-600 font-medium">
                {(error as UsersQueryError | null)?.response?.status === 403
                  ? '无权限，仅管理员或经理可访问用户管理。'
                  : '加载用户列表失败，请稍后重试。'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">姓名</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">用户 ID</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">邮箱</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">角色</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">状态</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">注册时间</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-3 text-sm font-medium text-slate-900">{user.name}</td>
                      <td className="py-3.5 px-3 hidden sm:table-cell">
                        <span className="text-xs font-mono text-slate-400">{user.id.length > 12 ? `${user.id.slice(0, 8)}…` : user.id}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await copyToClipboard(user.id)
                            if (ok) { toast.success('用户 ID 已复制') } else { toast.error('复制失败') }
                          }}
                          className="ml-2 text-indigo-500 hover:text-indigo-700 text-xs"
                        >复制</button>
                      </td>
                      <td className="py-3.5 px-3 text-sm text-slate-600">{user.email}</td>
                      <td className="py-3.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          user.role === 'manager' ? 'bg-indigo-100 text-indigo-700' :
                          user.role === 'operator' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {user.role === 'admin' ? t('sidebar.roleAdmin')
                            : user.role === 'manager' ? t('sidebar.roleManager')
                            : user.role === 'operator' ? t('sidebar.roleOperator')
                            : t('sidebar.roleUser')}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 hidden md:table-cell">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {user.status === 'active' ? t('admin.active') : t('admin.inactive')}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-sm text-slate-400 hidden lg:table-cell">
                        {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleEdit(user)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title={t('common.edit')}>
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(user.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title={t('common.delete')}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Modal */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 pb-4 border-b border-slate-100">
              {editingUser ? t('admin.editUser') : t('admin.createUserTitle')}
            </h3>
            <div className="space-y-4">
              {[
                { label: `${t('admin.nameLabel')} *`, key: 'name', type: 'text' },
                { label: `${t('admin.emailLabel')} *`, key: 'email', type: 'email' },
                { label: editingUser ? t('admin.newPasswordHint') : t('admin.passwordRequired'), key: 'password', type: 'password' },
              ].map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{field.label}</label>
                  <GlassInput
                    type={field.type}
                    value={formData[field.key as keyof typeof formData] as string}
                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                    placeholder={field.key === 'password' && editingUser ? t('admin.newPasswordHint') : undefined}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('admin.roleLabel')}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="user">{t('sidebar.roleUser')}</option>
                  <option value="operator">{t('sidebar.roleOperator')}</option>
                  {currentRole === 'admin' && (
                    <>
                      <option value="manager">{t('sidebar.roleManager')}</option>
                      <option value="admin">{t('sidebar.roleAdmin')}</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('admin.statusLabel')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="active">{t('admin.active')}</option>
                  <option value="inactive">{t('admin.inactive')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <GlassButton
                onClick={() => { setShowCreateModal(false); setEditingUser(null); setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' }) }}
                variant="secondary"
              >{t('common.cancel')}</GlassButton>
              <GlassButton onClick={editingUser ? handleUpdate : handleCreate} disabled={createUser.isPending || updateUser.isPending} variant="primary">
                {createUser.isPending || updateUser.isPending ? t('common.processing', { defaultValue: '处理中...' }) : editingUser ? t('common.update', { defaultValue: '更新' }) : t('common.create')}
              </GlassButton>
            </div>
          </div>
        </div>
      )}

      <UserMultiSelectModal
        open={showLlmUserModal}
        onClose={() => setShowLlmUserModal(false)}
        users={users}
        selectedIds={llmAllowedUserIds}
        onConfirm={setLlmAllowedUserIds}
        title="可使用 LLM 的用户"
        placeholder="搜索姓名或邮箱"
        permissionScope="llm"
      />
    </AppLayout>
  )
}
