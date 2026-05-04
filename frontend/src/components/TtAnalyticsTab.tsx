import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  Database, Upload, Trash2, BarChart3, ShoppingBag,
  Megaphone, Package, ChevronDown, RefreshCw, LayoutDashboard, Video
} from 'lucide-react'
import { useTtImportHistory, useDeleteTtImport, TtImportRecord, TT_DATA_TYPE_LABELS, TtDataType } from '../services/ttImport'
import TtImportModal from './TtImportModal'
import BiDashboard from './BiDashboard'

interface Props {
  storeId: string
  storeName: string
  dateFrom?: string
  dateTo?: string
  compareDateFrom?: string
  compareDateTo?: string
}

const TYPE_ICONS: Record<TtDataType, typeof Database> = {
  live_sessions: BarChart3,
  ad_sessions: Megaphone,
  store_products: ShoppingBag,
  product_details: Package,
  product_overview: ShoppingBag,
  video_sessions: Video,
}

const TYPE_COLORS: Record<TtDataType, string> = {
  live_sessions: '#3b82f6',
  ad_sessions: '#f59e0b',
  store_products: '#10b981',
  product_details: '#8b5cf6',
  product_overview: '#06b6d4',
  video_sessions: '#ec4899',
}

export default function TtAnalyticsTab({ storeId, storeName, dateFrom, dateTo, compareDateFrom, compareDateTo }: Props) {
  // 只保留两个顶级 Tab：BI 中台（分析主阵地）和 数据管理（导入历史）
  const [activeTab, setActiveTab] = useState<'overview' | 'bi'>('bi')
  const [showImport, setShowImport] = useState(false)
  const [expandedType, setExpandedType] = useState<TtDataType | null>(null)

  const { data: history, isLoading, refetch } = useTtImportHistory(storeId)
  const deleteMutation = useDeleteTtImport()

  // 按类型分组导入记录
  const grouped = useMemo(() => {
    if (!history) return {} as Record<TtDataType, TtImportRecord[]>
    return history.reduce<Record<string, TtImportRecord[]>>((acc, imp) => {
      if (!acc[imp.dataType]) acc[imp.dataType] = []
      acc[imp.dataType].push(imp)
      return acc
    }, {})
  }, [history])

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此导入批次吗？相关数据将一并清除。')) return
    try {
      await deleteMutation.mutateAsync(id)
      refetch()
    } catch {
      // handled by mutation
    }
  }

  // 汇总信息
  const summary = useMemo(() => {
    if (!history || history.length === 0) return { types: 0, totalImports: 0, totalRecords: 0 }
    const types = new Set(history.map(h => h.dataType)).size
    return {
      types,
      totalImports: history.length,
      totalRecords: history.reduce((s, h) => s + h.recordCount, 0),
    }
  }, [history])

  // 饼图
  const pieOption = useMemo(() => {
    if (!history || history.length === 0) return null
    const typeMap = new Map<string, number>()
    history.forEach(h => typeMap.set(h.dataType, (typeMap.get(h.dataType) || 0) + h.recordCount))
    return {
      tooltip: { trigger: 'item' as const },
      series: [{
        type: 'pie' as const, radius: ['40%', '70%'], padAngle: 2,
        data: Array.from(typeMap.entries()).map(([name, value]) => ({
          name: TT_DATA_TYPE_LABELS[name as TtDataType] || name, value,
          itemStyle: { color: TYPE_COLORS[name as TtDataType] }
        })),
        label: { show: true, fontSize: 11 },
      }],
    }
  }, [history])

  // 时间线图
  const timelineOption = useMemo(() => {
    if (!history || history.length === 0) return null
    const sorted = [...history].sort((a, b) => a.importedAt.localeCompare(b.importedAt))
    return {
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: sorted.map(h => new Date(h.importedAt).toLocaleDateString('zh-CN')),
        axisLabel: { fontSize: 10 },
      },
      yAxis: { type: 'value' as const },
      series: [{
        type: 'bar' as const, data: sorted.map(h => h.recordCount),
        itemStyle: {
          color: (p: { dataIndex: number }) => TYPE_COLORS[sorted[p.dataIndex]?.dataType as TtDataType] || '#94a3b8',
          borderRadius: [4, 4, 0, 0],
        }
      }],
      grid: { left: 40, right: 10, bottom: 24, top: 10 },
    }
  }, [history])

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-bold text-slate-900">TikTok 数据中心</h3>
            <p className="text-xs text-slate-500">上传平台导出数据 · BI 分析 · 商品雷达 · 广告矩阵</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
            <button
              onClick={() => setActiveTab('bi')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'bi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              BI 中台
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              数据管理
            </button>
          </div>

          <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-slate-100 transition-colors" title="刷新">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            上传数据
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium">数据类型</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{summary.types}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs text-emerald-600 font-medium">导入批次</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{summary.totalImports}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200 rounded-xl p-4">
          <p className="text-xs text-violet-600 font-medium">总记录数</p>
          <p className="text-2xl font-bold text-violet-900 mt-1">{summary.totalRecords.toLocaleString()}</p>
        </div>
      </div>

      {/* 图表区 */}
      {history && history.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pieOption && (
            <div className="card">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">数据类型分布</h4>
              <ReactECharts option={pieOption} style={{ height: 250 }} />
            </div>
          )}
          {timelineOption && (
            <div className="card">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">导入记录时间线</h4>
              <ReactECharts option={timelineOption} style={{ height: 250 }} />
            </div>
          )}
        </div>
      )}

      {/* 导入历史列表 */}
      <div className="card">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">导入历史</h4>
        {isLoading ? (
          <p className="text-center text-slate-500 py-8">加载中...</p>
        ) : !history || history.length === 0 ? (
          <div className="text-center py-12">
            <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">暂无导入数据</p>
            <p className="text-sm text-slate-400 mt-1">点击「上传数据」开始导入 TikTok 平台数据</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(grouped).map(([type, records]) => {
              const dt = type as TtDataType
              const Icon = TYPE_ICONS[dt] || Database
              const isExpanded = expandedType === dt
              return (
                <div key={type} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedType(isExpanded ? null : dt)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TYPE_COLORS[dt] + '20' }}>
                        <Icon className="w-4 h-4" style={{ color: TYPE_COLORS[dt] }} />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-slate-800 text-sm">{TT_DATA_TYPE_LABELS[dt]}</p>
                        <p className="text-xs text-slate-500">{records.length} 批次 · {records.reduce((s, r) => s + r.recordCount, 0)} 条</p>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 space-y-1">
                      {records.map(r => (
                        <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                          <div>
                            <p className="text-slate-700 font-medium">{r.fileName}</p>
                            <p className="text-xs text-slate-500">
                              {r.dateFrom ?? '?'} ~ {r.dateTo ?? '?'} · {r.recordCount} 条 · {r.currency} · {new Date(r.importedAt).toLocaleString('zh-CN', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="删除此批次"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </>
      ) : (
        <BiDashboard
          storeId={storeId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          compareDateFrom={compareDateFrom}
          compareDateTo={compareDateTo}
          onRequestUpload={() => setShowImport(true)}
        />
      )}

      {/* 导入弹窗 */}
      <TtImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        storeId={storeId}
        storeName={storeName}
        onImportComplete={() => refetch()}
      />
    </div>
  )
}
