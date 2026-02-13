import { useState } from 'react'
import { Store as StoreIcon, Plus, X, Search, Upload, Circle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStores, useDeleteStore, type Store } from '../services/stores'
import { useStore } from '../contexts/StoreContext'
import { useToast } from '../contexts/ToastContext'

interface StoreListProps {
  /** 点击某店铺的「上传」时调用，用于打开导入数据弹窗并预选该店铺 */
  onUploadStore?: (store: Store) => void
}

export default function StoreList({ onUploadStore }: StoreListProps = {}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { selectedStore, setSelectedStore } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const { data: stores = [], isLoading } = useStores(searchQuery)
  const deleteStore = useDeleteStore()

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个店铺吗？删除后无法恢复。')) return
    try {
      await deleteStore.mutateAsync(id)
      toast.success('店铺已删除')
    } catch (error: any) {
      console.error('删除店铺失败:', error)
      const errorMsg = error?.response?.data?.error || error?.message || '删除店铺失败，请检查网络连接或登录状态'
      toast.error(errorMsg)
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.storeList')}</h2>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.dispatchEvent(new CustomEvent('openCreateStoreModal'))
          }}
          className="btn-primary flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t('dashboard.createStore')}
        </button>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('dashboard.searchStore')}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">{t('dashboard.loading')}</div>
      ) : stores.length === 0 ? (
        <div className="text-center py-12">
          <StoreIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">{t('dashboard.noStores')}</p>
          <p className="text-sm text-gray-400">
            {t('dashboard.clickToCreate')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stores.map((store) => {
            const isSelected = selectedStore?.id === store.id
            return (
            <div
              key={store.id}
              role="button"
              tabIndex={0}
              title="点击切换为当前店铺"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return
                setSelectedStore(store)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if ((e.target as HTMLElement).closest('button')) return
                  setSelectedStore(store)
                }
              }}
              className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer border ${
                isSelected
                  ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
                  : 'bg-gray-50 hover:bg-gray-100 border-transparent hover:border-gray-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Circle
                    className={`w-2 h-2 flex-shrink-0 ${
                      store.status === 'active' ? 'text-green-500 fill-green-500' : 'text-gray-400 fill-gray-400'
                    }`}
                  />
                  <StoreIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span className="font-medium text-gray-900 truncate">{store.name}</span>
                  {store.nameTh && (
                    <span className="text-xs text-gray-500 truncate">({store.nameTh})</span>
                  )}
                </div>
                {store.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{store.description}</p>
                )}
                {store.region && (
                  <p className="text-xs text-gray-400 mt-1">{store.region}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onUploadStore?.(store)
                  }}
                  className="text-green-500 hover:text-green-700 p-1"
                  title={t('dashboard.uploadBaseline')}
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(store.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title={t('dashboard.deleteStore')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
