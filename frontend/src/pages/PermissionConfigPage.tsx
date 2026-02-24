import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Shield, Users, ArrowRight } from 'lucide-react'
import Sidebar from '../components/Sidebar'

/** 角色与可访问功能（与《角色与权限矩阵》一致） */
const ROLE_MATRIX = [
  { role: 'admin', roleLabelKey: 'sidebar.roleAdmin', descKey: 'permissionConfig.roleAdminDesc' },
  { role: 'manager', roleLabelKey: 'sidebar.roleManager', descKey: 'permissionConfig.roleManagerDesc' },
  { role: 'operator', roleLabelKey: 'sidebar.roleOperator', descKey: 'permissionConfig.roleOperatorDesc' },
  { role: 'viewer', roleLabelKey: 'sidebar.roleViewer', descKey: 'permissionConfig.roleViewerDesc' },
  { role: 'user', roleLabelKey: 'sidebar.roleUser', descKey: 'permissionConfig.roleUserDesc' },
]

export default function PermissionConfigPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  return (
    <div className="h-screen min-h-0 bg-gray-50 flex overflow-hidden">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shrink-0">
          <div className="px-6 py-4 flex items-center gap-3">
            <Shield className="w-6 h-6 text-indigo-600" aria-hidden />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('permissionConfig.title', { fallback: '权限配置' })}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{t('permissionConfig.subtitle', { fallback: '查看角色与功能对应关系，实际权限在用户管理中通过「角色」设置' })}</p>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 max-w-4xl">
          <div className="space-y-6">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-900 text-sm">
              <p className="font-medium mb-1">{t('permissionConfig.howToChange', { fallback: '如何修改权限？' })}</p>
              <p className="mb-3">{t('permissionConfig.howToChangeDesc', { fallback: '权限由「用户管理」中的用户角色控制。请进入用户管理，为每个用户选择角色（管理员 / 经理 / 运营 / 查看者 / 普通用户），保存后即生效。' })}</p>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                <Users className="w-4 h-4" />
                {t('permissionConfig.goToUserManagement', { fallback: '去用户管理' })}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900">{t(row.roleLabelKey)}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{t(row.descKey, { fallback: row.role })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
