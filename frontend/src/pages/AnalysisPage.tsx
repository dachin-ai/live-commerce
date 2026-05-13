import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../contexts/StoreContext'
import AppLayout from '../components/AppLayout'
import StoreSelector from '../components/StoreSelector'
import TtAnalyticsTab from '../components/TtAnalyticsTab'
import WeekPicker from '../components/WeekPicker'
import { formatLocalYMD } from '../utils/calendarLocal'
import { getCurrentUserRole } from '../services/auth'
import { useStores } from '../services/stores'
import {
  Store,
  Calendar,
  X,
  GitCompare,
  CalendarDays,
  Pencil,
  Check,
  RotateCcw,
  Building2,
} from 'lucide-react'

// 快捷时段定义（参考抖店罗盘 / 生意参谋）
type QuickRange = '7d' | '14d' | '30d' | '90d' | 'today' | 'yesterday' | 'week' | 'custom' | 'all'

interface DateRange { from: string; to: string }

function getQuickRange(type: QuickRange): DateRange {
  const today = new Date()
  const fmt = (d: Date) => formatLocalYMD(d)
  switch (type) {
    case 'today': { const s = fmt(today); return { from: s, to: s } }
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); const s = fmt(y); return { from: s, to: s } }
    case '7d': { const s = new Date(today); s.setDate(s.getDate() - 6); return { from: fmt(s), to: fmt(today) } }
    case '14d': { const s = new Date(today); s.setDate(s.getDate() - 13); return { from: fmt(s), to: fmt(today) } }
    case '30d': { const s = new Date(today); s.setDate(s.getDate() - 29); return { from: fmt(s), to: fmt(today) } }
    case '90d': { const s = new Date(today); s.setDate(s.getDate() - 89); return { from: fmt(s), to: fmt(today) } }
    default: return { from: fmt(today), to: fmt(today) }
  }
}

const QUICK_OPTIONS: { key: QuickRange; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: '7d', label: '近7天' },
  { key: '14d', label: '近14天' },
  { key: '30d', label: '近30天' },
  { key: '90d', label: '近90天' },
  { key: 'custom', label: '自定义' },
]

