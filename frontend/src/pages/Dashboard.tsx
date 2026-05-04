import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useLiveStats, type LiveStats } from '../services/stats'
import { useCurrentUser } from '../services/auth'
import { useStore } from '../contexts/StoreContext'
import StatCard, { type StatCardProps } from '../components/StatCard'
import StoreWorkbench from '../components/StoreWorkbench'
import TaskList from '../components/TaskList'
import AppLayout from '../components/AppLayout'
import StoreSelector from '../components/StoreSelector'
import LayoutSettings from '../components/LayoutSettings'
import CreateStoreModal from '../components/CreateStoreModal'
import DataImportModal from '../components/DataImportModal'
import CustomSelect from '../components/CustomSelect'
import { downloadDataExport } from '../services/dataImport'
import { useLayoutPreferences } from '../hooks/useLayoutPreferences'
import { usePreferences, useUpdatePreferences } from '../services/preferences'
import { useToast } from '../contexts/ToastContext'
import { useLanguage } from '../contexts/LanguageContext'
import DateRangePickerPopover from '../components/DateRangePickerPopover'
import MonthPickerPopover from '../components/MonthPickerPopover'
import { formatLocalYMD } from '../utils/calendarLocal'
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
  Plus,
  FileUp,
  FileDown,
  ChevronDown,
  GripVertical,
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
import { convertAmount, getDisplaySymbol, getDisplayOptions } from '../utils/currency'

import {
  type DataItemType,
  DATA_ITEM_IMPORTANCE_ORDER,
  parseSavedDataItems,
} from '../utils/dashboardDataItems'
import { getComparisonPeriodLabel } from '../utils/comparisonPeriod'

// 时间周期类型（含可选具体月份/年份）
type TimePeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'monthPick' | 'yearPick' | 'custom'

// 当前年月，用于默认选择
const getCurrentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const getCurrentYear = () => String(new Date().getFullYear())
// 选择月份的可选范围：最早 2020-01，最晚到当前月（便于选 2025 等历史月份）
const MONTH_PICKER_MIN = '2020-01'

