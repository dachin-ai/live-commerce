import { useState, useEffect } from 'react'
import { Store as StoreIcon, Plus, X, Search, Upload, Circle, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStores, useDeleteStore, type Store } from '../services/stores'
import { useStore } from '../contexts/StoreContext'
import { useToast } from '../contexts/ToastContext'
import { getCountryLabel } from '../utils/regionI18n'

interface StoreListProps {
  /** 点击某店铺的「上传」时调用，用于打开导入数据弹窗并预选该店铺 */
  onUploadStore?: (store: Store) => void
}

const REGION_OPTIONS = ['中国', '中国香港', '中国台湾', '印度', '泰国', '越南', '印度尼西亚', '马来西亚', '新加坡', '菲律宾', '缅甸', '柬埔寨', '老挝', '文莱', '其他']
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
    if (!confirm(t('stores.deleteConfirm'))) return
    try {
      await deleteStore.mutateAsync(id)
      toast.success(t('stores.deleted'))
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
      toast.error(errorMsg || t('stores.deleteFailed'))
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.storeList')}</h2>
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
          <label className="text-xs text-slate-500 whitespace-nowrap">{t('dashboard.filterRegion', { default: '国家' })}</label>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="bg-white/40 backdrop-blur-md border border-white/60 hover:bg-white/60 transition-all duration-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 px-2 py-1.5 text-slate-800 text-xs min-w-[90px]"
          >
            <option value="">{t('dashboard.filterAll', { default: '全部' })}</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {getCountryLabel(t, r)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <label className="text-xs text-slate-500 whitespace-nowrap">{t('dashboard.filterPlatform', { default: '平台' })}</label>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="bg-white/40 backdrop-blur-md border border-white/60 hover:bg-white/60 transition-all duration-200 rounded-lg focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 px-2 py-1.5 text-slate-800 text-xs min-w-[90px]"
          >
            <option value="">{t('dashboard.filterAll', { default: '全部' })}</option>
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      {/* 搜索框 */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white/40 backdrop-blur-md border border-white/60 hover:bg-white/60 transition-all rounded-lg focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 text-sm text-slate-800 placeholder:text-slate-400"
            placeholder={t('dashboard.searchStore')}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-500">{t('dashboard.loading')}</div>
      ) : stores.length === 0 ? (
        <div className="text-center py-10">
          <StoreIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm mb-1">{t('dashboard.noStores')}</p>
          <p className="text-xs text-slate-400">
            {t('dashboard.clickToCreate')}
          </p>
        </div>
      ) : (
        <>
        <div className="mb-2 text-xs text-slate-400">
          共 {total} 个店铺
          {total > 50 && ` · 每页最多 50 个`}
        </div>
        <div className="space-y-1.5 max-h-[80vh] overflow-y-auto pr-1">
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
                  ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-200'
                  : 'bg-slate-50 hover:bg-slate-100 border-transparent hover:border-slate-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Circle
                    className={`w-2 h-2 flex-shrink-0 ${
                      store.status === 'active' ? 'text-green-500 fill-green-500' : 'text-slate-400 fill-slate-400'
                    }`}
                  />
                  <StoreIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="font-medium text-slate-900 truncate">{store.name}</span>
                  {store.nameTh && (
                    <span className="text-xs text-slate-500 truncate">({store.nameTh})</span>
                  )}
                </div>
                {store.description && (
                  <p className="text-xs text-slate-500 mt-1 truncate">{store.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {store.region && (
                    <span className="text-xs text-slate-400">{store.region}</span>
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
                  className="text-primary-500 hover:text-primary-700 p-1"
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
            <span className="text-sm text-slate-500">
              第 {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} 条，共 {total} 个店铺
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                上一页
              </button>
              <span className="px-3 py-1 text-sm text-slate-600">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
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
