import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Users, Key, Plus, X, Edit, CheckCircle, Cpu, Store } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import UserMultiSelectModal from '../components/UserMultiSelectModal'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useUserStoreAccess, useSetUserStoreAccess } from '../services/users'
import { User, type UserRole } from '../services/users'
import { getScriptLLMConfig, saveScriptLLMConfig, saveScriptLLMPermissions, getLlmTools, setFeatureLlmMapping, DEFAULT_SCRIPT_LLM_URL, DOUBAO_LLM_BASE_URL } from '../services/ai'
import { useToast } from '../contexts/ToastContext'
import { copyToClipboard } from '../utils/clipboard'
import { getCurrentUserRole } from '../services/auth'
import { useStores } from '../services/stores'

/** 角色与可访问功能（viewer 已合并为 manager） */
const ROLE_MATRIX = [
  { role: 'admin', roleLabelKey: 'sidebar.roleAdmin', descKey: 'permissionConfig.roleAdminDesc' },
  { role: 'manager', roleLabelKey: 'sidebar.roleManager', descKey: 'permissionConfig.roleManagerDesc' },
  { role: 'operator', roleLabelKey: 'sidebar.roleOperator', descKey: 'permissionConfig.roleOperatorDesc' },
  { role: 'user', roleLabelKey: 'sidebar.roleUser', descKey: 'permissionConfig.roleUserDesc' },
]

const LLM_PERMISSION_FEATURES: { id: string; labelKey: string }[] = [
  { id: 'script', labelKey: 'admin.llmFeatureScript' },
  { id: 'tasks', labelKey: 'admin.llmFeatureTasks' },
]

type TabId = 'roles' | 'users' | 'stores' | 'llm'

const TABS: { id: TabId; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'roles', labelKey: 'permissionConfig.tabRoles', icon: <Shield className="w-4 h-4" /> },
  { id: 'users', labelKey: 'permissionConfig.tabUsers', icon: <Users className="w-4 h-4" /> },
  { id: 'stores', labelKey: 'permissionConfig.tabStores', icon: <Store className="w-4 h-4" /> },
  { id: 'llm', labelKey: 'permissionConfig.tabLLM', icon: <Key className="w-4 h-4" /> },
]

type UsersQueryError = { response?: { status?: number; data?: { error?: string } } }

const REGION_OPTIONS = ['中国', '中国香港', '中国台湾', '泰国', '越南', '印度尼西亚', '马来西亚', '新加坡', '菲律宾', '缅甸', '柬埔寨', '老挝', '文莱', '其他']
const PLATFORM_OPTIONS = ['抖音', 'TikTok', '淘宝', '天猫', '京东', '小红书', '快手', '其他']