export default function Dashboard() {
  const { t } = useTranslation()
  const { locale } = useLanguage()
  const queryClient = useQueryClient()
  const { selectedStore, setSelectedStore } = useStore()
  const toast = useToast()
  const [selectedDataItems, setSelectedDataItems] = useState<DataItemType[]>(() => DATA_ITEM_IMPORTANCE_ORDER)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('week')
  const [showFilters, setShowFilters] = useState(false)
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonth())
  const [selectedYear, setSelectedYear] = useState(() => getCurrentYear())
  /** 显示货币：'store'=店铺货币，'CNY'/'USD'/'THB' 等=人民币对多国 */
  const [displayCurrency, setDisplayCurrency] = useState<string>('store')
  /** 左侧 Sidebar 展开/收起状态（默认展开） */

  /** 当前拖拽中的数据项索引（用于拖拽态样式，卡片与筛选区标签共用） */
  const [draggingDataItemIndex, setDraggingDataItemIndex] = useState<number | null>(null)

  const statsOptions =
    timePeriod === 'custom' && customDateFrom && customDateTo
      ? { dateFrom: customDateFrom, dateTo: customDateTo }
      : timePeriod === 'monthPick'
        ? { month: selectedMonth }
        : timePeriod === 'yearPick'
          ? { year: selectedYear }
          : undefined

  const maxCustomDate = formatLocalYMD(new Date())
  const minCustomDate = '2020-01-01'

  const { data: stats, isLoading, isError: statsError } = useLiveStats(
    selectedStore?.id,
    timePeriod,
    statsOptions
  )
  useCurrentUser()
  const [showCreateStoreModal, setShowCreateStoreModal] = useState(false)
  const [editStore, setEditStore] = useState<import('../services/stores').Store | null>(null)
  const [showDataImportModal, setShowDataImportModal] = useState(false)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  /** 打开导入弹窗时锁定的目标店铺，保证数据写入当前选中的店铺（避免切店导致错写） */
  const [importTargetStore, setImportTargetStore] = useState<{ id: string; name?: string; platform?: string } | null>(null)

  // 选择「自定义」时若起止日期未填，自动设为最近 7 天，保证会发起请求
  useEffect(() => {
    if (timePeriod !== 'custom') return
    if (customDateFrom && customDateTo) return
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    setCustomDateFrom(start.toISOString().slice(0, 10))
    setCustomDateTo(end.toISOString().slice(0, 10))
  }, [timePeriod, customDateFrom, customDateTo])

  // 统一打开创建/编辑店铺模态框
  useEffect(() => {
    const onCreate = () => {
      setEditStore(null)
      setShowCreateStoreModal(true)
    }
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent<import('../services/stores').Store>).detail
      if (detail) {
        setEditStore(detail)
        setShowCreateStoreModal(true)
      }
    }
    window.addEventListener('openCreateStoreModal', onCreate)
    window.addEventListener('openEditStoreModal', onEdit)
    return () => {
      window.removeEventListener('openCreateStoreModal', onCreate)
      window.removeEventListener('openEditStoreModal', onEdit)
    }
  }, [])
  
  // 布局偏好
  const { preferences } = useLayoutPreferences()
  const { data: preferencesData } = usePreferences()
  const updatePreferencesMutation = useUpdatePreferences()

  // 从用户偏好恢复数据项目勾选与顺序（仅首次有效）
  useEffect(() => {
    const saved = preferencesData?.preferences?.dashboardDataItems
    const parsed = parseSavedDataItems(saved)
    if (parsed) setSelectedDataItems(parsed)
  }, [preferencesData?.preferences?.dashboardDataItems])

  const hasRestoredTimeFilterRef = useRef(false)
  // 从用户偏好恢复时间周期筛选（仅首次加载时恢复，避免 refetch 后覆盖用户当前选择）
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

  // 持久化数据项目配置到用户偏好
  const persistDataItems = (next: DataItemType[]) => {
    const prefs = preferencesData?.preferences ?? {}
    updatePreferencesMutation.mutate({ ...prefs, dashboardDataItems: next })
  }

  // 持久化时间周期筛选到用户偏好（传入完整当前状态，与仪表盘/数据分析页共用）
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

  const storeCurrencyCode = selectedStore?.currency || 'CNY'
  const effectiveDisplayCode = displayCurrency === 'store' ? storeCurrencyCode : displayCurrency
  const displaySymbol = getDisplaySymbol(effectiveDisplayCode)

  // 环比/同比百分比计算（限制在 ±1000 内）
  const pct = (curr: number, base: number) =>
    base > 0 ? Math.max(-1000, Math.min(1000, ((curr - base) / base) * 100)) : undefined
  const yoy = stats?.yearOverYearPeriod

  // 根据选中的数据项目过滤统计卡片
  const filteredStats = useMemo(() => {
    if (!stats) return []
    const s = stats as LiveStats
    const toDisplay = (v: number) =>
      displayCurrency === 'store' ? v : convertAmount(v, storeCurrencyCode, displayCurrency)
    const formatCurrency = (value: number) =>
      `${displaySymbol}${Math.max(0, toDisplay(value)).toLocaleString('zh-CN')}`
    const formatDuration = (hours: number) => {
      if (hours < 1) return `${Math.round(hours * 60)}${t('dashboard.minutes')}`
      return `${hours.toFixed(1)}${t('dashboard.hours')}`
    }
    const formatNumber = (value: number) => value.toLocaleString('zh-CN')
    const formatPercentage = (value: number) => {
      const safeValue = isNaN(value) || !isFinite(value) ? 0 : Math.max(-1000, Math.min(1000, value))
      return `${safeValue.toFixed(2)}%`
    }
    const rounds = Math.max(0, Math.min(1000000, s.rounds || 0))
    const ordersCount = Math.max(0, Math.min(10000000, s.completedOrders || s.totalOrders || 0))

    const statsMap: Record<DataItemType, StatCardProps> = {
      gmv: {
        title: t('stats.gmv'),
        value: formatCurrency(Math.max(0, s.totalGMV || 0)),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: pct(s.totalGMV || 0, s.previousPeriod.totalGMV),
        changeYoY: yoy && pct(s.totalGMV || 0, yoy.totalGMV),
        icon: DollarSign,
      },
      duration: {
        title: t('stats.duration'),
        value: formatDuration(Math.max(0, s.totalDuration || 0)),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: pct(s.totalDuration || 0, s.previousPeriod.totalDuration),
        changeYoY: yoy && pct(s.totalDuration || 0, yoy.totalDuration),
        icon: Clock,
      },
      viewers: {
        title: t('stats.viewers'),
        value: formatNumber(Math.max(0, s.totalViewers || 0)),
        change: (s.previousPeriod.totalViewers ?? 0) > 0 ? pct(s.totalViewers || 0, s.previousPeriod.totalViewers ?? 0) : undefined,
        changeYoY: yoy && (yoy.totalViewers ?? 0) > 0 ? pct(s.totalViewers || 0, yoy.totalViewers ?? 0) : undefined,
        icon: Users,
      },
      interactions: {
        title: t('stats.interactions'),
        value: formatNumber(Math.max(0, s.totalInteractions || 0)),
        subtitle: t('dashboard.commentsLikesShares'),
        change: (s.previousPeriod.totalInteractions ?? 0) > 0
          ? pct(s.totalInteractions || 0, s.previousPeriod.totalInteractions ?? 0)
          : undefined,
        changeYoY: yoy && (yoy.totalInteractions ?? 0) > 0 ? pct(s.totalInteractions || 0, yoy.totalInteractions ?? 0) : undefined,
        icon: MessageSquare,
      },
      orders: {
        title: t('stats.orders'),
        value: formatNumber(Math.max(0, stats.totalOrders || 0)),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: stats.previousPeriod.totalOrders && stats.previousPeriod.totalOrders > 0
          ? pct(stats.totalOrders || 0, stats.previousPeriod.totalOrders)
          : undefined,
        changeYoY: yoy && (yoy.totalOrders ?? 0) > 0 ? pct(stats.totalOrders || 0, yoy.totalOrders ?? 0) : undefined,
        icon: ShoppingCart,
      },
      completedOrders: {
        title: t('stats.completedOrders'),
        value: formatNumber(Math.max(0, stats.completedOrders ?? stats.totalOrders ?? 0)),
        subtitle: t('dashboard.ordersCount', { count: ordersCount }),
        change: (stats.previousPeriod?.completedOrders ?? stats.previousPeriod?.totalOrders) != null && (stats.previousPeriod?.completedOrders ?? stats.previousPeriod?.totalOrders ?? 0) > 0
          ? pct(stats.completedOrders ?? stats.totalOrders ?? 0, stats.previousPeriod?.completedOrders ?? stats.previousPeriod?.totalOrders ?? 0)
          : undefined,
        changeYoY: yoy && ((yoy?.completedOrders ?? yoy?.totalOrders) ?? 0) > 0
          ? pct(stats.completedOrders ?? stats.totalOrders ?? 0, yoy?.completedOrders ?? yoy?.totalOrders ?? 0)
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
        changeYoY: yoy && yoy.averageConversionRate > 0
          ? pct(stats.averageConversionRate || 0, yoy.averageConversionRate)
          : undefined,
        icon: TrendingUp,
      },
      rounds: {
        title: t('stats.rounds'),
        value: formatNumber(rounds),
        subtitle: t('dashboard.sessionsCount', { count: rounds }),
        change: (stats.previousPeriod.rounds ?? 0) > 0 ? pct(rounds, stats.previousPeriod.rounds ?? 0) : undefined,
        changeYoY: yoy && (yoy.rounds ?? 0) > 0 ? pct(rounds, yoy.rounds ?? 0) : undefined,
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
        changeYoY: yoy && (yoy.avgWatchDurationMinutes ?? 0) > 0
          ? pct(stats.avgWatchDurationMinutes ?? 0, yoy.avgWatchDurationMinutes ?? 0)
          : undefined,
        icon: Clock,
      },
      gpm: {
        title: t('stats.gpm'),
        titleTooltip: t('stats.gpmTooltip'),
        value: formatCurrency(Math.max(0, stats.gpm ?? 0)),
        subtitle: t('dashboard.gpmDesc'),
        change: stats.previousPeriod.gpm != null && stats.previousPeriod.gpm > 0
          ? pct(stats.gpm ?? 0, stats.previousPeriod.gpm)
          : undefined,
        changeYoY: yoy && (yoy.gpm ?? 0) > 0 ? pct(stats.gpm ?? 0, yoy.gpm ?? 0) : undefined,
        icon: DollarSign,
      },
      timeliness: {
        title: t('stats.timeliness'),
        titleTooltip: t('stats.timelinessTooltip'),
        value: `${formatCurrency(Math.max(0, stats.gmvPerHour ?? 0))}${t('dashboard.perHour')}`,
        subtitle: t('dashboard.gmvDivDuration'),
        change: stats.previousPeriod.gmvPerHour > 0
          ? pct(stats.gmvPerHour ?? 0, stats.previousPeriod.gmvPerHour)
          : undefined,
        changeYoY: yoy && (yoy.gmvPerHour ?? 0) > 0 ? pct(stats.gmvPerHour ?? 0, yoy.gmvPerHour ?? 0) : undefined,
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
  }, [stats, selectedDataItems, displayCurrency, storeCurrencyCode, displaySymbol, t, yoy])

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
  const dataItemOptions = useMemo(() =>
    DATA_ITEM_IMPORTANCE_ORDER.map(value => ({ value, ...dataItemLabels[value] })),
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

  // 数据周期展示文案（选择月份/年份/自定义时显示具体值）
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

  // 环比/同比对比周期说明（与后端 previousPeriod 对应）
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

  /** 拖拽排序：将 fromIndex 位置的项移到 toIndex（最终排在 toIndex 位） */
  const handleDataItemDragReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setSelectedDataItems(prev => {
      const next = [...prev]
      const [removed] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, removed)
      persistDataItems(next)
      return next
    })
  }

  // 计算统计区域的列数（只考虑商店列表，AI 功能区改为侧边栏不占grid）
  const statsCols = useMemo(() => {
    const storeListCols = preferences.showStoreList ? preferences.storeListCols : 0
    const calculated = 12 - storeListCols
    // 确保值在 1-12 范围内
    return Math.max(1, Math.min(12, calculated))
  }, [preferences.showStoreList, preferences.storeListCols])

  const dashboardHeaderExtra = (
    <>
      <StoreSelector />
      {selectedStore && (selectedStore.platform === 'TikTok' || selectedStore.platform === '抖音') && (
        <button
          type="button"
          onClick={() => {
            setImportTargetStore({ id: selectedStore.id, name: selectedStore.name, platform: selectedStore.platform })
            setShowDataImportModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <FileUp className="w-4 h-4" />
          {t('dashboard.importData')}
        </button>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setExportDropdownOpen((v) => !v)}
          onBlur={() => setTimeout(() => setExportDropdownOpen(false), 180)}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
        >
          <FileDown className="w-4 h-4" />
          {t('dashboard.exportData')}
          <ChevronDown className="w-4 h-4" />
        </button>
        {exportDropdownOpen && (
          <div className="absolute right-0 mt-1 py-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={async () => {
                setExporting(true)
                try {
                  await downloadDataExport('csv')
                  toast.success(t('dashboard.exportStartedCSV'))
                } catch (e: unknown) {
                  const err = e as { response?: { data?: { error?: string } }; message?: string }
                  const msg = err.response?.data?.error || err.message || t('dashboard.exportFailed')
                  toast.error(msg)
                } finally {
                  setExporting(false)
                  setExportDropdownOpen(false)
                }
              }}
            >
              {t('dashboard.exportCSV')}
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={async () => {
                setExporting(true)
                try {
                  await downloadDataExport('xlsx')
                  toast.success(t('dashboard.exportStartedExcel'))
                } catch (e: unknown) {
                  const err = e as { response?: { data?: { error?: string } }; message?: string }
                  const msg = err.response?.data?.error || err.message || t('dashboard.exportFailed')
                  toast.error(msg)
                } finally {
                  setExporting(false)
                  setExportDropdownOpen(false)
                }
              }}
            >
              {t('dashboard.exportExcel')}
            </button>
            {selectedStore && (
              <>
                <div className="border-t border-slate-100 my-1" />
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={async () => {
                    setExporting(true)
                    try {
                      await downloadDataExport('csv', selectedStore.id)
                      toast.success(t('dashboard.exportStartedCSVCurrent'))
                    } catch (e: unknown) {
                      const err = e as { response?: { data?: { error?: string } }; message?: string }
                      const msg = err.response?.data?.error || err.message || t('dashboard.exportFailed')
                      toast.error(msg)
                    } finally {
                      setExporting(false)
                      setExportDropdownOpen(false)
                    }
                  }}
                >
                  {t('dashboard.exportCSVCurrentStore')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={async () => {
                    setExporting(true)
                    try {
                      await downloadDataExport('xlsx', selectedStore.id)
                      toast.success(t('dashboard.exportStartedExcelCurrent'))
                    } catch (e: unknown) {
                      const err = e as { response?: { data?: { error?: string } }; message?: string }
                      const msg = err.response?.data?.error || err.message || t('dashboard.exportFailed')
                      toast.error(msg)
                    } finally {
                      setExporting(false)
                      setExportDropdownOpen(false)
                    }
                  }}
                >
                  {t('dashboard.exportExcelCurrentStore')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('openCreateStoreModal'))}
        className="btn-primary flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        {t('dashboard.createStore')}
      </button>
    </>
  )

  return (
    <AppLayout
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle')}
      headerExtra={dashboardHeaderExtra}
    >
              {!selectedStore ? (
            <div className="card text-center py-12">
              <Store className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">{t('dashboard.selectStore')}</h2>
              <p className="text-slate-500 mb-6">{t('dashboard.selectStoreHint')}</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    const event = new CustomEvent('openCreateStoreModal')
                    window.dispatchEvent(event)
                  }}
                  className="btn-primary"
                >
                  {t('dashboard.createStore')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* 左侧：店铺渠道工作台 */}
                {preferences.showStoreList && (
                  <div
                    className="hidden lg:block self-start sticky top-4"
                    style={{
                      gridColumn: `span ${Math.max(1, Math.min(12, preferences.storeListCols))}`,
                    }}
                  >
                    <StoreWorkbench
                      onUploadStore={(store) => {
                        setSelectedStore(store)
                        setImportTargetStore({ id: store.id, name: store.name, platform: store.platform })
                        setShowDataImportModal(true)
                      }}
                    />
                  </div>
                )}

                {/* 中间：数据统计 */}
                {preferences.showStats && (
                  <div 
                    className="space-y-6"
                    style={{ 
                      gridColumn: `span ${statsCols}`,
                    }}
                  >
                    <div className="card">
                      <div className="relative z-30 flex items-center justify-between mb-6 pb-4 border-b border-slate-200/60">
                        <div className="flex items-center gap-3">
                          {preferences.showIcons && (
                            <div className="p-2 bg-primary-50 rounded-lg">
                              <BarChart3 className="w-5 h-5 text-primary-600" />
                            </div>
                          )}
                          <div>
                            <h2 className="text-lg font-bold text-slate-900">{t('dashboard.liveDataStats')}</h2>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              <span
                                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 border border-primary-200"
                                title={t('dashboard.periodTotal')}
                              >
                                {t('dashboard.dataPeriodLabel')}: {dataPeriodLabel}
                              </span>
                              <span
                                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                                title={t('dashboard.comparisonPeriodHint', { fallback: '环比为当前周期与上一等长周期对比' })}
                              >
                                {t('dashboard.comparisonPeriodLabel', { fallback: '环比' })}：{t('dashboard.vsPreviousPeriod', { fallback: '较' })}{comparisonPeriodLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-40 sm:w-48">
                              <CustomSelect
                                value={displayCurrency}
                                onChange={setDisplayCurrency}
                                options={getDisplayOptions(t, storeCurrencyCode).map((opt) => ({
                                  value: opt.value,
                                  label: opt.value === 'store' ? `${t('dashboard.currencyStore')} (${displaySymbol} ${storeCurrencyCode})` : opt.label
                                }))}
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-all duration-200 active:scale-95"
                          >
                            {preferences.showIcons && <Filter className="w-4 h-4" />}
                            {showFilters ? t('dashboard.collapseFilters') : t('dashboard.filterData')}
                          </button>
                        </div>
                      </div>

                      {/* 数据筛选工具栏 */}
                      {showFilters && (
                        <div className="relative z-20 mb-6 p-4 bg-gradient-to-br from-slate-50/50 to-slate-100/50 backdrop-blur-sm rounded-xl border border-slate-200/50 shadow-sm transition-all duration-300">
                          <div className="space-y-3">
                            {/* 数据项目选择 */}
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
                                        ? 'bg-primary-100 text-primary-700 border border-primary-300'
                                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 时间周期选择 */}
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                                {preferences.showIcons && <Calendar className="w-3.5 h-3.5" />}
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
                                        ? 'bg-primary-100 text-primary-700 border border-primary-300'
                                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                              {timePeriod === 'monthPick' && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <label className="text-xs text-slate-600">{t('dashboard.monthLabel', { defaultValue: 'Month' })}</label>
                                  <MonthPickerPopover
                                    value={selectedMonth}
                                    onChange={(v) => {
                                      setSelectedMonth(v)
                                      persistTimeFilter({ timePeriod, selectedMonth: v, selectedYear, customDateFrom, customDateTo })
                                    }}
                                    min={MONTH_PICKER_MIN}
                                    max={getCurrentMonth()}
                                    locale={locale}
                                    ariaLabel={t('dashboard.monthLabel', { defaultValue: 'Month' })}
                                    hintTitle={t('dashboard.monthPickerHint', { defaultValue: 'Selectable from 2020-01 to current month' })}
                                  />
                                </div>
                              )}
                              {timePeriod === 'yearPick' && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <label className="text-xs text-slate-600">{t('dashboard.yearLabel', { defaultValue: 'Year' })}</label>
                                  <div className="w-28">
                                    <CustomSelect
                                      value={selectedYear}
                                      onChange={(val) => {
                                        setSelectedYear(val)
                                        persistTimeFilter({ timePeriod, selectedMonth, selectedYear: val, customDateFrom, customDateTo })
                                      }}
                                      options={Array.from(
                                        { length: 12 },
                                        (_, i) => new Date().getFullYear() - 10 + i
                                      ).reverse().map((y) => ({
                                        value: String(y),
                                        label: String(t('dashboard.yearOption', { defaultValue: String(y), year: y } as Record<string, unknown>))
                                      }))}
                                    />
                                  </div>
                                </div>
                              )}
                              {timePeriod === 'custom' && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <label className="text-xs text-slate-600 shrink-0">
                                    {t('dashboard.customRange', { defaultValue: '自定义日期区间' })}
                                  </label>
                                  <DateRangePickerPopover
                                    dateFrom={customDateFrom}
                                    dateTo={customDateTo}
                                    onRangeChange={(from, to) => {
                                      setCustomDateFrom(from)
                                      setCustomDateTo(to)
                                      persistTimeFilter({
                                        timePeriod,
                                        selectedMonth,
                                        selectedYear,
                                        customDateFrom: from,
                                        customDateTo: to,
                                      })
                                    }}
                                    min={minCustomDate}
                                    max={maxCustomDate}
                                    locale={locale}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {isLoading ? (
                        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
                      ) : statsError ? (
                        <div className="text-center py-12 text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
                          {t('dashboard.statsLoadFailed', { defaultValue: 'Failed to load stats. Please check network and retry.' })}
                        </div>
                      ) : stats ? (
                        <>
                            {(Number(stats?.meta?.inRangeCount ?? -1) === 0 ||
                              ((stats.totalGMV ?? 0) === 0 &&
                                (stats.totalDuration ?? 0) === 0 &&
                                (stats.totalViewers ?? 0) === 0 &&
                                (stats.totalOrders ?? 0) === 0)) && (
                              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex flex-wrap items-center justify-between gap-2">
                                <span>
                                  {t('dashboard.noDataInRange', { defaultValue: '该区间无数据，可切换周期或导入该区间数据。' })}
                                  {stats?.meta?.available?.maxDate ? (
                                    <span className="ml-2 text-amber-900/80">
                                      （{t('dashboard.latestDataDate', { defaultValue: '本店最新数据日' })}：{String(stats.meta.available.maxDate)}）
                                    </span>
                                  ) : null}
                                </span>
                                {stats?.meta?.available?.maxDate ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const maxDate = String(stats.meta?.available?.maxDate || '')
                                      const month = maxDate.slice(0, 7)
                                      if (!/^\d{4}-\d{2}$/.test(month)) return
                                      setTimePeriod('monthPick')
                                      setSelectedMonth(month)
                                      persistTimeFilter({
                                        timePeriod: 'monthPick',
                                        selectedMonth: month,
                                        selectedYear,
                                        customDateFrom,
                                        customDateTo,
                                      })
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-200 hover:bg-amber-300 rounded font-medium"
                                    title={t('dashboard.jumpToLatestData', { defaultValue: '跳到最新有数据周期' })}
                                  >
                                    {t('dashboard.jumpToLatestData', { defaultValue: '跳到最新数据' })}
                                  </button>
                                ) : null}
                                {(selectedStore?.platform === 'TikTok' || selectedStore?.platform === '抖音') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setImportTargetStore(selectedStore ? { id: selectedStore.id, name: selectedStore.name, platform: selectedStore.platform } : null)
                                      setShowDataImportModal(true)
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-200 hover:bg-amber-300 rounded font-medium"
                                  >
                                    <FileUp className="w-3.5 h-3.5" />
                                    {t('dashboard.importData')}
                                  </button>
                                )}
                              </div>
                            )}
                          {filteredStats.length === 0 ? (
                            <div className="text-center py-6 text-slate-500 text-sm">
                              {t('dashboard.selectAtLeastOneInFilter')}
                            </div>
                          ) : (
                            <div
                              className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                              style={{ gridAutoRows: 'minmax(0, 1fr)' }}
                            >
                              {filteredStats.map((stat, index) => {
                                const isDraggingCard = draggingDataItemIndex === index
                                return (
                                  <div
                                    key={`${selectedDataItems[index]}-${index}`}
                                    draggable
                                    data-index={index}
                                    onDragStart={(e) => {
                                      setDraggingDataItemIndex(index)
                                      e.dataTransfer.setData('text/plain', String(index))
                                      e.dataTransfer.effectAllowed = 'move'
                                    }}
                                    onDragEnd={() => setDraggingDataItemIndex(null)}
                                    onDragOver={(e) => {
                                      e.preventDefault()
                                      e.dataTransfer.dropEffect = 'move'
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault()
                                      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
                                      const toIndex = index
                                      if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
                                        handleDataItemDragReorder(fromIndex, toIndex)
                                      }
                                      setDraggingDataItemIndex(null)
                                    }}
                                    className={`relative transition-opacity cursor-grab active:cursor-grabbing rounded-lg ${
                                      isDraggingCard ? 'opacity-60 ring-2 ring-primary-400 ring-offset-1' : ''
                                    }`}
                                    title={t('dashboard.dragToReorder', { defaultValue: 'Drag to reorder cards' })}
                                  >
                                    <div className="absolute top-1.5 right-1.5 z-10 text-slate-400 hover:text-slate-500 pointer-events-none" aria-hidden>
                                      <GripVertical className="w-3.5 h-3.5" />
                                    </div>
                                    <StatCard
                                      title={stat.title}
                                      titleTooltip={stat.titleTooltip}
                                      value={stat.value}
                                      subtitle={stat.subtitle}
                                      change={stat.change}
                                      changeYoY={stat.changeYoY}
                                      icon={stat.icon}
                                      compact
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-12 text-slate-500">
                          暂无数据
                        </div>
                      )}

                    </div>
                  </div>
                )}
              </div>

              {/* 待处理任务 - 移到视觉中心（运营/管理角色显示） */}
              {preferences.showTaskList && (
                <div className="mt-8">
                  <TaskList />
                </div>
              )}
            </>
          )}
      
      {/* 创建/编辑店铺模态框 */}
      <CreateStoreModal
        isOpen={showCreateStoreModal}
        onClose={() => { setShowCreateStoreModal(false); setEditStore(null) }}
        store={editStore}
      />
      
      {/* 数据导入模态框 */}
      <DataImportModal
        isOpen={showDataImportModal}
        targetStore={importTargetStore}
        onClose={() => {
          setShowDataImportModal(false)
          setImportTargetStore(null)
        }}
        onSuccess={async () => {
          // 导入成功后联动刷新：统计、趋势图、待办（先失效再主动拉取，确保界面更新）
          queryClient.invalidateQueries({ queryKey: ['liveStats'] })
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          await Promise.all([
            queryClient.refetchQueries({ queryKey: ['liveStats'] }),
            queryClient.refetchQueries({ queryKey: ['tasks'] }),
          ])
        }}
      />

      {/* 布局设置 */}
      <LayoutSettings />
    </AppLayout>
  )
}
