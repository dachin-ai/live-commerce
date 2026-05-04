import { useState, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  BarChart3, Target, Zap, ShoppingBag, TrendingUp, TrendingDown,
  AlertTriangle, Sparkles, Save, ArrowUpRight, ArrowDownRight,
  Search, Upload, Layers, Radio, ShoppingCart, GitCompare, PieChart, Settings2, Video
} from 'lucide-react'
import {
  useLivePerformance, useAdMatrix, useProductRadar,
  useResultsOverview, useGenerateTargets, useSaveTarget, useOmniChannel, useVideoPerformance
} from '../services/ttBi'
import { getCurrentUserRole } from '../services/auth'
import TtDataExplorer from './TtDataExplorer'
import PeriodCompareTable from './PeriodCompareTable'
import ChartBuilder, { type ChartPlan } from './ChartBuilder'
import SortableTable, { type ColumnDef } from './SortableTable'

interface Props {
  storeId: string
  dateFrom?: string
  dateTo?: string
  compareDateFrom?: string
  compareDateTo?: string
  onRequestUpload?: () => void
}

const CHANNEL_COLORS: Record<string, string> = { LIVE: '#3b82f6', SHOP_TAB: '#10b981' }
const CHANNEL_ICONS: Record<string, typeof Radio> = { LIVE: Radio, SHOP_TAB: ShoppingCart }

