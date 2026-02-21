import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveStats } from '../services/stats'
import { useStore } from '../contexts/StoreContext'
import { useCurrentUser } from '../services/auth'
import { usePreferences, useUpdatePreferences } from '../services/preferences'
import { useToast } from '../contexts/ToastContext'
import Sidebar from '../components/Sidebar'
import StoreSelector from '../components/StoreSelector'
import StatCard from '../components/StatCard'
import Chart from '../components/Chart'
import { convertAmount, getDisplaySymbol, getDisplayOptions } from '../utils/currency'
import {
  type DataItemType,
  DATA_ITEM_IMPORTANCE_ORDER,
  parseSavedDataItems,
} from '../utils/dashboardDataItems'
import { getComparisonPeriodLabel } from '../utils/comparisonPeriod'
import {
  DollarSign,
  Clock,
  Users,
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Store,
  Filter,
  Calendar,
  BarChart3,
  GitCompare,
  AlertCircle,
  Video,
  CheckCircle,
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  Eye,
  MousePointer,
  Percent,
  ThumbsUp,
} from 'lucide-react'

// 时间周期类型（与店铺管理一致：含选择月份、选择年份）
type TimePeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'monthPick' | 'yearPick' | 'custom'

const getCurrentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const getCurrentYear = () => String(new Date().getFullYear())
const MONTH_PICKER_MIN = '2020-01'

