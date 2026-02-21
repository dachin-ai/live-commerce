import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Settings, Shield, Plus, X, Edit, Key, CheckCircle } from 'lucide-react'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../services/users'
import { User, type UserRole } from '../services/users'
import { getScriptLLMConfig, saveScriptLLMConfig, DEFAULT_SCRIPT_LLM_URL, DOUBAO_LLM_BASE_URL } from '../services/ai'
import Sidebar from '../components/Sidebar'
import { useToast } from '../contexts/ToastContext'

export default function AdminPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const { data: users = [], isLoading } = useUsers()
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
  // LLM 配置（仅管理员可保存；供智能待办、话术生成、异常分析等使用，终端用户在「LLM 调用方式」中选择）
  const [llmUrl, setLlmUrl] = useState(DEFAULT_SCRIPT_LLM_URL)
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmAllowedUserIds, setLlmAllowedUserIds] = useState<string[]>([])

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      toast.warning(t('admin.fillRequired'))
      return
    }

    try {
      await createUser.mutateAsync(formData)
      setShowCreateModal(false)
      setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
    } catch (error) {
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
        password: formData.password || undefined, // 如果密码为空则不更新
      })
      setEditingUser(null)
      setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
    } catch (error) {
      toast.error('更新用户失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个用户吗？删除后无法恢复。')) return
    try {
      await deleteUser.mutateAsync(id)
      toast.success('用户已删除')
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || error?.message || '删除用户失败'
      toast.error(errorMsg)
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
      await saveScriptLLMConfig(url, key, model, toSend)
      setLlmConfigured(true)
      setLlmApiKey('')
      toast.success(
        toSend === undefined
          ? t('admin.llmConfigSavedAllUsers', { fallback: 'LLM 配置已保存，对所有用户生效。' })
          : t('admin.llmConfigSavedSelected', { fallback: 'LLM 配置已保存，仅选定用户可使用。' })
      )
    } catch (e: any) {
      toast.error(e?.response?.data?.error || '保存失败')
  } finally {
    setLlmSaving(false)
  }
  }

  const toggleLlmUser = (userId: string) => {
    setLlmAllowedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }
  const selectAllLlmUsers = () => setLlmAllowedUserIds(users.map((u) => u.id))
  const clearAllLlmUsers = () => setLlmAllowedUserIds([])

  return (
    <div className="h-screen min-h-0 bg-gray-50 flex overflow-hidden">
      {/* 左侧导航栏 */}
      <Sidebar
        isExpanded={sidebarExpanded}
        onToggle={setSidebarExpanded}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-h-0 transition-all duration-300">
        {/* 顶部导航栏 */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-gray-600" aria-hidden />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('admin.title')}</h1>
                <p className="text-sm text-gray-500 mt-1">{t('admin.subtitle')}</p>
              </div>
            </div>
            {/* 预留：上线后可切换 Tab（系统设置、权限管理） */}
            <div className="flex items-center gap-1 text-gray-400" aria-hidden>
              <span className="p-2 rounded cursor-not-allowed" title="预留：系统设置">
                <Settings className="w-5 h-5" />
              </span>
              <span className="p-2 rounded cursor-not-allowed" title="预留：权限管理">
                <Shield className="w-5 h-5" />
              </span>
            </div>
          </div>
        </header>

        {/* 主要内容 */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* LLM 配置：可限定仅选定用户可使用（智能待办、话术、异常分析等） */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{t('admin.llmConfig')}</h2>
                  <p className="text-sm text-gray-500">
                    {t('admin.llmConfigDesc')}
                  </p>
                  <p className="text-sm text-indigo-600 mt-1 font-medium">
                    {t('admin.llmUsersPermissionHint', { fallback: '下方勾选可使用 LLM 的用户；全选表示对所有用户生效。' })}
                  </p>
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
                  <input
                    type="url"
                    value={llmUrl}
                    onChange={(e) => setLlmUrl(e.target.value)}
                    placeholder={DOUBAO_LLM_BASE_URL}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('admin.apiUrlHint')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.apiKey')}</label>
                  <input
                    type="password"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={t('admin.apiKeyPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.modelLabel')}</label>
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={t('admin.modelPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">{t('admin.llmUsersLabel')}</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllLlmUsers}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {t('admin.selectAll')}
                      </button>
                      <button
                        type="button"
                        onClick={clearAllLlmUsers}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        {t('admin.clear')}
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                    {users.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1">
                        <input
                          type="checkbox"
                          checked={llmAllowedUserIds.includes(u.id)}
                          onChange={() => toggleLlmUser(u.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-800">{u.name}</span>
                        <span className="text-xs text-gray-500">({u.email})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveLLMConfig}
                  disabled={llmSaving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {llmSaving ? t('admin.saving') : t('admin.saveConfig')}
                </button>
              </div>
            </div>

            <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{t('admin.title')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('admin.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('admin.createUser')}
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">{t('admin.nameLabel')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">{t('admin.emailLabel')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">{t('admin.roleLabel')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">{t('admin.statusLabel')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">{t('admin.createdAt')}</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">{user.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{user.email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-700'
                            : user.role === 'manager'
                            ? 'bg-indigo-100 text-indigo-700'
                            : user.role === 'operator'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {user.role === 'admin'
                            ? t('sidebar.roleAdmin')
                            : user.role === 'manager'
                            ? t('sidebar.roleManager')
                            : user.role === 'operator'
                            ? t('sidebar.roleOperator')
                            : user.role === 'viewer'
                            ? t('sidebar.roleViewer')
                            : t('sidebar.roleUser')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          user.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {user.status === 'active' ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-blue-600 hover:text-blue-800"
                          title={t('common.edit')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-red-600 hover:text-red-800"
                          title={t('common.delete')}
                        >
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

      {/* 创建/编辑用户模态框 */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingUser ? t('admin.editUser') : t('admin.createUserTitle')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admin.nameLabel')} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admin.emailLabel')} *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingUser ? t('admin.newPasswordHint') : t('admin.passwordRequired')}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={editingUser ? '留空则不修改密码' : '请输入密码'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  角色
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">{t('sidebar.roleUser')}</option>
                  <option value="operator">{t('sidebar.roleOperator')}</option>
                  <option value="manager">{t('sidebar.roleManager')}</option>
                  <option value="viewer">{t('sidebar.roleViewer')}</option>
                  <option value="admin">{t('sidebar.roleAdmin')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  状态
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">活跃</option>
                  <option value="inactive">禁用</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setEditingUser(null)
                  setFormData({ name: '', email: '', password: '', role: 'user' as UserRole, status: 'active' })
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={editingUser ? handleUpdate : handleCreate}
                disabled={createUser.isPending || updateUser.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createUser.isPending || updateUser.isPending
                  ? '处理中...'
                  : editingUser
                  ? '更新'
                  : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        </main>
      </div>
    </div>
  )
}
