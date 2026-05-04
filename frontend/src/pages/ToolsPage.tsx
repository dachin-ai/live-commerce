import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStore } from '../contexts/StoreContext'
import { useCurrentUser } from '../services/auth'
import AppLayout from '../components/AppLayout'
import StoreSelector from '../components/StoreSelector'
import AIFeatures from '../components/AIFeatures'
import { Store, BarChart3 } from 'lucide-react'

export default function ToolsPage() {
  const { t } = useTranslation()
  const { toolId } = useParams<{ toolId?: string }>()
  const { selectedStore } = useStore()
  const { data: currentUser } = useCurrentUser()

  // 根据用户角色显示不同功能（仅区分运营与管理员）
  const userRole = currentUser?.role || 'user'
  const isOperator = userRole === 'operator' // 运营
  const isManager = userRole === 'admin' || userRole === 'manager' // 管理员

  return (
    <AppLayout
      title={t('tools.title')}
      subtitle={t('tools.subtitle')}
      headerExtra={<StoreSelector />}
    >
      {!selectedStore ? (
        <div className="card text-center py-12">
          <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('tools.selectStore')}</h2>
          <p className="text-slate-500">{t('tools.selectStoreHint')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* AI 功能区域：无 toolId 时显示工具列表，有 toolId 时显示对应工具表单 */}
          <AIFeatures toolId={toolId} />

          {/* 运营账号功能说明（话术/录屏 + 全部工具，管理员同见） */}
          {(isOperator || isManager) && (
            <div className="card bg-green-50 border-green-200">
              <div className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-green-900 mb-1">{t('tools.operatorFeatures')}</h3>
                  <p className="text-sm text-green-800">
                    {t('tools.operatorFeaturesDesc')}
                  </p>
                  <p className="text-xs text-green-700 mt-2 opacity-90">
                    {t('tools.operatorFeaturesStatus')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