export default function AnalysisPage() {
  const { t } = useTranslation()
  const { selectedStore } = useStore()
  const toast = useToast()
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  
  // 数据筛选状态：默认全选且按重要性排序，与仪表盘共用用户偏好持久化
  const [selectedDataItems, setSelectedDataItems] = useState<DataItemType[]>(() => DATA_ITEM_IMPORTANCE_ORDER)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('week')
  const [showFilters, setShowFilters] = useState(false)
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonth())
  const [selectedYear, setSelectedYear] = useState(() => getCurrentYear())
  const [displayCurrency, setDisplayCurrency] = useState<string>('store')

  const statsOptions =
    timePeriod === 'custom' && customDateFrom && customDateTo
      ? { dateFrom: customDateFrom, dateTo: customDateTo }
      : timePeriod === 'monthPick'
        ? { month: selectedMonth }
        : timePeriod === 'yearPick'
          ? { year: selectedYear }
          : undefined

  const { data: stats, isLoading, isError: statsError } = useLiveStats(selectedStore?.id, timePeriod, statsOptions)
  const { data: currentUser } = useCurrentUser()
  const { data: preferencesData } = usePreferences()
  const updatePreferencesMutation = useUpdatePreferences()

  // 从用户偏好恢复数据项目勾选与顺序（与仪表盘共用 dashboardDataItems）
  useEffect(() => {
    const saved = preferencesData?.preferences?.dashboardDataItems
    const parsed = parseSavedDataItems(saved)
    if (parsed) setSelectedDataItems(parsed)
  }, [preferencesData?.preferences?.dashboardDataItems])

  const persistDataItems = (next: DataItemType[]) => {
    const prefs = preferencesData?.preferences ?? {}
    updatePreferencesMutation.mutate({ ...prefs, dashboardDataItems: next })
  }

  const hasRestoredTimeFilterRef = useRef(false)
  // 从用户偏好恢复时间周期筛选（仅首次加载时恢复，与仪表盘共用 dashboardTimeFilter）
  useEffect(() => {
    if (hasRestoredTimeFilterRef.current) return
    const saved = preferencesData?.preferences?.dashboardTimeFilter as undefined | {
      timePeriod?: TimePeriod
      selectedMonth?: string
      selectedYear?: string
      customDateFrom?: string
      customDateTo?: string
    }
    if (!saved?.timePeriod) return
    const validPeriods: TimePeriod[] = ['today', 'week', 'month', 'quarter', 'year', 'monthPick', 'yearPick', 'custom']
    if (!validPeriods.includes(saved.timePeriod)) return
    hasRestoredTimeFilterRef.current = true
    setTimePeriod(saved.timePeriod)
    if (saved.selectedMonth != null) setSelectedMonth(saved.selectedMonth)
    if (saved.selectedYear != null) setSelectedYear(saved.selectedYear)
    if (saved.customDateFrom != null) setCustomDateFrom(saved.customDateFrom)
    if (saved.customDateTo != null) setCustomDateTo(saved.customDateTo)
  }, [preferencesData?.preferences?.dashboardTimeFilter])

  const persistTimeFilter = (next: {
    timePeriod: TimePeriod
    selectedMonth: string
    selectedYear: string
    customDateFrom: string
    customDateTo: string
  }) => {
    const prefs = preferencesData?.preferences ?? {}
    updatePreferencesMutation.mutate({ ...prefs, dashboardTimeFilter: next })
  }

  // 选择「自定义」时若起止日期未填，自动设为最近 7 天（与店铺管理一致）
  useEffect(() => {
    if (timePeriod !== 'custom') return
    if (customDateFrom && customDateTo) return
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    setCustomDateFrom(start.toISOString().slice(0, 10))
    setCustomDateTo(end.toISOString().slice(0, 10))
  }, [timePeriod, customDateFrom, customDateTo])
  
  // 根据用户角色显示不同功能（仅区分运营与管理员）
  const userRole = currentUser?.role || 'user'
  const isOperator = userRole === 'operator' // 运营
  const isManager = userRole === 'admin' || userRole === 'manager' // 管理员

  const storeCurrencyCode = selectedStore?.currency || 'CNY'
  const effectiveDisplayCode = displayCurrency === 'store' ? storeCurrencyCode : displayCurrency
  const displaySymbol = getDisplaySymbol(effectiveDisplayCode)
  const convertValue = (value: number) =>
    displayCurrency === 'store' ? value : convertAmount(value, storeCurrencyCode, displayCurrency)

  const formatCurrency = (value: number) => {
    return `${displaySymbol}${value.toLocaleString('zh-CN')}`
  }

  const formatDuration = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}${t('dashboard.minutes')}`
    return `${hours.toFixed(1)}${t('dashboard.hours')}`
  }

  const formatNumber = (value: number) => {
    return value.toLocaleString('zh-CN')
  }

  const formatPercentage = (value: number) => {
    // 确保值在合理范围内，避免 NaN 或 Infinity
    const safeValue = isNaN(value) || !isFinite(value) ? 0 : Math.max(-1000, Math.min(1000, value))
    return `${safeValue.toFixed(2)}%`
  }

  // 环比百分比（与店铺管理一致，限制在 ±1000 内）
  const pct = (curr: number, prev: number) => {
    if (prev == null || prev === 0) return undefined
    const value = ((curr - prev) / prev) * 100
    const safeValue = isNaN(value) || !isFinite(value) ? 0 : Math.max(-1000, Math.min(1000, value))
    return `${safeValue.toFixed(2)}%`
  }

  // 根据选中的数据项目过滤统计卡片（与店铺管理一致的 statsMap，含时效/人均/GPM）
  const filteredStats = useMemo(() => {
    if (!stats) return []
    const rounds = Math.max(0, Math.min(1000000, stats.rounds || 0))
    const ordersCount = Math.max(0, Math.min(10000000, stats.completedOrders || stats.totalOrders || 0))
    const statsMap: Record<DataItemType, any> = {
      gmv: {
        title: t('stats.gmv'),
        value: formatCurrency(Math.max(0, convertValue(stats.totalGMV || 0))),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: stats.previousPeriod.totalGMV > 0 ? pct(stats.totalGMV || 0, stats.previousPeriod.totalGMV) : undefined,
        icon: DollarSign,
      },
      duration: {
        title: t('stats.duration'),
        value: formatDuration(Math.max(0, stats.totalDuration || 0)),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: stats.previousPeriod.totalDuration > 0 ? pct(stats.totalDuration || 0, stats.previousPeriod.totalDuration) : undefined,
        icon: Clock,
      },
      viewers: {
        title: t('stats.viewers'),
        value: formatNumber(Math.max(0, stats.totalViewers || 0)),
        change: (stats.previousPeriod.totalViewers ?? 0) > 0 ? pct(stats.totalViewers || 0, stats.previousPeriod.totalViewers ?? 0) : undefined,
        icon: Users,
      },
      interactions: {
        title: t('stats.interactions'),
        value: formatNumber(Math.max(0, stats.totalInteractions || 0)),
        subtitle: t('dashboard.commentsLikesShares'),
        change: (stats.previousPeriod.totalInteractions ?? 0) > 0
          ? pct(stats.totalInteractions || 0, stats.previousPeriod.totalInteractions ?? 0)
          : undefined,
        icon: MessageSquare,
      },
      orders: {
        title: t('stats.orders'),
        value: formatNumber(Math.max(0, stats.totalOrders || 0)),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: stats.previousPeriod.totalOrders && stats.previousPeriod.totalOrders > 0
          ? pct(stats.totalOrders || 0, stats.previousPeriod.totalOrders)
          : undefined,
        icon: ShoppingCart,
      },
      completedOrders: {
        title: t('stats.completedOrders'),
        value: formatNumber(Math.max(0, stats.completedOrders ?? stats.totalOrders ?? 0)),
        subtitle: t('dashboard.ordersCount', { count: ordersCount }),
        change: (stats.previousPeriod?.completedOrders ?? stats.previousPeriod?.totalOrders) != null && (stats.previousPeriod?.completedOrders ?? stats.previousPeriod?.totalOrders ?? 0) > 0
          ? pct(stats.completedOrders ?? stats.totalOrders ?? 0, stats.previousPeriod?.completedOrders ?? stats.previousPeriod?.totalOrders ?? 0)
          : undefined,
        icon: CheckCircle,
      },
      conversion: {
        title: t('stats.conversion'),
        value: formatPercentage(Math.max(0, Math.min(100, stats.averageConversionRate || 0))),
        subtitle: t('dashboard.ordersCount', { count: ordersCount }),
        change: stats.previousPeriod.averageConversionRate > 0
          ? pct(stats.averageConversionRate || 0, stats.previousPeriod.averageConversionRate)
          : undefined,
        icon: TrendingUp,
      },
      rounds: {
        title: t('stats.rounds'),
        value: formatNumber(rounds),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: (stats.previousPeriod.rounds ?? 0) > 0 ? pct(rounds, stats.previousPeriod.rounds ?? 0) : undefined,
        icon: Video,
      },
      avgWatchDuration: {
        title: t('stats.avgWatchDuration'),
        titleTooltip: t('stats.avgWatchDurationTooltip'),
        value: (() => {
          const min = Math.max(0, stats.avgWatchDurationMinutes ?? 0)
          if (min < 1) return `${Math.round(min * 60)}${t('dashboard.seconds')}`
          if (min < 60) return `${Math.round(min)}${t('dashboard.minutes')}`
          return `${(min / 60).toFixed(1)}${t('dashboard.hours')}`
        })(),
        subtitle: t('dashboard.douyinCompassMetric'),
        change: stats.previousPeriod.avgWatchDurationMinutes != null && stats.previousPeriod.avgWatchDurationMinutes > 0
          ? pct(stats.avgWatchDurationMinutes ?? 0, stats.previousPeriod.avgWatchDurationMinutes)
          : undefined,
        icon: Clock,
      },
      gpm: {
        title: t('stats.gpm'),
        titleTooltip: t('stats.gpmTooltip'),
        value: formatCurrency(Math.max(0, convertValue(stats.gpm ?? 0))),
        subtitle: t('dashboard.gpmDesc'),
        change: stats.previousPeriod.gpm != null && stats.previousPeriod.gpm > 0
          ? pct(stats.gpm ?? 0, stats.previousPeriod.gpm)
          : undefined,
        icon: DollarSign,
      },
      timeliness: {
        title: t('stats.timeliness'),
        titleTooltip: t('stats.timelinessTooltip'),
        value: `${formatCurrency(Math.max(0, convertValue(stats.gmvPerHour ?? 0)))}${t('dashboard.perHour')}`,
        subtitle: t('dashboard.gmvDivDuration'),
        change: stats.previousPeriod.gmvPerHour > 0
          ? pct(stats.gmvPerHour ?? 0, stats.previousPeriod.gmvPerHour)
          : undefined,
        icon: Clock,
      },
      likes: {
        title: t('stats.likes'),
        value: formatNumber(Math.max(0, stats.likes ?? 0)),
        change: (stats.previousPeriod.likes ?? 0) > 0 ? pct(stats.likes ?? 0, stats.previousPeriod.likes ?? 0) : undefined,
        icon: Heart,
      },
      comments: {
        title: t('stats.comments'),
        value: formatNumber(Math.max(0, stats.comments ?? 0)),
        change: (stats.previousPeriod.comments ?? 0) > 0 ? pct(stats.comments ?? 0, stats.previousPeriod.comments ?? 0) : undefined,
        icon: MessageCircle,
      },
      shares: {
        title: t('stats.shares'),
        value: formatNumber(Math.max(0, stats.shares ?? 0)),
        change: (stats.previousPeriod.shares ?? 0) > 0 ? pct(stats.shares ?? 0, stats.previousPeriod.shares ?? 0) : undefined,
        icon: Share2,
      },
      follows: {
        title: t('stats.follows'),
        value: formatNumber(Math.max(0, stats.follows ?? 0)),
        change: (stats.previousPeriod.follows ?? 0) > 0 ? pct(stats.follows ?? 0, stats.previousPeriod.follows ?? 0) : undefined,
        icon: UserPlus,
      },
      productViews: {
        title: t('stats.productViews'),
        value: formatNumber(Math.max(0, stats.productViews ?? 0)),
        change: (stats.previousPeriod.productViews ?? 0) > 0 ? pct(stats.productViews ?? 0, stats.previousPeriod.productViews ?? 0) : undefined,
        icon: Eye,
      },
      productClicks: {
        title: t('stats.productClicks'),
        value: formatNumber(Math.max(0, stats.productClicks ?? 0)),
        change: (stats.previousPeriod.productClicks ?? 0) > 0 ? pct(stats.productClicks ?? 0, stats.previousPeriod.productClicks ?? 0) : undefined,
        icon: MousePointer,
      },
      clickThroughRate: {
        title: t('stats.clickThroughRate'),
        value: formatPercentage(Math.max(0, Math.min(100, stats.clickThroughRate ?? 0))),
        change: (stats.previousPeriod.clickThroughRate ?? 0) > 0 ? pct(stats.clickThroughRate ?? 0, stats.previousPeriod.clickThroughRate ?? 0) : undefined,
        icon: Percent,
      },
      interactionRate: {
        title: t('stats.interactionRate'),
        value: formatPercentage(Math.max(0, Math.min(100, stats.interactionRate ?? 0))),
        change: (stats.previousPeriod.interactionRate ?? 0) > 0 ? pct(stats.interactionRate ?? 0, stats.previousPeriod.interactionRate ?? 0) : undefined,
        icon: ThumbsUp,
      },
    }
    return selectedDataItems.map(item => statsMap[item]).filter(Boolean)
  }, [stats, selectedDataItems, displayCurrency, storeCurrencyCode, displaySymbol, t])

  // 生成图表数据
  const chartData = useMemo(() => {
    if (!stats) return []
    return [
      { date: t('timePeriod.mon'), value: stats.totalGMV * 0.15 },
      { date: t('timePeriod.tue'), value: stats.totalGMV * 0.18 },
      { date: t('timePeriod.wed'), value: stats.totalGMV * 0.22 },
      { date: t('timePeriod.thu'), value: stats.totalGMV * 0.20 },
      { date: t('timePeriod.fri'), value: stats.totalGMV * 0.25 },
    ]
  }, [stats, t])

  const dataItemLabels: Record<DataItemType, { label: string; title?: string }> = useMemo(() => ({
    gmv: { label: t('stats.gmvShort'), title: undefined },
    duration: { label: t('stats.durationShort'), title: undefined },
    viewers: { label: t('stats.viewersShort'), title: undefined },
    interactions: { label: t('stats.interactionsShort'), title: undefined },
    orders: { label: t('stats.ordersShort'), title: undefined },
    completedOrders: { label: t('stats.completedOrdersShort'), title: undefined },
    conversion: { label: t('stats.conversionShort'), title: undefined },
    rounds: { label: t('stats.roundsShort'), title: undefined },
    timeliness: { label: t('stats.timeliness'), title: t('stats.timelinessTooltip') },
    avgWatchDuration: { label: t('stats.avgWatchDuration'), title: t('stats.avgWatchDurationTooltip') },
    gpm: { label: t('stats.gpm'), title: t('stats.gpmTooltip') },
    likes: { label: t('stats.likesShort'), title: undefined },
    comments: { label: t('stats.commentsShort'), title: undefined },
    shares: { label: t('stats.sharesShort'), title: undefined },
    follows: { label: t('stats.followsShort'), title: undefined },
    productViews: { label: t('stats.productViewsShort'), title: undefined },
    productClicks: { label: t('stats.productClicksShort'), title: undefined },
    clickThroughRate: { label: t('stats.clickThroughRateShort'), title: undefined },
    interactionRate: { label: t('stats.interactionRateShort'), title: undefined },
  }), [t])
  const dataItemOptions = useMemo(
    () => DATA_ITEM_IMPORTANCE_ORDER.map((value) => ({ value, ...dataItemLabels[value] })),
    [dataItemLabels]
  )

  const timePeriodOptions = useMemo(() => [
    { value: 'today' as TimePeriod, label: t('timePeriod.today') },
    { value: 'week' as TimePeriod, label: t('timePeriod.week') },
    { value: 'month' as TimePeriod, label: t('timePeriod.month') },
    { value: 'quarter' as TimePeriod, label: t('timePeriod.quarter') },
    { value: 'year' as TimePeriod, label: t('timePeriod.year') },
    { value: 'monthPick' as TimePeriod, label: t('timePeriod.monthPick') },
    { value: 'yearPick' as TimePeriod, label: t('timePeriod.yearPick') },
    { value: 'custom' as TimePeriod, label: t('timePeriod.custom') },
  ], [t])

  const dataPeriodLabel =
    timePeriod === 'monthPick'
      ? selectedMonth
        ? `${selectedMonth.slice(0, 4)}-${selectedMonth.slice(5, 7)}`
        : t('timePeriod.monthPick')
      : timePeriod === 'yearPick'
        ? selectedYear
          ? selectedYear
          : t('timePeriod.yearPick')
        : timePeriod === 'custom' && customDateFrom && customDateTo
          ? `${customDateFrom} ~ ${customDateTo}`
          : timePeriodOptions.find((o) => o.value === timePeriod)?.label ?? t('timePeriod.week')

  const comparisonPeriodLabel = getComparisonPeriodLabel(timePeriod, {
    customDateFrom,
    customDateTo,
    selectedMonth,
    selectedYear,
  })

  const handleDataItemToggle = (item: DataItemType) => {
    setSelectedDataItems(prev => {
      let next: DataItemType[]
      if (prev.includes(item)) {
        if (prev.length <= 1) {
          toast.warning(t('dashboard.atLeastOneMetric'))
          return prev
        }
        next = prev.filter(i => i !== item)
      } else {
        next = [...prev, item]
      }
      persistDataItems(next)
      return next
    })
  }

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
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('analysis.title')}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('analysis.subtitle')}</p>
            </div>
            <div className="flex items-center gap-4">
              <StoreSelector />
            </div>
          </div>
        </header>

        {/* 主要内容 */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedStore ? (
            <div className="card text-center py-12">
              <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('dashboard.selectStore')}</h2>
              <p className="text-gray-500">{t('analysis.selectStoreHintAnalysis')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 数据筛选工具栏（与店铺管理一致） */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Filter className="w-5 h-5" />
                    {t('analysis.dataFilter')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {showFilters ? t('analysis.collapseFilter') : t('analysis.expandFilter')}
                  </button>
                </div>

                {showFilters && (
                  <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        {t('dashboard.dataItemsLabel')}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {dataItemOptions.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            title={option.title}
                            onClick={() => handleDataItemToggle(option.value)}
                            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                              selectedDataItems.includes(option.value)
                                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {t('dashboard.timePeriodSection')}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {timePeriodOptions.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              const nextPeriod = option.value
                              let nextFrom = customDateFrom
                              let nextTo = customDateTo
                              if (nextPeriod === 'custom') {
                                const end = new Date()
                                const start = new Date()
                                start.setDate(start.getDate() - 6)
                                nextFrom = start.toISOString().slice(0, 10)
                                nextTo = end.toISOString().slice(0, 10)
                                setCustomDateFrom(nextFrom)
                                setCustomDateTo(nextTo)
                              }
                              setTimePeriod(nextPeriod)
                              persistTimeFilter({
                                timePeriod: nextPeriod,
                                selectedMonth,
                                selectedYear,
                                customDateFrom: nextFrom,
                                customDateTo: nextTo,
                              })
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                              timePeriod === option.value
                                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {timePeriod === 'monthPick' && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <label className="text-xs text-gray-600">月份</label>
                          <input
                            type="month"
                            min={MONTH_PICKER_MIN}
                            max={getCurrentMonth()}
                            value={selectedMonth}
                            onChange={(e) => {
                              const v = e.target.value
                              setSelectedMonth(v)
                              persistTimeFilter({ timePeriod, selectedMonth: v, selectedYear, customDateFrom, customDateTo })
                            }}
                            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
                            title="可选 2020年1月 至 当前月"
                          />
                        </div>
                      )}
                      {timePeriod === 'yearPick' && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <label className="text-xs text-gray-600">年份</label>
                          <select
                            value={selectedYear}
                            onChange={(e) => {
                              const v = e.target.value
                              setSelectedYear(v)
                              persistTimeFilter({ timePeriod, selectedMonth, selectedYear: v, customDateFrom, customDateTo })
                            }}
                            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
                            title="可选 2020 年至 当前年+1"
                          >
                            {Array.from(
                              { length: 12 },
                              (_, i) => new Date().getFullYear() - 10 + i
                            )
                              .reverse()
                              .map((y) => (
                                <option key={y} value={String(y)}>
                                  {y}年
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {timePeriod === 'custom' && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <label className="text-xs text-gray-600">从</label>
                          <input
                            type="date"
                            value={customDateFrom}
                            onChange={(e) => {
                              const v = e.target.value
                              setCustomDateFrom(v)
                              persistTimeFilter({ timePeriod, selectedMonth, selectedYear, customDateFrom: v, customDateTo })
                            }}
                            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
                          />
                          <label className="text-xs text-gray-600">至</label>
                          <input
                            type="date"
                            value={customDateTo}
                            onChange={(e) => {
                              const v = e.target.value
                              setCustomDateTo(v)
                              persistTimeFilter({ timePeriod, selectedMonth, selectedYear, customDateFrom, customDateTo: v })
                            }}
                            className="rounded border border-gray-300 px-1.5 py-1 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 数据统计卡片 */}
              {isLoading ? (
                <div className="card text-center py-12 text-gray-500">{t('common.loading')}</div>
              ) : statsError ? (
                <div className="card text-center py-12 text-amber-600 bg-amber-50 rounded-xl border border-amber-200">
                  统计数据加载失败，请检查网络或稍后重试
                </div>
              ) : stats ? (
                <>
                  <div className="card">
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          {t('analysis.coreMetrics')}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
                            title={t('dashboard.periodTotal')}
                          >
                            {t('dashboard.dataPeriodLabel')}: {dataPeriodLabel}
                          </span>
                          <span
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
                            title={t('dashboard.comparisonPeriodHint', { fallback: '环比为当前周期与上一等长周期对比' })}
                          >
                            {t('dashboard.comparisonPeriodLabel', { fallback: '环比' })}：{t('dashboard.vsPreviousPeriod', { fallback: '较' })}{comparisonPeriodLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="text-gray-600 font-medium">{t('dashboard.displayAs')}: </label>
                        <select
                          value={displayCurrency}
                          onChange={(e) => setDisplayCurrency(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 bg-white text-gray-700 text-xs font-medium shadow-sm hover:border-gray-400 transition-colors"
                          aria-label="货币转换"
                        >
                          {getDisplayOptions(storeCurrencyCode).map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.value === 'store' ? `${t('dashboard.currencyStore')} (${displaySymbol} ${storeCurrencyCode})` : opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {filteredStats.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        {t('dashboard.selectAtLeastOneInFilter')}
                      </div>
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStats.map((stat, index) => (
                        <StatCard
                          key={index}
                          title={stat.title}
                          value={stat.value}
                          subtitle={stat.subtitle}
                          change={stat.change}
                          icon={stat.icon}
                        />
                      ))}
                    </div>
                    )}
                  </div>

                  {/* 数据可视化图表 */}
                  {chartData.length > 0 && (
                    <div className="card">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        {t('analysis.salesTrend')}
                      </h3>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <Chart data={chartData} type="line" color="#0ea5e9" />
                      </div>
                    </div>
                  )}

                  {/* 店铺对比功能（仅管理/运营可见） */}
                  {(isManager || isOperator) && (
                    <div className="card">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                          <GitCompare className="w-5 h-5" />
                          {t('analysis.storeCompare')}
                        </h2>
                        <button className="text-sm text-blue-600 hover:text-blue-700">
                          {t('analysis.selectStoresToCompare')}
                        </button>
                      </div>
                      <p className="text-gray-500 text-sm">
                        {t('analysis.storeCompareDesc')}
                      </p>
                    </div>
                  )}

                  {/* 诊断建议（量化、有逻辑） */}
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        {t('analysis.diagnosticSuggestions')}
                      </h2>
                    </div>
                    <div className="space-y-3">
                      {stats.averageConversionRate < 2 && (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="font-medium text-yellow-900 mb-1">
                            {t('analysis.lowConversionTitle')}
                          </p>
                          <p className="text-sm text-yellow-800">
                            {t('analysis.lowConversionContent', {
                              rate: formatPercentage(Math.max(0, Math.min(100, stats.averageConversionRate || 0))),
                              orders: Math.max(0, Math.min(1000000, Math.round((stats.totalViewers || 0) * 0.01))),
                            })}
                          </p>
                        </div>
                      )}
                      {stats.totalDuration < 20 && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="font-medium text-blue-900 mb-1">
                            {t('analysis.lowDurationTitle')}
                          </p>
                          <p className="text-sm text-blue-800">
                            {t('analysis.lowDurationContent', {
                              duration: formatDuration(Math.max(0, stats.totalDuration || 0)),
                              gmv: formatCurrency(Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, convertValue((stats.totalGMV || 0) / Math.max(1, stats.totalDuration || 1) * 0.8)))),
                            })}
                          </p>
                        </div>
                      )}
                      {(stats.totalViewers || 0) > 0 && (stats.totalInteractions / (stats.totalViewers || 1)) < 0.1 && (
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                          <p className="font-medium text-purple-900 mb-1">
                            {t('analysis.lowInteractionTitle')}
                          </p>
                          <p className="text-sm text-purple-800">
                            {t('analysis.lowInteractionContent', {
                              rate: formatPercentage(Math.max(0, Math.min(100, (stats.totalInteractions || 0) / Math.max(1, stats.totalViewers || 1)) * 100)),
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 后续可在此嵌入其他分析功能 */}
                </>
              ) : (
                <div className="card text-center py-12 text-gray-500">
                  暂无数据
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