export default function AnalysisPage() {
  const { t } = useTranslation()
  const { selectedStore } = useStore()

  // 角色判断（管理/运营）
  const role = getCurrentUserRole()
  const isManager = role === 'admin' || role === 'manager'

  // 管理员可切换分析的目标店铺（null = 当前选中店铺）
  const [analysisStoreId, setAnalysisStoreId] = useState<string | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL')
  const { data: storeData } = useStores({ limit: 100, light: true })
  const allStores = (storeData?.items ?? []) as { id: string; name: string; platform?: string | null }[]
  const effectiveStoreId = analysisStoreId ?? selectedStore?.id ?? ''
  const effectiveStoreName = allStores.find(s => s.id === effectiveStoreId)?.name ?? selectedStore?.name ?? ''

  // 平台去重 — 管理员可按平台缩小店铺范围
  const allPlatforms = Array.from(new Set(allStores.map(s => s.platform ?? '').filter(Boolean)))
  const hasManyPlatforms = allPlatforms.length > 1
  const visibleStores = selectedPlatform === 'ALL' || !hasManyPlatforms
    ? allStores
    : allStores.filter(s => s.platform === selectedPlatform)

  const [quickRange, setQuickRange] = useState<QuickRange>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showWeekPicker, setShowWeekPicker] = useState(false)
  const weekPickerRef = useRef<HTMLDivElement>(null)

  // 对比模式
  const [compareMode, setCompareMode] = useState(false)
  const [isManualCompare, setIsManualCompare] = useState(false)
  const [manualCompareFrom, setManualCompareFrom] = useState('')
  const [manualCompareTo, setManualCompareTo] = useState('')
  const [editingCompare, setEditingCompare] = useState(false)

  // 点击外部关闭 WeekPicker
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (weekPickerRef.current && !weekPickerRef.current.contains(e.target as Node)) {
        setShowWeekPicker(false)
      }
    }
    if (showWeekPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showWeekPicker])

  const handleQuickSelect = useCallback((key: QuickRange) => {
    setQuickRange(key)
    if (key === 'all') { setShowCustom(false); setDateFrom(''); setDateTo(''); return }
    if (key === 'custom') { setShowCustom(true); return }
    setShowCustom(false)
    const range = getQuickRange(key)
    setDateFrom(range.from)
    setDateTo(range.to)
  }, [])

  const handleWeekSelect = useCallback((from: string, to: string) => {
    setQuickRange('week')
    setDateFrom(from)
    setDateTo(to)
    setShowCustom(false)
    setShowWeekPicker(false)
  }, [])

  const handleApplyCustom = useCallback(() => {
    if (!customFrom || !customTo) return
    setDateFrom(customFrom); setDateTo(customTo); setShowCustom(false)
  }, [customFrom, customTo])

  const handleClearDate = useCallback(() => {
    setQuickRange('all'); setDateFrom(''); setDateTo('')
    setShowCustom(false); setCustomFrom(''); setCustomTo('')
    setCompareMode(false)
  }, [])

  // 自动对比期（等长前推）
  const autoCompare = useMemo(() => {
    if (!dateFrom || !dateTo) return { from: '', to: '' }
    // 加 T00:00:00 强制本地时区解析，避免纯日期字符串被当 UTC 处理
    // （UTC+8 凌晨时 new Date("2024-04-16") === 前一天 16:00 本地时间，导致 span 偏差 1 天）
    const from = new Date(dateFrom + 'T00:00:00')
    const to   = new Date(dateTo   + 'T00:00:00')
    const span = Math.round((to.getTime() - from.getTime()) / 86400000)
    const cTo = new Date(from); cTo.setDate(cTo.getDate() - 1)
    const cFrom = new Date(cTo); cFrom.setDate(cFrom.getDate() - span)
    return { from: formatLocalYMD(cFrom), to: formatLocalYMD(cTo) }
  }, [dateFrom, dateTo])

  // 最终对比期
  const compareDateFrom = compareMode
    ? (isManualCompare && manualCompareFrom ? manualCompareFrom : autoCompare.from)
    : undefined
  const compareDateTo = compareMode
    ? (isManualCompare && manualCompareTo ? manualCompareTo : autoCompare.to)
    : undefined

  const handleApplyManualCompare = () => {
    if (manualCompareFrom && manualCompareTo) {
      setIsManualCompare(true); setEditingCompare(false)
    }
  }

  const handleResetAutoCompare = () => {
    setIsManualCompare(false); setManualCompareFrom(''); setManualCompareTo(''); setEditingCompare(false)
  }

  const today = formatLocalYMD(new Date())

  return (
    <AppLayout
      title={t('analysis.title')}
      subtitle={t('analysis.subtitle')}
      headerExtra={<StoreSelector />}
    >
      {!selectedStore ? (
        <div className="card text-center py-12">
          <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('dashboard.selectStore')}</h2>
          <p className="text-slate-500">{t('analysis.selectStoreHintAnalysis')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── 全局日期筛选栏 ──────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-medium">数据时段</span>
            </div>

            {/* 快捷按钮 */}
            <div className="flex items-center gap-1 flex-wrap">
              {QUICK_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleQuickSelect(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    quickRange === opt.key && opt.key !== 'custom'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : quickRange === opt.key && opt.key === 'custom'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              {/* 按周（日历选周） */}
              <div className="relative" ref={weekPickerRef}>
                <button
                  onClick={() => setShowWeekPicker(v => !v)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    quickRange === 'week'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : showWeekPicker
                      ? 'bg-blue-50 text-blue-600 border border-blue-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  按周
                </button>
                {showWeekPicker && (
                  <WeekPicker onSelect={handleWeekSelect} onClose={() => setShowWeekPicker(false)} />
                )}
              </div>
            </div>

            {/* 自定义日期 */}
            {showCustom && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <input type="date" value={customFrom} max={customTo || today} min="2020-01-01"
                  onChange={e => setCustomFrom(e.target.value)}
                  className="text-xs bg-transparent outline-none text-slate-700 w-[110px]" />
                <span className="text-slate-300 text-xs">至</span>
                <input type="date" value={customTo} min={customFrom} max={today}
                  onChange={e => setCustomTo(e.target.value)}
                  className="text-xs bg-transparent outline-none text-slate-700 w-[110px]" />
                <button onClick={handleApplyCustom} disabled={!customFrom || !customTo}
                  className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-md disabled:opacity-40 hover:bg-blue-700 transition-colors">确定</button>
              </div>
            )}

            {/* 当前时段 + 对比按钮 */}
            {!showCustom && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  {quickRange === 'all' ? '全部数据' : dateFrom === dateTo ? dateFrom : `${dateFrom} ~ ${dateTo}`}
                </span>
                {quickRange !== 'all' && (
                  <button onClick={handleClearDate} className="p-1 text-slate-400 hover:text-slate-600" title="重置">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {quickRange !== 'all' && dateFrom && dateTo && (
                  <button
                    onClick={() => setCompareMode(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      compareMode
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-600'
                    }`}
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    对比
                  </button>
                )}
              </div>
            )}

            {/* 对比期显示 + 编辑 */}
            {compareMode && (
              <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-100 mt-0.5 flex-wrap">
                <span className="text-[10px] text-violet-500 font-medium shrink-0">vs 对比期</span>

                {!editingCompare ? (
                  <>
                    <span className="text-xs text-slate-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-1">
                      {compareDateFrom} ~ {compareDateTo}
                    </span>
                    <span className="text-[10px] text-slate-400">{isManualCompare ? '(手动)' : '(自动等长前期)'}</span>
                    {/* 编辑按钮 */}
                    <button
                      onClick={() => {
                        setManualCompareFrom(compareDateFrom || '')
                        setManualCompareTo(compareDateTo || '')
                        setEditingCompare(true)
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors border border-transparent hover:border-violet-200"
                    >
                      <Pencil className="w-3 h-3" /> 自定义对比期
                    </button>
                    {isManualCompare && (
                      <button onClick={handleResetAutoCompare}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                        <RotateCcw className="w-3 h-3" /> 恢复自动
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <input type="date" value={manualCompareFrom} max={manualCompareTo || today} min="2020-01-01"
                      onChange={e => setManualCompareFrom(e.target.value)}
                      className="text-xs border border-violet-200 bg-white rounded-lg px-2 py-1 outline-none focus:border-violet-400 w-32" />
                    <span className="text-slate-300 text-xs">~</span>
                    <input type="date" value={manualCompareTo} min={manualCompareFrom} max={today}
                      onChange={e => setManualCompareTo(e.target.value)}
                      className="text-xs border border-violet-200 bg-white rounded-lg px-2 py-1 outline-none focus:border-violet-400 w-32" />
                    <button onClick={handleApplyManualCompare} disabled={!manualCompareFrom || !manualCompareTo}
                      className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 text-white text-[10px] font-medium rounded-lg disabled:opacity-40 hover:bg-violet-700 transition-colors">
                      <Check className="w-3 h-3" /> 确定
                    </button>
                    <button onClick={() => setEditingCompare(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded-lg transition-colors">取消</button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── 管理员跨店铺切换栏 ─────────────────────────────────── */}
          {isManager && allStores.length > 1 && (
            <div className="bg-white border border-indigo-100 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Building2 className="w-4 h-4" />
                <span className="text-xs font-medium">店铺视角</span>
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                {/* 平台筛选行（有多个平台时才显示） */}
                {hasManyPlatforms && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 shrink-0">平台:</span>
                    <button
                      onClick={() => setSelectedPlatform('ALL')}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border ${
                        selectedPlatform === 'ALL'
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      全部
                    </button>
                    {allPlatforms.map(p => (
                      <button
                        key={p}
                        onClick={() => setSelectedPlatform(selectedPlatform === p ? 'ALL' : p)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border ${
                          selectedPlatform === p
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                {/* 店铺切换行 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {visibleStores.map(store => (
                    <button
                      key={store.id}
                      onClick={() => setAnalysisStoreId(store.id === selectedStore?.id ? null : store.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        effectiveStoreId === store.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {store.name}
                      {store.platform && hasManyPlatforms && selectedPlatform === 'ALL' && (
                        <span className="opacity-60 text-[10px]">({store.platform})</span>
                      )}
                    </button>
                  ))}
                  {visibleStores.length === 0 && (
                    <span className="text-xs text-slate-400">该平台下暂无店铺</span>
                  )}
                </div>
              </div>
              <span className="ml-auto text-[10px] text-slate-400 italic hidden sm:block shrink-0">管理员视角</span>
            </div>
          )}

          {/* ── TtAnalyticsTab ───────────────────────────────────────── */}
          <TtAnalyticsTab
            storeId={effectiveStoreId}
            storeName={effectiveStoreName}
            dateFrom={dateFrom}
            dateTo={dateTo}
            compareDateFrom={compareDateFrom}
            compareDateTo={compareDateTo}
          />
        </div>
      )}
    </AppLayout>
  )
}
