import { useState, useEffect } from 'react'
import { Store as StoreIcon, Plus, X, Search, Upload, Circle, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStores, useDeleteStore, type Store } from '../services/stores'
import { useStore } from '../contexts/StoreContext'
import { useToast } from '../contexts/ToastContext'

interface StoreListProps {
  /** 点击某店铺的「上传」时调用，用于打开导入数据弹窗并预选该店铺 */
  onUploadStore?: (store: Store) => void
}

const REGION_OPTIONS = ['中国', '中国香港', '中国台湾', '泰国', '越南', '印度尼西亚', '马来西亚', '新加坡', '菲律宾', '缅甸', '柬埔寨', '老挝', '文莱', '其他']
const PLATFORM_OPTIONS = ['抖音', 'TikTok', '淘宝', '天猫', '京东', '小红书', '快手', '其他']

export default function StoreList({ onUploadStore }: StoreListProps = {}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { selectedStore, setSelectedStore } = useStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useStores({
    search: searchQuery,
    region: regionFilter || undefined,
    platform: platformFilter || undefined,
    page,
    limit: 50,
    light: true,
  })
  // 搜索或筛选变更时重置页码
  useEffect(() => setPage(1), [searchQuery, regionFilter, platformFilter])
  const stores = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const deleteStore = useDeleteStore()

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个店铺吗？删除后无法恢复。')) return
    try {
      await deleteStore.mutateAsync(id)
      toast.success('店铺已删除')
    } catch (error) {
      console.error('删除店铺失败:', error)
      let errorMsg: string | undefined
      if (error && typeof error === 'object') {
        if ('response' in error) {
          const response = (error as { response?: { data?: { error?: string } } }).response
          errorMsg = response?.data?.error
        }
        if (!errorMsg && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
          errorMsg = (error as { message?: string }).message
        }
      }
      toast.error(errorMsg || '删除店铺失败，请检查网络连接或登录状态')
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

      {/* 筛选：国家、平台 */}
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <label className="text-sm text-gray-600 whitespace-nowrap">{t('dashboard.filterRegion', { default: '国家' })}</label>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm min-w-[100px]"
          >
            <option value="">{t('dashboard.filterAll', { default: '全部' })}</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <label className="text-sm text-gray-600 whitespace-nowrap">{t('dashboard.filterPlatform', { default: '平台' })}</label>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm min-w-[100px]"
          >
            <option value="">{t('dashboard.filterAll', { default: '全部' })}</option>
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
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
        <>
        <div className="mb-2 text-sm text-gray-500">
          共 {total} 个店铺
          {total > 50 && ` · 每页最多 50 个`}
        </div>
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
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {store.region && (
                    <span className="text-xs text-gray-400">{store.region}</span>
                  )}
                  {store.userName && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700" title={t('dashboard.storeOwner', { default: '归属用户' })}>
                      {store.userName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.dispatchEvent(new CustomEvent('openEditStoreModal', { detail: store }))
                  }}
                  className="text-blue-500 hover:text-blue-700 p-1"
                  title={t('dashboard.editStore', { default: '编辑店铺' })}
                >
                  <Pencil className="w-4 h-4" />
                </button>
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
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleDelete(store.id)
                  }}
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
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-sm text-gray-500">
              第 {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} 条，共 {total} 个店铺
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