// ─── KPI 可配置 hook ────────────────────────────────────────────────────
function useKpiConfig(storageKey: string, allLabels: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {}
    return new Set()
  })

  const toggle = (label: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else if (allLabels.length - prev.size > 1) next.add(label) // 至少保留一个
      try { localStorage.setItem(storageKey, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const resetAll = () => {
    setHidden(new Set())
    try { localStorage.removeItem(storageKey) } catch {}
  }

  return { hidden, toggle, resetAll }
}

// ─── KPI 配置按钮组件 ───────────────────────────────────────────────────
function KpiConfigButton({ kpis, hidden, toggle, resetAll }: {
  kpis: { label: string }[]
  hidden: Set<string>
  toggle: (label: string) => void
  resetAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="配置指标卡片"
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all border ${
          hidden.size > 0
            ? 'bg-blue-50 text-blue-600 border-blue-200'
            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
        }`}
      >
        <Settings2 className="w-3.5 h-3.5" />
        指标
        {hidden.size > 0 && <span className="ml-0.5 text-blue-500">({kpis.length - hidden.size}/{kpis.length})</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 shadow-lg rounded-xl p-3 min-w-[180px]">
          <div className="text-[10px] font-semibold text-slate-400 uppercase mb-2 px-1">显示指标</div>
          <div className="space-y-1">
            {kpis.map(k => (
              <label key={k.label} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!hidden.has(k.label)}
                  onChange={() => toggle(k.label)}
                  className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300"
                />
                <span className="text-xs text-slate-700">{k.label}</span>
              </label>
            ))}
          </div>
          {hidden.size > 0 && (
            <button
              onClick={resetAll}
              className="mt-2 w-full text-[11px] text-blue-500 hover:text-blue-700 text-center"
            >
              恢复全部显示
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function fmt(n: number | undefined | null): string {
  if (n == null) return '0'
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function pctBadge(val: number | null) {
  if (val === null) return <span className="text-xs text-slate-400">N/A</span>
  const isUp = val > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
      isUp ? 'bg-emerald-50 text-emerald-700' : val < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
    }`}>
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : val < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
      {val > 0 ? '+' : ''}{val.toFixed(1)}%
    </span>
  )
}

/** KPI 卡片 — 支持对比期数据显示 */
function KpiCard({
  label, value, compareValue, sub, gradient, border, textColor, labelColor
}: {
  label: string; value: number; compareValue?: number | null;
  sub?: string; gradient: string; border: string; textColor: string; labelColor: string
}) {
  const hasCompare = compareValue != null
  const delta = hasCompare ? value - compareValue! : null
  const deltaPct = hasCompare && compareValue! > 0 ? (delta! / compareValue!) * 100 : null
  const up = delta != null && delta >= 0

  return (
    <div className={`card bg-gradient-to-br ${gradient} ${border} border`}>
      <p className={`text-xs font-medium ${labelColor}`}>{label}</p>
      <p className={`text-2xl font-bold ${textColor} mt-1`}>{fmt(value)}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {hasCompare && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/40">
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${
            up ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {deltaPct != null ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : '--'}
          </span>
          <span className="text-[10px] text-slate-400 truncate">vs {fmt(compareValue)}</span>
        </div>
      )}
    </div>
  )
}

export default function BiDashboard({ storeId, dateFrom, dateTo, compareDateFrom, compareDateTo, onRequestUpload }: Props) {
  const hasCompare = !!(compareDateFrom && compareDateTo)
  const [tab, setTab] = useState<'omni' | 'results' | 'live' | 'ads' | 'products' | 'video' | 'compare' | 'chart' | 'explorer'>('omni')
  const [chartPlan, setChartPlan] = useState<ChartPlan | null>(null)

  const sendToChart = (plan: ChartPlan) => {
    setChartPlan(plan)
    setTab('chart')
  }

  const tabs = [
    { key: 'omni' as const, label: '全渠道', icon: Layers, color: 'text-indigo-600' },
    { key: 'results' as const, label: '结果复盘', icon: Target, color: 'text-blue-600' },
    { key: 'live' as const, label: '直播分析', icon: BarChart3, color: 'text-emerald-600' },
    { key: 'ads' as const, label: '广告矩阵', icon: Zap, color: 'text-amber-600' },
    { key: 'products' as const, label: '商品雷达', icon: ShoppingBag, color: 'text-violet-600' },
    { key: 'video' as const, label: '视频引流', icon: Video, color: 'text-pink-600' },
    ...(hasCompare ? [{ key: 'compare' as const, label: '期间对比', icon: GitCompare, color: 'text-fuchsia-600' }] : []),
    { key: 'chart' as const, label: '制图', icon: PieChart, color: 'text-rose-600' },
    { key: 'explorer' as const, label: '灵活探索', icon: Search, color: 'text-slate-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex bg-slate-100 p-1 rounded-xl w-fit flex-wrap gap-0.5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? `bg-white ${t.color} shadow-sm` : 'text-slate-500 hover:text-slate-700'
            } ${t.key === 'compare' ? 'relative' : ''}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.key === 'compare' && <span className="absolute -top-1 -right-1 w-2 h-2 bg-fuchsia-500 rounded-full" />}
          </button>
        ))}
      </div>

      {tab === 'omni' && <OmniChannelTab storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} compareDateFrom={compareDateFrom} compareDateTo={compareDateTo} onSendToChart={sendToChart} />}
      {tab === 'results' && <ResultsTab storeId={storeId} dateFrom={dateFrom} />}
      {tab === 'live' && <LiveTab storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} compareDateFrom={compareDateFrom} compareDateTo={compareDateTo} onSendToChart={sendToChart} />}
      {tab === 'ads' && <AdsTab storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} compareDateFrom={compareDateFrom} compareDateTo={compareDateTo} onSendToChart={sendToChart} />}
      {tab === 'products' && <ProductsTab storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} onRequestUpload={onRequestUpload} />}
      {tab === 'video' && <VideoTab storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} onRequestUpload={onRequestUpload} />}
      {tab === 'compare' && <CompareTab storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} compareDateFrom={compareDateFrom} compareDateTo={compareDateTo} />}
      {tab === 'chart' && <ChartBuilder initialPlan={chartPlan} />}
      {tab === 'explorer' && <TtDataExplorer storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 0: 全渠道矩阵总览
// ═══════════════════════════════════════════════════════════════════════
function OmniChannelTab({ storeId, dateFrom, dateTo, compareDateFrom, compareDateTo, onSendToChart }: Props & { onSendToChart?: (p: ChartPlan) => void }) {
  const { data, isLoading } = useOmniChannel(storeId, dateFrom, dateTo, compareDateFrom, compareDateTo)
  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>
  if (!data) return <div className="py-12 text-center text-slate-500">暂无数据</div>

  const { channels, total, ad, trends } = data
  const cmp = data.compare

  const pieOption = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, data: channels.map(c => c.label) },
    series: [{
      type: 'pie' as const, radius: ['42%', '72%'], padAngle: 3,
      itemStyle: { borderRadius: 6 },
      label: { show: true, formatter: '{b}\n{d}%', fontSize: 12, fontWeight: 'bold' as const },
      data: channels.map(c => ({
        name: c.label, value: c.gmv,
        itemStyle: { color: CHANNEL_COLORS[c.channel] || '#94a3b8' }
      })),
    }],
  }

  const allDates = [...new Set([
    ...(trends.live || []).map(t => t.date),
    ...(trends.shopTab || []).map(t => t.date),
  ])].sort()

  const liveMap = new Map((trends.live || []).map(t => [t.date, t.gmv]))
  const shopMap = new Map((trends.shopTab || []).map(t => [t.date, t.gmv]))

  // Compare trend maps
  const cmpLiveArr = cmp?.trends?.live || []
  const cmpShopArr = cmp?.trends?.shopTab || []

  // 对比模式：用 D+index 虚化 X 轴，避免当期日期与对比期按索引对齐
  // 造成"同日期"的错误视觉印象（与 LiveTab 对齐处理一致）
  const maxLen = cmp
    ? Math.max(allDates.length, cmpLiveArr.length, cmpShopArr.length)
    : allDates.length
  const xLabels = cmp
    ? Array.from({ length: maxLen }, (_, i) => `D${i + 1}`)
    : allDates.map(d => d.slice(5))

  const trendOption = allDates.length > 0 ? {
    tooltip: {
      trigger: 'axis' as const,
      formatter: cmp
        ? (params: any[]) => {
            const i = params[0]?.dataIndex ?? 0
            const cur = allDates[i]?.slice(5) ?? ''
            const cmpL = cmpLiveArr[i]?.date?.slice(5) ?? ''
            const header = `D${i + 1}  当期: ${cur}  对比: ${cmpL}<br/>`
            return header + params.map((p: any) => `${p.marker}${p.seriesName}: ${p.value}`).join('<br/>')
          }
        : undefined,
    },
    legend: { data: ['直播 GMV', '商品卡 GMV', ...(cmp ? ['直播(对比)', '商品卡(对比)'] : [])], bottom: 0 },
    grid: { left: 60, right: 20, bottom: 50, top: 20 },
    xAxis: { type: 'category' as const, data: xLabels },
    yAxis: { type: 'value' as const },
    series: [
      { name: '直播 GMV', type: 'bar', stack: 'gmv', data: allDates.map(d => liveMap.get(d) ?? 0), itemStyle: { color: '#3b82f6' } },
      { name: '商品卡 GMV', type: 'bar', stack: 'gmv', data: allDates.map(d => shopMap.get(d) ?? 0), itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] } },
      ...(cmp ? [
        // 按索引对齐（D1=当期第1天 vs 对比期第1天），避免 [...Map.keys()][i] 的 O(n²)
        { name: '直播(对比)', type: 'line', data: Array.from({ length: maxLen }, (_, i) => Number(cmpLiveArr[i]?.gmv ?? 0)), lineStyle: { type: 'dashed' as const, color: '#93c5fd' }, itemStyle: { color: '#93c5fd' }, smooth: true },
        { name: '商品卡(对比)', type: 'line', data: Array.from({ length: maxLen }, (_, i) => Number(cmpShopArr[i]?.gmv ?? 0)), lineStyle: { type: 'dashed' as const, color: '#6ee7b7' }, itemStyle: { color: '#6ee7b7' }, smooth: true },
      ] : []),
    ],
  } : null


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="全渠道 GMV" value={total.gmv} compareValue={cmp?.total?.gmv}
          sub="直播 + 商品卡 汇总" gradient="from-indigo-50 to-indigo-100" border="border-indigo-200" textColor="text-indigo-900" labelColor="text-indigo-600" />
        <KpiCard label="全渠道订单" value={total.orders} compareValue={cmp?.total?.orders}
          gradient="from-emerald-50 to-emerald-100" border="border-emerald-200" textColor="text-emerald-900" labelColor="text-emerald-600" />
        <KpiCard label="广告投入" value={ad.cost} compareValue={cmp?.ad?.cost}
          sub={`广告归因 GMV: ${fmt(ad.gmv)}`} gradient="from-amber-50 to-amber-100" border="border-amber-200" textColor="text-amber-900" labelColor="text-amber-600" />
        <KpiCard
          label="广告 ROI" value={ad.cost > 0 ? Number((ad.gmv / ad.cost).toFixed(2)) : 0}
          compareValue={cmp && cmp.ad.cost > 0 ? Number((cmp.ad.gmv / cmp.ad.cost).toFixed(2)) : null}
          gradient="from-blue-50 to-blue-100" border="border-blue-200"
          textColor={ad.cost > 0 ? (ad.gmv / ad.cost >= 2 ? 'text-emerald-700' : ad.gmv / ad.cost < 1 ? 'text-red-600' : 'text-blue-900') : 'text-slate-400'}
          labelColor="text-blue-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {channels.map(ch => {
          const cmpCh = cmp?.channels?.find((c: any) => c.channel === ch.channel)
          const Icon = CHANNEL_ICONS[ch.channel] || Layers
          const color = CHANNEL_COLORS[ch.channel] || '#94a3b8'
          const gmvDelta = cmpCh ? ((ch.gmv - cmpCh.gmv) / Math.max(cmpCh.gmv, 1)) * 100 : null
          return (
            <div key={ch.channel} className="card border-l-4" style={{ borderLeftColor: color }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{ch.label}</p>
                    <p className="text-[10px] text-slate-400">{ch.channel === 'LIVE' ? '直播间成交数据' : '橱窗/商城静默成交'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold" style={{ color }}>{ch.gmvPct}%</span>
                  <p className="text-[10px] text-slate-400">GMV 占比</p>
                  {gmvDelta != null && pctBadge(Math.round(gmvDelta * 100) / 100)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-500">GMV</p>
                  <p className="text-base font-bold text-slate-900">{fmt(ch.gmv)}</p>
                  {cmpCh && <p className="text-[10px] text-slate-400">vs {fmt(cmpCh.gmv)}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-500">订单</p>
                  <p className="text-base font-bold text-slate-900">{fmt(ch.orders)}</p>
                  {cmpCh && <p className="text-[10px] text-slate-400">vs {fmt(cmpCh.orders)}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-500">{ch.channel === 'LIVE' ? '场次' : '曝光'}</p>
                  <p className="text-base font-bold text-slate-900">{ch.channel === 'LIVE' ? fmt(ch.sessions) : fmt(ch.views)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${ch.gmvPct}%`, backgroundColor: color }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">渠道 GMV 占比</h4>
          <ReactECharts option={pieOption} style={{ height: 300 }} />
        </div>
        {trendOption && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-slate-700">渠道 GMV 趋势{cmp ? ' (实线=当期 虚线=对比期)' : ''}</h4>
              {onSendToChart && allDates.length > 0 && (
                <button
                  onClick={() => onSendToChart({
                    title: '渠道 GMV 趋势',
                    series: [
                      { name: '直播 GMV', data: allDates.map(d => ({ x: d, y: Number(liveMap.get(d) ?? 0) })), color: '#3b82f6' },
                      { name: '商品卡 GMV', data: allDates.map(d => ({ x: d, y: Number(shopMap.get(d) ?? 0) })), color: '#10b981' },
                    ]
                  })}
                  className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium rounded-lg transition-colors border border-rose-200"
                >
                  📊 微制图
                </button>
              )}
            </div>
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 1: 结果复盘
// ═══════════════════════════════════════════════════════════════════════
function ResultsTab({ storeId, dateFrom }: { storeId: string; dateFrom?: string }) {
  const [month, setMonth] = useState(() => {
    if (dateFrom) return dateFrom.slice(0, 7)
    return new Date().toLocaleDateString('sv-SE').slice(0, 7)  // 本地时区月份，避免 12月31日跨年
  })
  const { data, isLoading } = useResultsOverview(storeId, month)
  const generateMut = useGenerateTargets()
  const saveMut = useSaveTarget()
  const [editingTarget, setEditingTarget] = useState<{ metric: string; value: string } | null>(null)

  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>

  const actual = data?.actual ?? { gmv: 0, orders: 0, sessions: 0, adSpend: 0, adRoi: 0, avgCvr: 0, gmvPerSession: 0, liveGmv: 0, shopTabGmv: 0, liveOrders: 0, shopTabOrders: 0 }
  const targets = data?.targets ?? {}
  const targetNotes = data?.targetNotes ?? {}
  const trend = data?.monthlyTrend ?? []

  type KpiItem = {
    metric: string; label: string; source: string; actual: number; target: number | undefined
    color: string; breakdown: { label: string; value: number; color: string }[]
    format?: (v: number) => string; lowerIsBetter?: boolean
  }

  // 量：规模指标（越大越接近目标越好）
  const volumeKpis: KpiItem[] = [
    { metric: 'gmv', label: '总销售额', source: '直播+商品卡', actual: actual.gmv, target: targets.gmv, color: '#6366f1',
      breakdown: [{ label: '直播', value: actual.liveGmv ?? 0, color: '#3b82f6' }, { label: '商品卡', value: actual.shopTabGmv ?? 0, color: '#10b981' }] },
    { metric: 'orders', label: '总订单数', source: '直播+商品卡', actual: actual.orders, target: targets.orders, color: '#10b981',
      breakdown: [{ label: '直播', value: actual.liveOrders ?? 0, color: '#3b82f6' }, { label: '商品卡', value: actual.shopTabOrders ?? 0, color: '#10b981' }] },
    { metric: 'sessions', label: '直播场次', source: '直播', actual: actual.sessions, target: targets.sessions, color: '#8b5cf6', breakdown: [] },
  ]

  // 质：效率指标（精细格式化，广告花费为预算上限）
  const qualityKpis: KpiItem[] = [
    { metric: 'gmvPerSession', label: '场均GMV', source: '效率', actual: actual.gmvPerSession ?? 0, target: targets.gmvPerSession, color: '#f59e0b', breakdown: [],
      format: (v) => `¥${fmt(v)}` },
    { metric: 'cvr', label: '平均CVR', source: '转化', actual: actual.avgCvr ?? 0, target: targets.cvr, color: '#06b6d4', breakdown: [],
      format: (v) => `${Number(v).toFixed(2)}%` },
    { metric: 'adRoi', label: '广告ROI', source: '投效', actual: actual.adRoi ?? 0, target: targets.adRoi, color: '#84cc16', breakdown: [],
      format: (v) => Number(v).toFixed(2) },
    { metric: 'adSpend', label: '广告花费', source: '预算上限', actual: actual.adSpend, target: targets.adSpend, color: '#f97316', breakdown: [],
      lowerIsBetter: true },
  ]

  const renderKpiCard = (kpi: KpiItem) => {
    const pct = kpi.target ? Math.min(100, (kpi.actual / kpi.target) * 100) : 0
    const isUnder = !!kpi.lowerIsBetter
    const pctColor = isUnder
      ? (pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-600' : 'text-emerald-600')
      : (pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500')
    const barColor = isUnder && pct >= 100 ? '#ef4444' : kpi.color
    const display = (v: number) => kpi.format ? kpi.format(v) : fmt(v)
    return (
      <div key={kpi.metric} className="card relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-medium text-slate-500 truncate">{kpi.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 shrink-0">{kpi.source}</span>
            {isUnder && <span className="text-[9px] px-1 py-0.5 bg-orange-50 text-orange-400 rounded shrink-0">≤目标</span>}
          </div>
          {kpi.target ? (
            <span className={`text-xs font-bold shrink-0 ml-1 ${pctColor}`}>{pct.toFixed(0)}%</span>
          ) : (
            <button onClick={() => setEditingTarget({ metric: kpi.metric, value: '' })} className="text-xs text-blue-500 hover:text-blue-700 shrink-0 ml-1">设置</button>
          )}
        </div>
        <p className="text-2xl font-bold text-slate-900">{display(kpi.actual)}</p>
        {kpi.breakdown.length > 0 && kpi.actual > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {kpi.breakdown.map((b, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="text-slate-500">{b.label}</span>
                <span className="font-medium text-slate-700">{fmt(b.value)}</span>
              </div>
            ))}
          </div>
        )}
        {kpi.target && (
          <>
            <div className="flex items-center gap-1 mt-1">
              <p className="text-xs text-slate-400">目标: {display(kpi.target)}</p>
              {targetNotes[kpi.metric]?.isAiGenerated && (
                <span className="text-[9px] px-1 py-0.5 bg-violet-100 text-violet-500 rounded font-medium leading-none">AI</span>
              )}
            </div>
            {targetNotes[kpi.metric]?.note && (
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">算法: {targetNotes[kpi.metric].note}</p>
            )}
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
        {(() => {
          const role = getCurrentUserRole()
          const isMgr = role === 'admin' || role === 'manager'
          return isMgr ? (
            <>
              <button onClick={() => generateMut.mutate({ storeId, month })} disabled={generateMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white text-sm font-medium rounded-lg hover:from-violet-600 hover:to-blue-600 transition-all shadow-sm disabled:opacity-50">
                <Sparkles className="w-4 h-4" /> {generateMut.isPending ? '生成中...' : '一键生成基准目标'}
              </button>
              {generateMut.isSuccess && <span className="text-xs text-emerald-600 font-medium">✓ 已生成</span>}
            </>
          ) : (
            <span className="text-xs text-slate-400 italic px-2 py-1 bg-slate-50 rounded-lg border border-slate-200">
              💡 目标设置仅管理员可操作
            </span>
          )
        })()}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">量 · 规模指标</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{volumeKpis.map(renderKpiCard)}</div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">质 · 效率指标</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{qualityKpis.map(renderKpiCard)}</div>
        </div>
      </div>

      {editingTarget && (
        <div className="card border-2 border-blue-200 bg-blue-50/50">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">设置目标 ({month})</span>
            <input type="number" value={editingTarget.value} onChange={e => setEditingTarget({ ...editingTarget, value: e.target.value })}
              placeholder="输入目标值" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-40" />
            <button onClick={() => { saveMut.mutate({ storeId, month, metric: editingTarget.metric, targetValue: Number(editingTarget.value) }); setEditingTarget(null) }}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg"><Save className="w-3.5 h-3.5" /> 保存</button>
            <button onClick={() => setEditingTarget(null)} className="text-sm text-slate-500">取消</button>
          </div>
        </div>
      )}

      {trend.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">月度销售趋势</h4>
          <ReactECharts option={{
            tooltip: { trigger: 'axis' }, legend: { data: ['GMV', '订单数'], bottom: 0 },
            grid: { left: 60, right: 20, bottom: 40, top: 20 },
            xAxis: { type: 'category', data: trend.map(t => t.month) },
            yAxis: [{ type: 'value', name: 'GMV', position: 'left' }, { type: 'value', name: '订单', position: 'right' }],
            series: [
              { name: 'GMV', type: 'bar', data: trend.map(t => t.gmv), itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } },
              { name: '订单数', type: 'line', yAxisIndex: 1, data: trend.map(t => t.orders), smooth: true, itemStyle: { color: '#10b981' } },
            ]
          }} style={{ height: 300 }} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 2: 直播分析 (with compare)
// ═══════════════════════════════════════════════════════════════════════
function LiveTab({ storeId, dateFrom, dateTo, compareDateFrom, compareDateTo, onSendToChart }: Props & { onSendToChart?: (p: ChartPlan) => void }) {
  const { data, isLoading } = useLivePerformance(storeId, dateFrom, dateTo, compareDateFrom, compareDateTo)
  // ❗ Must be before any conditional return (Rules of Hooks)
  const { hidden: liveHidden, toggle: liveToggle, resetAll: liveReset } = useKpiConfig(
    'bi-live-kpis',
    ['总GMV', '总订单', '总观看', '均时GMV', '互动率', '新粉丝']
  )
  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>
  if (!data) return <div className="py-12 text-center text-slate-500">暂无数据</div>

  const s = data.summary
  const cs = data.compareSummary
  const tops = data.topSessions
  const trend = data.dailyTrend
  const cmpTrend = data.compareDailyTrend || []

  const kpis = [
    { label: '总GMV', value: s.totalGmv, cmp: cs?.totalGmv, sub: `${s.totalSessions} 场`, g: 'from-blue-50 to-blue-100', b: 'border-blue-200', t: 'text-blue-900', l: 'text-blue-600' },
    { label: '总订单', value: s.totalOrders, cmp: cs?.totalOrders, sub: `${fmt(s.totalItemsSold)} 件`, g: 'from-emerald-50 to-emerald-100', b: 'border-emerald-200', t: 'text-emerald-900', l: 'text-emerald-600' },
    { label: '总观看', value: s.totalViews, cmp: cs?.totalViews, sub: '峰值观众累计', g: 'from-violet-50 to-violet-100', b: 'border-violet-200', t: 'text-violet-900', l: 'text-violet-600' },
    { label: '均时GMV', value: s.avgGmvPerHour, cmp: cs?.avgGmvPerHour, sub: `转化率 ${(s.avgOrderCvr ?? 0).toFixed(2)}%`, g: 'from-amber-50 to-amber-100', b: 'border-amber-200', t: 'text-amber-900', l: 'text-amber-600' },
    { label: '互动率', value: s.avgEngagementRate, cmp: cs?.avgEngagementRate, sub: `CTR ${(s.avgCtr ?? 0).toFixed(2)}%`, g: 'from-rose-50 to-rose-100', b: 'border-rose-200', t: 'text-rose-900', l: 'text-rose-600' },
    { label: '新粉丝', value: s.totalNewFollowers, cmp: cs?.totalNewFollowers, sub: `总时长 ${Math.round((s.totalDurationSec ?? 0) / 3600)}h`, g: 'from-cyan-50 to-cyan-100', b: 'border-cyan-200', t: 'text-cyan-900', l: 'text-cyan-600' },
  ]

  // 双趋势图：按 index 对齐（非日期对齐）
  const curDates = trend.map((t: any) => t.date?.slice(5) ?? '')
  const cmpDates = cmpTrend.map((t: any) => t.date?.slice(5) ?? '')
  const maxLen = Math.max(curDates.length, cmpDates.length)
  const xLabels = Array.from({ length: maxLen }, (_, i) => `D${i + 1}`)

  const trendOption = trend.length > 0 ? {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['GMV', '观看量', ...(cs ? ['GMV(对比)', '观看(对比)'] : [])], bottom: 0 },
    grid: { left: 60, right: 60, bottom: 50, top: 20 },
    xAxis: {
      type: 'category' as const,
      data: xLabels,
      axisLabel: {
        formatter: (_: string, i: number) => {
          const cur = curDates[i] || ''
          const cmp = cmpDates[i] || ''
          return cs ? `${cur}\n(${cmp})` : cur
        }
      }
    },
    yAxis: [{ type: 'value' as const, name: 'GMV', position: 'left' }, { type: 'value' as const, name: '观看', position: 'right' }],
    series: [
      { name: 'GMV', type: 'bar', data: trend.map((t: any) => t.gmv ?? 0), itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] } },
      { name: '观看量', type: 'line', yAxisIndex: 1, data: trend.map((t: any) => t.views ?? 0), smooth: true, itemStyle: { color: '#8b5cf6' } },
      ...(cs && cmpTrend.length > 0 ? [
        { name: 'GMV(对比)', type: 'bar', data: cmpTrend.map((t: any) => t.gmv ?? 0), itemStyle: { color: '#93c5fd', borderRadius: [4, 4, 0, 0] } },
        { name: '观看(对比)', type: 'line', yAxisIndex: 1, data: cmpTrend.map((t: any) => t.views ?? 0), smooth: true, lineStyle: { type: 'dashed' as const }, itemStyle: { color: '#c4b5fd' } },
      ] : []),
    ],
  } : null

  const visibleKpis = kpis.filter(k => !liveHidden.has(k.label))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">
          {cs ? <span className="px-2 py-0.5 bg-violet-50 border border-violet-200 text-violet-600 rounded-full">期间对比模式</span> : null}
        </div>
        <KpiConfigButton
          kpis={kpis}
          hidden={liveHidden}
          toggle={liveToggle}
          resetAll={liveReset}
        />
      </div>
      <div className={`grid gap-3 ${
        visibleKpis.length <= 2 ? 'grid-cols-2' :
        visibleKpis.length <= 3 ? 'grid-cols-3' :
        visibleKpis.length <= 4 ? 'grid-cols-2 lg:grid-cols-4' :
        'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
      }`}>
        {visibleKpis.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} compareValue={k.cmp} sub={k.sub}
            gradient={k.g} border={k.b} textColor={k.t} labelColor={k.l} />
        ))}
      </div>

      {trendOption && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-700">
              GMV 与观看日趋势{cs ? ' (蓝色实柱=当期 浅蓝虚柱=对比期)' : ''}
            </h4>
            {onSendToChart && trend.length > 0 && (
              <button
                onClick={() => onSendToChart({
                  title: '直播 GMV 日趋势',
                  series: [
                    { name: 'GMV', data: trend.map((t: any) => ({ x: t.date ?? '', y: Number(t.gmv ?? 0) })), color: '#3b82f6' },
                    { name: '观看量', data: trend.map((t: any) => ({ x: t.date ?? '', y: Number(t.views ?? 0) })), color: '#8b5cf6', yAxis: 1 },
                  ]
                })}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium rounded-lg transition-colors border border-rose-200"
              >
                📊 微制图
              </button>
            )}
          </div>
          <ReactECharts option={trendOption} style={{ height: 320 }} />
        </div>
      )}

      <SortableTable
        title="场次排行"
        data={tops}
        columns={[
          { key: 'name', label: '直播场次', width: '200px' },
          { key: 'grossRevenue', label: 'GMV', align: 'right' },
          { key: 'ordersPaid', label: '订单', align: 'right' },
          { key: 'views', label: '观看', align: 'right' },
          { key: 'peakViewers', label: '峰值', align: 'right' },
          { key: 'gmvPerHour', label: '时效/h', align: 'right' },
          { key: 'orderCvr', label: '转化率', align: 'right', format: (v: any) => `${(v ?? 0).toFixed(2)}%` },
          { key: 'engagementRate', label: '互动率', align: 'right', format: (v: any) => `${(v ?? 0).toFixed(2)}%` },
          { key: 'ctr', label: 'CTR', align: 'right', format: (v: any) => `${(v ?? 0).toFixed(2)}%` },
          { key: 'durationSeconds', label: '时长(h)', align: 'right', format: (v: any) => `${(Number(v ?? 0) / 3600).toFixed(1)}`, defaultHidden: true },
          { key: 'itemsSold', label: '件数', align: 'right', defaultHidden: true },
          { key: 'productImpressions', label: '商品曝光', align: 'right', defaultHidden: true },
          { key: 'productClicks', label: '商品点击', align: 'right', defaultHidden: true },
        ] as ColumnDef[]}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 3: 广告矩阵 (with compare)
// ═══════════════════════════════════════════════════════════════════════
function AdsTab({ storeId, dateFrom, dateTo, compareDateFrom, compareDateTo, onSendToChart }: Props & { onSendToChart?: (p: ChartPlan) => void }) {
  const { data, isLoading } = useAdMatrix(storeId, dateFrom, dateTo, compareDateFrom, compareDateTo)
  // ❗ Must be before any conditional return (Rules of Hooks)
  const { hidden: adsHidden, toggle: adsToggle, resetAll: adsReset } = useKpiConfig(
    'bi-ads-kpis',
    ['总花费', '广告销售额', '整体 ROI', '广告订单']
  )
  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>
  if (!data) return <div className="py-12 text-center text-slate-500">暂无广告数据</div>
  const ov = data.overall
  const cov = data.compareOverall

  const adKpis = [
    { label: '总花费', value: ov.totalCost, cmp: cov?.totalCost, src: '广告投放', g: 'from-amber-50 to-amber-100', b: 'border-amber-200', t: 'text-amber-900', l: 'text-amber-600' },
    { label: '广告销售额', value: ov.totalRevenue, cmp: cov?.totalRevenue, src: '广告归因', g: 'from-emerald-50 to-emerald-100', b: 'border-emerald-200', t: 'text-emerald-900', l: 'text-emerald-600' },
    { label: '整体 ROI', value: ov.overallRoi, cmp: cov?.overallRoi, src: '广告归因', g: 'from-blue-50 to-blue-100', b: 'border-blue-200', t: ov.overallRoi >= 2 ? 'text-emerald-700' : ov.overallRoi < 1 ? 'text-red-600' : 'text-blue-900', l: 'text-blue-600' },
    { label: '广告订单', value: ov.totalOrders, cmp: cov?.totalOrders, src: '广告归因', g: 'from-violet-50 to-violet-100', b: 'border-violet-200', t: 'text-violet-900', l: 'text-violet-600', sub: `${ov.totalPlans} 个计划` },
  ]

  const visibleAdKpis = adKpis.filter(k => !adsHidden.has(k.label))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <KpiConfigButton
          kpis={adKpis}
          hidden={adsHidden}
          toggle={adsToggle}
          resetAll={adsReset}
        />
      </div>

      {/* ⚠️ 广告数据粒度说明 */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 leading-relaxed">
        <span className="shrink-0 text-base leading-none">⚠️</span>
        <span>
          广告数据为所选时段内<strong>整体汇总展示</strong>，<strong>不支持按天拆分</strong>查看。
          如需查看每日消耗，建议每日导出并分批上传。
          广告 GMV 为平台归因预估值，非实际成交额。
        </span>
      </div>

      <div className={`grid gap-4 ${
        visibleAdKpis.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'
      }`}>
        {visibleAdKpis.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} compareValue={k.cmp} sub={k.sub}
            gradient={k.g} border={k.b} textColor={k.t} labelColor={k.l} />
        ))}
      </div>

      {data.byCampaign.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-slate-700">广告计划投产效率 (花费 vs ROI)</h4>
            {onSendToChart && (
              <button
                onClick={() => onSendToChart({
                  title: '广告计划 花费 × ROI 四象限',
                  chartType: 'quadrant',
                  series: [
                    {
                      name: '花费',
                      data: data.byCampaign.slice(0, 30).map((c: any) => ({ x: String(c.campaignName ?? '').slice(0, 10), y: Number(c.cost ?? 0) })),
                      color: '#f59e0b',
                    },
                    {
                      name: 'ROI',
                      data: data.byCampaign.slice(0, 30).map((c: any) => ({ x: String(c.campaignName ?? '').slice(0, 10), y: Number(c.roi ?? 0) })),
                      color: '#3b82f6',
                    },
                  ]
                })}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium rounded-lg transition-colors border border-rose-200"
              >
                📊 微制图
              </button>
            )}
          </div>
          <ReactECharts option={{
            tooltip: { trigger: 'item', formatter: (p: any) => `${p.data[2]}<br/>花费: ${fmt(p.data[0])}<br/>ROI: ${p.data[1]}` },
            grid: { left: 60, right: 20, bottom: 40, top: 20 },
            xAxis: { type: 'value', name: '花费', nameLocation: 'center', nameGap: 30 },
            yAxis: { type: 'value', name: 'ROI' },
            series: [{ type: 'scatter', symbolSize: (d: number[]) => Math.max(8, Math.min(40, d[0] / Math.max(1, ov.totalCost) * 200)),
              data: data.byCampaign.map((c: any) => [c.cost, c.roi, c.campaignName]),
              itemStyle: { color: (p: any) => p.data[1] >= 2 ? '#10b981' : p.data[1] >= 1 ? '#3b82f6' : '#ef4444' } }]
          }} style={{ height: 350 }} />
        </div>
      )}

      <SortableTable
        title="广告计划明细"
        data={data.byCampaign}
        columns={[
          { key: 'campaignName', label: '广告计划', width: '220px' },
          { key: 'cost', label: '花费', align: 'right' },
          { key: 'revenue', label: '销售额', align: 'right' },
          { key: 'roi', label: 'ROI', align: 'right', format: (v: any) => (v ?? 0).toFixed(2) },
          { key: 'orders', label: '订单', align: 'right' },
          { key: 'views', label: '观看', align: 'right' },
          { key: 'follows', label: '涨粉', align: 'right' },
          { key: 'costPerOrder', label: '单均花费', align: 'right', defaultHidden: true },
        ] as ColumnDef[]}
      />

      {/* 直播间投效排行 */}
      {data.byLive.length > 0 && (
        <SortableTable
          title="直播间广告投效排行"
          data={data.byLive}
          columns={[
            { key: 'liveName', label: '直播名称', width: '200px' },
            { key: 'cost', label: '花费', align: 'right' },
            { key: 'revenue', label: '广告GMV', align: 'right' },
            { key: 'roi', label: 'ROI', align: 'right', format: (v: any) => (v ?? 0).toFixed(2) },
            { key: 'orders', label: '订单', align: 'right' },
            { key: 'views', label: '观看', align: 'right' },
          ] as ColumnDef[]}
        />
      )}

      {/* 广告状态分布 */}
      {data.byStatus.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">广告计划状态分布</h4>
          <ReactECharts option={{
            tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
            legend: { bottom: 0 },
            series: [{
              type: 'pie', radius: ['40%', '70%'], padAngle: 3,
              itemStyle: { borderRadius: 6 },
              label: { show: true, formatter: '{b}\n{d}%' },
              data: data.byStatus.map((s: any) => ({
                name: s.status || '未知', value: s.cost,
              })),
            }],
          }} style={{ height: 300 }} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 4: 商品雷达
// ═══════════════════════════════════════════════════════════════════════
function ProductsTab({ storeId, dateFrom, dateTo, onRequestUpload }: Props) {
  const cwTo = dateTo || undefined
  const cwFrom = (() => {
    if (!dateFrom || !dateTo) return undefined
    const span = Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000)
    const half = Math.max(1, Math.floor(span / 2))
    const d = new Date(dateTo); d.setDate(d.getDate() - half)
    return d.toISOString().slice(0, 10)
  })()
  const pwTo = (() => {
    if (!cwFrom) return undefined
    const d = new Date(cwFrom); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const pwFrom = dateFrom || undefined
  const { data, isLoading } = useProductRadar(storeId, cwFrom, cwTo, pwFrom, pwTo)
  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>

  const noData = !data || (data.rising.length === 0 && data.falling.length === 0 && data.all.length === 0)
  if (noData) {
    return (
      <div className="card text-center py-16">
        <ShoppingBag className="w-16 h-16 text-violet-200 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-800 mb-2">商品雷达需要产品数据支持</h3>
        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">需要至少<strong>两个</strong>独立时间段的产品数据进行对比，请上传产品数据。</p>
        {onRequestUpload && (
          <button onClick={onRequestUpload} className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm mx-auto">
            <Upload className="w-5 h-5" /> 上传产品数据
          </button>
        )}
      </div>
    )
  }

  const { rising, falling, period } = data
  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 inline-block">
        对比周期：本期 {period.current.from} ~ {period.current.to} vs 上期 {period.previous.from} ~ {period.previous.to}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card border-l-4 border-l-emerald-500">
          <h4 className="text-sm font-semibold text-emerald-700 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> GMV 突涨 Top 10</h4>
          {rising.length === 0 ? <p className="text-sm text-slate-400">暂无异动数据</p> : (
            <div className="space-y-3">{rising.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{p.productName}</p>
                  <p className="text-xs text-slate-500">GMV {fmt(p.currentGmv)} · 订单 {fmt(p.currentOrders)}</p></div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">{pctBadge(p.gmvChange)}
                  <div className="text-right"><div className="text-[10px] text-slate-400">曝光 {pctBadge(p.viewsChange)}</div>
                    <div className="text-[10px] text-slate-400">加购 {pctBadge(p.cartsChange)}</div></div>
                </div>
              </div>
            ))}</div>
          )}
        </div>
        <div className="card border-l-4 border-l-red-500">
          <h4 className="text-sm font-semibold text-red-700 mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> GMV 突跌 Top 10 <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></h4>
          {falling.length === 0 ? <p className="text-sm text-slate-400">暂无异动数据</p> : (
            <div className="space-y-3">{falling.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 truncate">{p.productName}</p>
                  <p className="text-xs text-slate-500">GMV {fmt(p.currentGmv)} · 订单 {fmt(p.currentOrders)}</p></div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">{pctBadge(p.gmvChange)}
                  <div className="text-right"><div className="text-[10px] text-slate-400">曝光 {pctBadge(p.viewsChange)}</div>
                    <div className="text-[10px] text-slate-400">点击 {pctBadge(p.clicksChange)}</div></div>
                </div>
              </div>
            ))}</div>
          )}
        </div>
      </div>

      {/* 全量商品列表 */}
      {data.all && data.all.length > 0 && (
        <SortableTable
          title={`全量商品数据 (${data.all.length} 个)`}
          data={data.all}
          columns={[
            { key: 'productName', label: '商品名称', width: '220px' },
            { key: 'currentGmv', label: '本期GMV', align: 'right' },
            { key: 'currentOrders', label: '本期订单', align: 'right' },
            { key: 'gmvChange', label: 'GMV变化%', align: 'right', format: (v: any) => v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%` : 'N/A' },
            { key: 'ordersChange', label: '订单变化%', align: 'right', format: (v: any) => v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%` : 'N/A', defaultHidden: true },
            { key: 'prevGmv', label: '上期GMV', align: 'right', defaultHidden: true },
            { key: 'prevOrders', label: '上期订单', align: 'right', defaultHidden: true },
          ] as ColumnDef[]}
          maxRows={100}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 5: 期间对比（仅在 compareMode 开启时显示）
// ═══════════════════════════════════════════════════════════════════════
function CompareTab({ storeId, dateFrom, dateTo, compareDateFrom, compareDateTo }: Props) {
  // 用 product-radar 作为数据源（已包含 prev 绝对值）
  // currentWeek = [compareDateFrom, compareDateTo], prevWeek 不传 → 用 dateFrom/dateTo 作为"本期"
  // 注意：雷达接口 currentWeek 是"最新的那期"，这里我们用全局 dateFrom~dateTo 作为当期
  const { data, isLoading } = useProductRadar(storeId, dateFrom, dateTo, compareDateFrom, compareDateTo)

  if (!compareDateFrom || !compareDateTo) {
    return (
      <div className="card text-center py-16">
        <GitCompare className="w-16 h-16 text-fuchsia-200 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-800 mb-2">请先开启期间对比模式</h3>
        <p className="text-sm text-slate-500">在顶部日期栏选择时段后，点击「对比」按钮开启。</p>
      </div>
    )
  }

  if (isLoading) return <div className="py-12 text-center text-slate-500">加载对比数据中...</div>

  if (!data || data.all.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-slate-500">当前时段暂无可对比的商品数据，请先导入产品概览文件。</p>
      </div>
    )
  }

  return (
    <PeriodCompareTable
      rows={data.all}
      currentPeriod={{ from: dateFrom || '', to: dateTo || '' }}
      comparePeriod={{ from: compareDateFrom, to: compareDateTo }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TAB 6: 视频引流
// ═══════════════════════════════════════════════════════════════════════
function VideoTab({ storeId, dateFrom, dateTo, onRequestUpload }: Props) {
  const { data, isLoading } = useVideoPerformance(storeId, dateFrom, dateTo)

  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>

  if (!data || data.summary.totalVideos === 0) {
    return (
      <div className="card text-center py-16">
        <Video className="w-16 h-16 text-pink-200 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-800 mb-2">暂无短视频数据</h3>
        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">请先上传「视频数据明细」Excel 文件。</p>
        {onRequestUpload && (
          <button onClick={onRequestUpload} className="flex items-center gap-2 px-6 py-3 bg-pink-600 text-white font-medium rounded-xl hover:bg-pink-700 transition-colors shadow-sm mx-auto">
            <Upload className="w-5 h-5" /> 上传视频数据
          </button>
        )}
      </div>
    )
  }

  const s = data.summary
  const trend = data.dailyTrend

  const kpis = [
    { label: '视频总VV', value: s.totalVV, sub: `${s.totalVideos} 个视频`, g: 'from-pink-50 to-pink-100', b: 'border-pink-200', t: 'text-pink-900', l: 'text-pink-600' },
    { label: '视频GMV', value: s.totalGmv, sub: `${fmt(s.totalOrders)} 订单`, g: 'from-emerald-50 to-emerald-100', b: 'border-emerald-200', t: 'text-emerald-900', l: 'text-emerald-600' },
    { label: '平均GPM', value: s.avgGPM, sub: '每千次观看GMV', g: 'from-blue-50 to-blue-100', b: 'border-blue-200', t: 'text-blue-900', l: 'text-blue-600' },
    { label: '完播率', value: s.avgFinishRate, sub: '%', g: 'from-violet-50 to-violet-100', b: 'border-violet-200', t: 'text-violet-900', l: 'text-violet-600' },
    { label: '商品CTR', value: s.avgCTR, sub: '%', g: 'from-amber-50 to-amber-100', b: 'border-amber-200', t: 'text-amber-900', l: 'text-amber-600' },
    { label: '跳转直播', value: s.totalVtoLClicks, sub: `率 ${s.avgVtoLRate.toFixed(2)}%`, g: 'from-indigo-50 to-indigo-100', b: 'border-indigo-200', t: 'text-indigo-900', l: 'text-indigo-600' },
  ]

  // 转化漏斗数据
  const funnelSteps = [
    { label: '视频观看', value: s.totalVV, color: '#ec4899' },
    { label: '商品曝光', value: s.totalImpressions, color: '#f59e0b' },
    { label: '商品点击', value: s.totalClicks, color: '#3b82f6' },
    { label: '下单', value: s.totalOrders, color: '#10b981' },
  ].filter(st => st.value > 0)

  return (
    <div className="space-y-6">
      {/* KPI 行 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} sub={k.sub}
            gradient={k.g} border={k.b} textColor={k.t} labelColor={k.l} />
        ))}
      </div>

      {/* 转化漏斗 */}
      {funnelSteps.length > 1 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">视频引流转化漏斗</h4>
          <div className="flex items-end gap-1 h-36">
            {funnelSteps.map((step, i) => {
              const maxVal = funnelSteps[0].value
              const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0
              const convRate = i > 0 && funnelSteps[i - 1].value > 0
                ? ((step.value / funnelSteps[i - 1].value) * 100).toFixed(1)
                : null
              return (
                <div key={step.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-slate-700">{fmt(step.value)}</span>
                  {convRate && <span className="text-[10px] text-slate-400">{convRate}%↓</span>}
                  <div
                    className="w-full rounded-t-lg transition-all"
                    style={{ height: `${Math.max(pct, 8)}%`, backgroundColor: step.color, opacity: 0.85 }}
                  />
                  <span className="text-[10px] text-slate-500 text-center leading-tight mt-1">{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 日趋势双轴图 */}
      {trend.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">日趋势：VV 与 GMV</h4>
          <ReactECharts option={{
            tooltip: { trigger: 'axis' },
            legend: { data: ['VV', 'GMV'], bottom: 0 },
            grid: { left: 60, right: 60, bottom: 40, top: 20 },
            xAxis: { type: 'category', data: trend.map(t => t.date) },
            yAxis: [
              { type: 'value', name: 'VV', position: 'left' },
              { type: 'value', name: 'GMV', position: 'right' },
            ],
            series: [
              { name: 'VV', type: 'bar', data: trend.map(t => t.vv), itemStyle: { color: '#ec4899', borderRadius: [4, 4, 0, 0] } },
              { name: 'GMV', type: 'line', yAxisIndex: 1, data: trend.map(t => t.gmv), smooth: true, itemStyle: { color: '#10b981' }, lineStyle: { width: 2 } },
            ]
          }} style={{ height: 320 }} />
        </div>
      )}

      {/* 视频排行表 */}
      <SortableTable
        title={`视频表现排行 (${data.topVideos.length} 个)`}
        data={data.topVideos}
        columns={[
          { key: 'videoInfo', label: '视频标题', width: '200px' },
          { key: 'creatorName', label: '创作者', width: '100px' },
          { key: 'publishedAt', label: '发布时间', width: '100px', format: (v: any) => v ? String(v).slice(0, 10) : '-' },
          { key: 'videoViews', label: 'VV', align: 'right' },
          { key: 'grossRevenue', label: 'GMV', align: 'right' },
          { key: 'gpm', label: 'GPM', align: 'right', format: (v: any) => (v ?? 0).toFixed(1) },
          { key: 'orders', label: '订单', align: 'right' },
          { key: 'ctr', label: 'CTR%', align: 'right', format: (v: any) => (v ?? 0).toFixed(2) + '%' },
          { key: 'videoFinishRate', label: '完播率%', align: 'right', format: (v: any) => (v ?? 0).toFixed(1) + '%', defaultHidden: true },
          { key: 'videoToLiveClicks', label: '跳转直播', align: 'right', defaultHidden: true },
          { key: 'clickToOrderRate', label: '点击转化%', align: 'right', format: (v: any) => (v ?? 0).toFixed(2) + '%', defaultHidden: true },
          { key: 'newFollowers', label: '新粉丝', align: 'right', defaultHidden: true },
          { key: 'likes', label: '点赞', align: 'right', defaultHidden: true },
          { key: 'products', label: '关联商品', width: '120px', defaultHidden: true },
        ] as ColumnDef[]}
        maxRows={50}
      />
    </div>
  )
}