/** 店铺可见配置：选择用户，为其配置可查看的店铺（运营/普通用户才需配置，admin/manager 看全部） */
function StoreAccessTab({
  users,
  t,
  toast,
}: {
  users: User[]
  t: (key: string, opts?: { fallback?: string }) => string
  toast: { success: (m: string) => void; error: (m: string) => void }
}) {
  const targetUsers = users.filter((u) => u.role === 'operator' || u.role === 'user')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [regionFilter, setRegionFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const { data: storeAccess, isLoading: accessLoading } = useUserStoreAccess(selectedUserId)
  const { data: storesData } = useStores({
    limit: 200,
    light: true,
    region: regionFilter || undefined,
    platform: platformFilter || undefined,
  })
  const stores = storesData?.items ?? []
  const setAccess = useSetUserStoreAccess()
  const [localAccessIds, setLocalAccessIds] = useState<string[]>([])

  useEffect(() => {
    if (storeAccess) setLocalAccessIds(storeAccess.accessStoreIds || [])
    else setLocalAccessIds([])
  }, [selectedUserId, storeAccess])

  const ownedSet = new Set(storeAccess?.ownedStoreIds ?? [])
  const selectableStores = stores.filter((s) => !ownedSet.has(s.id))

  const handleSave = async () => {
    if (!selectedUserId) {
      toast.error(t('permissionConfig.selectUserFirst', { fallback: '请先选择用户' }))
      return
    }
    try {
      await setAccess.mutateAsync({ userId: selectedUserId, accessStoreIds: localAccessIds })
      toast.success(t('permissionConfig.storeAccessSaved', { fallback: '店铺可见配置已保存' }))
    } catch {
      toast.error(t('permissionConfig.storeAccessSaveFailed', { fallback: '保存失败' }))
    }
  }

  const toggleStore = (storeId: string) => {
    setLocalAccessIds((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('permissionConfig.tabStores', { fallback: '店铺可见' })}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('permissionConfig.storeAccessDesc', { fallback: '为运营/普通用户配置可查看的店铺。管理员与经理默认可看全部。归属店自动可见，此处仅配置额外授权店铺。' })}</p>
      </div>
      {targetUsers.length === 0 ? (
        <p className="text-gray-500">{t('permissionConfig.noTargetUsers', { fallback: '暂无运营或普通用户，请先在「用户管理」中创建。' })}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('permissionConfig.selectUserToConfig', { fallback: '选择用户' })}</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="min-w-[220px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">— {t('permissionConfig.selectUser', { fallback: '选择' })} —</option>
                {targetUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — {u.role === 'operator' ? t('sidebar.roleOperator') : t('sidebar.roleUser')}
                  </option>
                ))}
              </select>
            </div>
            {selectedUserId && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.filterRegion', { fallback: '国家' })}</label>
                  <select
                    value={regionFilter}
                    onChange={(e) => setRegionFilter(e.target.value)}
                    className="min-w-[100px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                  >
                    <option value="">{t('dashboard.filterAll', { fallback: '全部' })}</option>
                    {REGION_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.filterPlatform', { fallback: '平台' })}</label>
                  <select
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                    className="min-w-[100px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                  >
                    <option value="">{t('dashboard.filterAll', { fallback: '全部' })}</option>
                    {PLATFORM_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          {selectedUserId && (
            <>
              {accessLoading ? (
                <p className="text-gray-500">{t('common.loading')}</p>
              ) : (
                <div className="rounded-xl border-2 border-gray-200 bg-gray-50/50 p-4">
                  {storeAccess && ownedSet.size > 0 && (
                    <p className="text-sm text-gray-600 mb-3">
                      {t('permissionConfig.ownedStores', { fallback: '归属店（自动可见）' })}：{storeAccess.ownedStoreIds.length} {t('permissionConfig.storesCount', { fallback: '个' })}
                    </p>
                  )}
                  <p className="text-sm font-medium text-gray-700 mb-2">{t('permissionConfig.extraAccessibleStores', { fallback: '额外可查看的店铺（勾选授权）' })}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-52 overflow-y-auto rounded-lg border border-gray-300 bg-white p-3">
                    {selectableStores.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                      >
                        <input
                          type="checkbox"
                          checked={localAccessIds.includes(s.id)}
                          onChange={() => toggleStore(s.id)}
                          className="w-4 h-4 text-indigo-600"
                        />
                        <span className="text-sm truncate" title={s.name}>{s.name}</span>
                      </label>
                    ))}
                  </div>
                  {selectableStores.length === 0 && (
                    <p className="text-sm text-gray-500">{t('permissionConfig.noExtraStores', { fallback: '除归属店外无其他店铺可授权' })}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={setAccess.isPending}
                    className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {setAccess.isPending ? t('admin.saving') : t('common.save', { fallback: '保存' })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function PermissionConfigPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const currentRole = getCurrentUserRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = (searchParams.get('tab') || 'roles') as TabId
  const activeTab = TABS.some((x) => x.id === tabParam) ? tabParam : 'roles'

  const setTab = (id: TabId) => setSearchParams({ tab: id })

  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  // 用户管理
  const { data: users = [], isLoading, isError, error } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    email: string
    password: string
    role: User['role']
    status: 'active' | 'inactive'
  }>({
    name: '',
    email: '',
    password: '',
    role: 'user',
    status: 'active',
  })

  // LLM 配置
  const [llmUrl, setLlmUrl] = useState(DEFAULT_SCRIPT_LLM_URL)
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmAllowedUserIds, setLlmAllowedUserIds] = useState<string[]>([])
  const [llmEnabledFeatures, setLlmEnabledFeatures] = useState<string[]>(LLM_PERMISSION_FEATURES.map((f) => f.id))
  const [showLlmUserModal, setShowLlmUserModal] = useState(false)

  const { data: llmToolsData } = useQuery({
    queryKey: ['llm-tools'],
    queryFn: getLlmTools,
    staleTime: 60_000,
  })
  const [featureMapping, setFeatureMapping] = useState<{ script?: string; tasks?: string; anomaly?: string }>({})
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

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.warning(t('admin.fillRequired'))
      return
    }
    try {
      await createUser.mutateAsync(formData)
      setShowCreateModal(false)
      setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
    } catch {
      toast.error(t('admin.createUserFailed'))
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      status: user.status || 'active',
    })
  }

  const handleUpdate = async () => {
    if (!editingUser || !formData.name || !formData.email) {
      toast.warning('请填写完整信息')
      return
    }
    try {
      await updateUser.mutateAsync({
        id: editingUser.id,
        ...formData,
        password: formData.password || undefined,
      })
      setEditingUser(null)
      setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
    } catch {
      toast.error('更新用户失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个用户吗？删除后无法恢复。')) return
    try {
      await deleteUser.mutateAsync(id)
      toast.success('用户已删除')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      toast.error(e.response?.data?.error || e.message || '删除用户失败')
    }
  }

  useEffect(() => {
    getScriptLLMConfig()
      .then((r) => {
        setLlmConfigured(r.configured)
        if (r.allowedUserIds !== undefined) {
          setLlmAllowedUserIds(
            Array.isArray(r.allowedUserIds)
              ? r.allowedUserIds
              : r.allowedUserIds === null && users.length > 0
                ? users.map((u) => u.id)
                : []
          )
        }
        if (r.enabledFeatures !== undefined) {
          const allIds = LLM_PERMISSION_FEATURES.map((f) => f.id)
          if (r.enabledFeatures == null) setLlmEnabledFeatures(allIds)
          else if (Array.isArray(r.enabledFeatures)) setLlmEnabledFeatures(r.enabledFeatures.filter((id) => allIds.includes(id)))
        }
      })
      .catch(() => setLlmConfigured(false))
  }, [users])

  const handleSaveLLMConfig = async () => {
    const url = llmUrl.trim()
    const key = llmApiKey.trim()
    const model = llmModel.trim() || undefined
    if (!url || !key) {
      toast.warning('请填写 API 地址与 API 密钥')
      return
    }
    setLlmSaving(true)
    try {
      const toSend = llmAllowedUserIds.length === users.length ? undefined : llmAllowedUserIds
      const allFeatureIds = LLM_PERMISSION_FEATURES.map((f) => f.id)
      const featuresToSend = llmEnabledFeatures.length === allFeatureIds.length ? undefined : llmEnabledFeatures
      await saveScriptLLMConfig(url, key, model, toSend, featuresToSend)
      setLlmConfigured(true)
      setLlmApiKey('')
      toast.success(
        toSend === undefined
          ? t('admin.llmConfigSavedAllUsers', { fallback: 'LLM 配置已保存，对所有用户生效。' })
          : t('admin.llmConfigSavedSelected', { fallback: 'LLM 配置已保存，仅选定用户可使用。' })
      )
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || '保存失败')
    } finally {
      setLlmSaving(false)
    }
  }

  const selectAllLlmUsers = () => setLlmAllowedUserIds(users.map((u) => u.id))
  const clearAllLlmUsers = () => setLlmAllowedUserIds([])
  const handleSaveLLMPermissionsOnly = async () => {
    setLlmSaving(true)
    try {
      const allFeatureIds = LLM_PERMISSION_FEATURES.map((f) => f.id)
      await saveScriptLLMPermissions(llmAllowedUserIds, llmEnabledFeatures, users.length, allFeatureIds.length)
      toast.success(t('admin.llmPermissionsSaved', { fallback: '权限已保存，无需填写 API 密钥。' }))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || '保存失败')
    } finally {
      setLlmSaving(false)
    }
  }
  const toggleLlmFeature = (featureId: string) =>
    setLlmEnabledFeatures((prev) => (prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]))
  const selectAllLlmFeatures = () => setLlmEnabledFeatures(LLM_PERMISSION_FEATURES.map((f) => f.id))
  const clearAllLlmFeatures = () => setLlmEnabledFeatures([])

  return (
    <div className="h-screen min-h-0 bg-gray-50 flex overflow-hidden">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <div className="flex-1 flex flex-col min-h-0 overflow-auto min-w-0">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shrink-0">
          <div className="px-6 py-4 flex items-center gap-3">
            <Shield className="w-6 h-6 text-indigo-600" aria-hidden />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">{t('permissionConfig.title', { fallback: '权限配置' })}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t('permissionConfig.subtitle', { fallback: '角色与功能、用户管理、LLM 配置' })}</p>
            </div>
          </div>
          {/* 标签页 */}
          <div className="flex gap-1 px-6 pb-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                {t(tab.labelKey, { fallback: tab.id === 'roles' ? '角色与功能' : tab.id === 'users' ? '用户管理' : 'LLM 配置' })}
              </button>
            ))}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 w-full min-w-0">
          {/* Tab: 角色与功能 */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 text-indigo-900 text-sm">
                <p className="font-medium mb-1">{t('permissionConfig.howToChange', { fallback: '如何修改权限？' })}</p>
                <p className="mb-0">{t('permissionConfig.howToChangeDesc', { fallback: '权限由「用户管理」中的用户角色控制。请切换到「用户管理」标签，为每个用户选择角色（管理员 / 经理 / 运营 / 普通用户），保存后即生效。' })}</p>
              </div>
              <div className="bg-white rounded-xl border-2 border-gray-200 shadow-sm overflow-hidden">
                <h2 className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-900">
                  {t('permissionConfig.roleMatrixTitle', { fallback: '角色与可访问功能' })}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('permissionConfig.roleColumn', { fallback: '角色' })}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('permissionConfig.accessColumn', { fallback: '可访问功能' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROLE_MATRIX.map((row) => (
                        <tr key={row.role} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{t(row.roleLabelKey)}</td>
                          <td className="py-3 px-4 text-gray-600">{t(row.descKey, { fallback: row.role })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab: 用户管理 */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{t('admin.title')}</h2>
                  <p className="text-sm text-gray-500 mt-1">{t('admin.subtitle')}</p>
                </div>
                <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t('admin.createUser')}
                </button>
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
              ) : isError ? (
                <div className="text-center py-8 px-4">
                  <p className="text-red-600 font-medium">
                    {(error as UsersQueryError | null)?.response?.status === 403
                      ? t('admin.error403', { fallback: '无权限，仅管理员或经理可访问用户管理。' })
                      : t('admin.errorLoadUsers', { fallback: '加载用户列表失败，请稍后重试。' })}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('admin.nameLabel')}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('admin.userIdLabel', { fallback: '用户 ID' })}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('admin.emailLabel')}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('admin.roleLabel')}</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">{t('admin.statusLabel')}</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-700">{t('admin.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900">{user.name}</td>
                          <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                            <span title={user.id}>{user.id.length > 12 ? `${user.id.slice(0, 8)}…` : user.id}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await copyToClipboard(user.id)
                                toast[ok ? 'success' : 'error'](ok ? t('admin.userIdCopied', { fallback: '用户 ID 已复制' }) : t('admin.copyFailed', { fallback: '复制失败' }))
                              }}
                              className="ml-1.5 text-indigo-600 hover:underline"
                            >
                              {t('admin.copy', { fallback: '复制' })}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{user.email}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-1 text-xs rounded ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-700'
                                  : user.role === 'manager' ? 'bg-indigo-100 text-indigo-700'
                                    : user.role === 'operator' ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {user.role === 'admin' ? t('sidebar.roleAdmin') : user.role === 'manager' ? t('sidebar.roleManager') : user.role === 'operator' ? t('sidebar.roleOperator') : t('sidebar.roleUser')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 text-xs rounded ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                              {user.status === 'active' ? t('admin.active') : t('admin.inactive')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleEdit(user)} className="text-blue-600 hover:text-blue-800" title={t('common.edit')}>
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800" title={t('common.delete')}>
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

          {/* Tab: 店铺可见 */}
          {activeTab === 'stores' && (
            <StoreAccessTab
              users={users}
              t={t}
              toast={toast}
            />
          )}

          {/* Tab: LLM 配置 */}
          {activeTab === 'llm' && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Key className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{t('admin.llmConfig')}</h2>
                    <p className="text-sm text-gray-500">{t('admin.llmConfigDesc')}</p>
                    <p className="text-sm text-indigo-600 mt-1 font-medium">{t('admin.llmUsersPermissionHint', { fallback: '下方勾选可使用 LLM 的用户；全选表示对所有用户生效。' })}</p>
                  </div>
                </div>
                {llmConfigured === true && (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 text-green-800 rounded-lg text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{t('admin.llmConfiguredHint')}</span>
                  </div>
                )}
                <div className="grid gap-4 max-w-xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.apiUrl')}</label>
                    <input type="url" value={llmUrl} onChange={(e) => setLlmUrl(e.target.value)} placeholder={DOUBAO_LLM_BASE_URL} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-xs text-gray-500 mt-1">{t('admin.apiUrlHint')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.apiKey')}</label>
                    <input type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder={t('admin.apiKeyPlaceholder')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.modelLabel')}</label>
                    <input type="text" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder={t('admin.modelPlaceholder')} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.llmUsersLabel')}</label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button type="button" onClick={() => setShowLlmUserModal(true)} className="px-3 py-2 border border-indigo-600 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50">
                        {llmAllowedUserIds.length === 0 ? t('admin.selectUsers', { fallback: '选择用户' }) : t('admin.selectedUsersCount', { count: llmAllowedUserIds.length, fallback: `已选 ${llmAllowedUserIds.length} 人` })}
                      </button>
                      <span className="text-xs text-gray-500">
                        {llmAllowedUserIds.length === users.length && users.length > 0 ? t('admin.allUsersCanUse', { fallback: '当前为全选，所有用户可使用' }) : llmAllowedUserIds.length === 0 ? t('admin.onlyAdminCanUse', { fallback: '未选时仅管理员可用' }) : null}
                      </span>
                      {llmAllowedUserIds.length > 0 && llmAllowedUserIds.length < users.length && (
                        <div className="flex gap-2">
                          <button type="button" onClick={selectAllLlmUsers} className="text-xs text-indigo-600 hover:underline">{t('admin.selectAll')}</button>
                          <button type="button" onClick={clearAllLlmUsers} className="text-xs text-gray-500 hover:underline">{t('admin.clear')}</button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 mt-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-gray-600">{t('admin.llmFeaturesLabel', { fallback: '能够使用的功能' })}</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={selectAllLlmFeatures} className="text-xs text-indigo-600 hover:underline">{t('admin.selectAll')}</button>
                          <button type="button" onClick={clearAllLlmFeatures} className="text-xs text-gray-500 hover:underline">{t('admin.clear')}</button>
                        </div>
                      </div>
                      <ul className="text-sm text-gray-700 space-y-1.5">
                        {LLM_PERMISSION_FEATURES.map((f) => (
                          <li key={f.id}>
                            <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100/80 rounded px-1 py-0.5 -mx-1">
                              <input type="checkbox" checked={llmEnabledFeatures.includes(f.id)} onChange={() => toggleLlmFeature(f.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                              <span>{t(f.labelKey)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <UserMultiSelectModal
                    open={showLlmUserModal}
                    onClose={() => setShowLlmUserModal(false)}
                    users={users}
                    selectedIds={llmAllowedUserIds}
                    onConfirm={setLlmAllowedUserIds}
                    title={t('admin.llmUsersLabel')}
                    placeholder={t('admin.searchUserPlaceholder', { fallback: '搜索姓名或邮箱' })}
                    permissionScope="llm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleSaveLLMPermissionsOnly} disabled={llmSaving} className="px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50" title={t('admin.savePermissionsOnlyHint', { fallback: '只保存用户与功能勾选，无需填写 API 密钥' })}>
                      {llmSaving ? t('admin.saving') : t('admin.savePermissionsOnly', { fallback: '仅保存权限' })}
                    </button>
                    <button type="button" onClick={handleSaveLLMConfig} disabled={llmSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {llmSaving ? t('admin.saving') : t('admin.saveConfig')}
                    </button>
                  </div>
                </div>
              </div>

              {llmToolsData && llmToolsData.tools.length > 0 && llmToolsData.featureMapping !== undefined && (
                <div className="rounded-xl border-2 border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Cpu className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{t('admin.featureMappingTitle', { fallback: '功能与模型映射' })}</h2>
                      <p className="text-sm text-gray-500">{t('admin.featureMappingDesc', { fallback: '为各功能指定使用的 LLM 工具；未指定时使用话术配置或默认工具。' })}</p>
                    </div>
                  </div>
                  <div className="space-y-3 max-w-xl">
                    {[
                      { key: 'script' as const, label: t('admin.llmFeatureScript') },
                      { key: 'tasks' as const, label: t('admin.llmFeatureTasks') },
                      { key: 'anomaly' as const, label: t('admin.llmFeatureAnomaly', { fallback: '异常分析' }) },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-3">
                        <label className="w-28 text-sm font-medium text-gray-700">{label}</label>
                        <select
                          value={featureMapping[key] ?? ''}
                          onChange={(e) => setFeatureMapping((p) => ({ ...p, [key]: e.target.value || undefined }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">— 使用默认 —</option>
                          {llmToolsData.tools.map((tool) => (
                            <option key={tool.id} value={tool.id}>{tool.url && tool.url.includes('coze.site') ? `${tool.name} (Coze)` : tool.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button type="button" onClick={() => setFeatureMappingMutation.mutate({ script: featureMapping.script || undefined, tasks: featureMapping.tasks || undefined, anomaly: featureMapping.anomaly || undefined })} disabled={setFeatureMappingMutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm">
                      {setFeatureMappingMutation.isPending ? t('admin.saving') : t('admin.saveFeatureMapping', { fallback: '保存映射' })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 创建/编辑用户模态框 */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">{editingUser ? t('admin.editUser') : t('admin.createUserTitle')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.nameLabel')} *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.emailLabel')} *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{editingUser ? t('admin.newPasswordHint') : t('admin.passwordRequired')}</label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={editingUser ? '留空则不修改密码' : '请输入密码'} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="active">活跃</option>
                  <option value="inactive">禁用</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCreateModal(false); setEditingUser(null); setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' }) }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={editingUser ? handleUpdate : handleCreate} disabled={createUser.isPending || updateUser.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{createUser.isPending || updateUser.isPending ? '处理中...' : editingUser ? '更新' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
