import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  BarChart3, LineChart, TrendingUp, Download, Trash2,
  AreaChart, Sigma, GitMerge, Search, LayoutGrid, PieChart, Activity,
  Copy, CheckCircle
} from 'lucide-react'

type ChartType = 'line' | 'bar' | 'area' | 'scatter' | 'quadrant' | 'pie'
type SeriesColor = '#3b82f6' | '#10b981' | '#f59e0b' | '#8b5cf6' | '#ef4444' | '#06b6d4' | '#ec4899' | '#14b8a6'

export interface ChartDataPoint {
  x: string
  y: number
  size?: number       // bubble size dimension (e.g. GMV)
  category?: string   // color grouping (e.g. store name, channel)
}

export interface ChartSeries {
  name: string
  data: ChartDataPoint[]
  type?: ChartType
  color?: SeriesColor
  yAxis?: 0 | 1
  hidden?: boolean
}

export interface ChartPlan {
  title: string
  series: ChartSeries[]
  xAxisLabel?: string
  chartType?: ChartType
  sizeLabel?: string      // label for the size dimension (e.g. "GMV")
  categoryLabel?: string  // label for the category dimension (e.g. "店铺")
}

interface Props {
  initialPlan?: ChartPlan | null
}

const COLORS: SeriesColor[] = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6']
const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1']
const CHART_TYPES: { key: ChartType; label: string; icon: any }[] = [
  { key: 'line', label: '折线', icon: LineChart },
  { key: 'bar', label: '柱状', icon: BarChart3 },
  { key: 'area', label: '面积', icon: AreaChart },
  { key: 'scatter', label: '散点', icon: Activity },
  { key: 'quadrant', label: '四象限', icon: LayoutGrid },
  { key: 'pie', label: '饼图', icon: PieChart },
]

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export default function ChartBuilder({ initialPlan }: Props) {
  const [plan, setPlan] = useState<ChartPlan>(
    initialPlan ?? { title: '自定义图表', series: [], xAxisLabel: '日期', chartType: 'line' }
  )
  const [globalType, setGlobalType] = useState<ChartType>(plan.chartType ?? 'line')
  const [dualAxis, setDualAxis] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [copyToast, setCopyToast] = useState(false)
  const echartsRef = useRef<any>(null)

  useEffect(() => {
    if (initialPlan) {
      setPlan(initialPlan)
      if (initialPlan.chartType) setGlobalType(initialPlan.chartType)
    }
  }, [initialPlan])

  const visibleSeries = plan.series.filter(s => !s.hidden)
  const allXValues = useMemo(() => [...new Set(visibleSeries.flatMap(s => s.data.map(d => d.x)))].sort(), [visibleSeries])

  // Detect if data has multi-dimensional features
  const hasSize = useMemo(() => visibleSeries.some(s => s.data.some(d => d.size != null && d.size > 0)), [visibleSeries])
  const hasCategory = useMemo(() => visibleSeries.some(s => s.data.some(d => d.category != null)), [visibleSeries])
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    visibleSeries.forEach(s => s.data.forEach(d => { if (d.category) cats.add(d.category) }))
    return [...cats]
  }, [visibleSeries])

  // Copy helper
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 2000)
    }).catch(() => {})
  }, [])

  // Echarts click handler for Ctrl/Alt copy
  const handleChartClick = useCallback((params: any) => {
    const evt = params.event?.event
    if (!evt || (!evt.ctrlKey && !evt.altKey && !evt.metaKey)) return

    const d = params.data
    if (!d) return

    let text = ''
    if (Array.isArray(d)) {
      // scatter/quadrant data: [x, y, name, size?, category?]
      const xLabel = plan.series[0]?.name ?? 'X'
      const yLabel = plan.series[1]?.name ?? 'Y'
      text = `【${d[2] ?? '未知'}】\n`
      text += `【${xLabel}】: ${fmt(d[0])}\n`
      text += `【${yLabel}】: ${fmt(d[1])}\n`
      if (d[3] != null) text += `【${plan.sizeLabel ?? '数值'}】: ${fmt(d[3])}\n`
      if (d[4] != null) text += `【${plan.categoryLabel ?? '分类'}】: ${d[4]}\n`
    } else if (typeof d === 'object' && d.name != null) {
      // pie data
      text = `【${d.name}】: ${fmt(d.value)}`
    } else {
      text = `${params.seriesName}: ${fmt(params.value)}`
    }

    copyToClipboard(text)
  }, [plan, copyToClipboard])

  const buildOption = () => {
    if (visibleSeries.length === 0) return null
    const hasDualAxis = dualAxis && visibleSeries.length >= 2 && !['quadrant', 'pie', 'scatter'].includes(globalType)

    // ─── Quadrant / Scatter with multi-dimensional support ───
    if (globalType === 'quadrant' || (globalType === 'scatter' && visibleSeries.length >= 2)) {
      const xSeries = visibleSeries[0]
      const ySeries = visibleSeries[1]
      const dataMap = new Map<string, { x: number; y: number; size: number; category: string }>()

      xSeries.data.forEach(d => {
        dataMap.set(d.x, { x: d.y, y: 0, size: d.size ?? 0, category: d.category ?? '' })
      })
      ySeries.data.forEach(d => {
        if (dataMap.has(d.x)) {
          const existing = dataMap.get(d.x)!
          existing.y = d.y
          if (d.size != null && d.size > 0) existing.size = d.size
          if (d.category) existing.category = d.category
        } else {
          dataMap.set(d.x, { x: 0, y: d.y, size: d.size ?? 0, category: d.category ?? '' })
        }
      })

      // [x, y, name, size, category]
      const scatterData = Array.from(dataMap.entries()).map(([label, val]) => [val.x, val.y, label, val.size, val.category])
      const avgX = scatterData.reduce((sum, d) => sum + (d[0] as number), 0) / (scatterData.length || 1)
      const avgY = scatterData.reduce((sum, d) => sum + (d[1] as number), 0) / (scatterData.length || 1)

      // Size scaling
      const sizes = scatterData.map(d => d[3] as number).filter(s => s > 0)
      const minSize = Math.min(...(sizes.length ? sizes : [0]))
      const maxSize = Math.max(...(sizes.length ? sizes : [1]))
      const sizeRange = maxSize - minSize || 1

      // Category color map
      const catColorMap: Record<string, string> = {}
      allCategories.forEach((cat, i) => { catColorMap[cat] = CATEGORY_COLORS[i % CATEGORY_COLORS.length] })

      // Build series: one per category if categories exist, otherwise single series
      const seriesGroups: Record<string, any[]> = {}
      scatterData.forEach(d => {
        const cat = (d[4] as string) || '全部'
        if (!seriesGroups[cat]) seriesGroups[cat] = []
        seriesGroups[cat].push(d)
      })

      const echartsSeries = Object.entries(seriesGroups).map(([cat, points], i) => ({
        name: cat,
        type: 'scatter' as const,
        data: points,
        symbolSize: hasSize
          ? (d: any) => Math.max(10, Math.min(60, 10 + ((d[3] - minSize) / sizeRange) * 50))
          : globalType === 'quadrant' ? 14 : 10,
        itemStyle: {
          color: hasCategory ? (catColorMap[cat] ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length]) : undefined,
        },
      }))

      return {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item' as const,
          formatter: (p: any) => {
            const d = p.data
            let html = `<b>${d[2]}</b><br/>`
            html += `${xSeries.name}: ${fmt(d[0])}<br/>`
            html += `${ySeries.name}: ${fmt(d[1])}`
            if (d[3] > 0) html += `<br/>${plan.sizeLabel ?? '数值'}: ${fmt(d[3])}`
            if (d[4]) html += `<br/>${plan.categoryLabel ?? '分类'}: ${d[4]}`
            html += `<br/><span style="color:#94a3b8;font-size:11px">Ctrl+点击可复制</span>`
            return html
          }
        },
        legend: hasCategory ? { data: Object.keys(seriesGroups), bottom: 0 } : undefined,
        grid: { left: 60, right: 40, bottom: hasCategory ? 50 : 40, top: 40 },
        xAxis: { type: 'value' as const, name: xSeries.name, nameLocation: 'center' as const, nameGap: 30, scale: true, axisLabel: { formatter: (v: number) => fmt(v) } },
        yAxis: { type: 'value' as const, name: ySeries.name, scale: true, axisLabel: { formatter: (v: number) => fmt(v) } },
        series: [
          ...echartsSeries,
          ...(globalType === 'quadrant' ? [{
            type: 'scatter' as const,
            data: [],
            markLine: {
              silent: true,
              lineStyle: { type: 'dashed' as const, color: '#94a3b8', width: 1 },
              data: [
                { xAxis: avgX, label: { formatter: `Avg ${fmt(avgX)}`, position: 'end' as const, fontSize: 10 } },
                { yAxis: avgY, label: { formatter: `Avg ${fmt(avgY)}`, position: 'end' as const, fontSize: 10 } }
              ]
            }
          }] : [])
        ]
      }
    }

    // ─── Pie ───
    if (globalType === 'pie') {
      return {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, type: 'scroll' as const },
        series: visibleSeries.map((s, i) => ({
          name: s.name,
          type: 'pie' as const,
          radius: [visibleSeries.length > 1 ? `${20 + i * (60 / visibleSeries.length)}%` : '40%', `${80 / visibleSeries.length + i * (60 / visibleSeries.length)}%`],
          data: s.data.slice(0, 15).map(d => ({ name: d.x, value: d.y })),
          itemStyle: { borderRadius: 4 },
          label: { show: i === visibleSeries.length - 1 }
        }))
      }
    }

    // ─── Default Line/Bar/Area ───
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: any[]) =>
          `${params[0]?.name}<br/>` + params.map((p: any) => `${p.marker}${p.seriesName}: ${fmt(p.value)}`).join('<br/>'),
      },
      legend: { data: visibleSeries.map(s => s.name), bottom: 0, type: 'scroll' as const },
      grid: { left: 60, right: hasDualAxis ? 60 : 20, bottom: 50, top: 40 },
      xAxis: { type: 'category' as const, data: allXValues.map(x => x.length > 10 ? x.slice(5) : x) },
      yAxis: hasDualAxis
        ? [
          { type: 'value' as const, name: visibleSeries[0]?.name, position: 'left' as const, axisLabel: { formatter: (v: number) => fmt(v) } },
          { type: 'value' as const, name: visibleSeries[1]?.name, position: 'right' as const, axisLabel: { formatter: (v: number) => fmt(v) }, splitLine: { show: false } },
        ]
        : { type: 'value' as const, axisLabel: { formatter: (v: number) => fmt(v) } },
      series: visibleSeries.map((s, i) => {
        const type = s.type ?? (globalType === 'area' ? 'line' : globalType)
        const color = s.color ?? COLORS[i % COLORS.length]
        const dataMap = new Map(s.data.map(d => [d.x, d.y]))
        return {
          name: s.name,
          type: type === 'area' || globalType === 'area' ? 'line' : type,
          yAxisIndex: hasDualAxis && s.yAxis === 1 ? 1 : 0,
          data: allXValues.map(x => dataMap.get(x) ?? 0),
          smooth: type === 'line' || globalType === 'area' || globalType === 'line',
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color },
          lineStyle: { color, width: 2 },
          areaStyle: (type === 'area' || globalType === 'area') ? { color: color + '30' } : undefined,
          barMaxWidth: 40,
          barBorderRadius: (type === 'bar' || globalType === 'bar') ? [4, 4, 0, 0] : undefined,
        }
      }),
    }
  }

  const option = buildOption()

  // Bindcharts event
  const onChartReady = useCallback((instance: any) => {
    instance.off('click')
    instance.on('click', handleChartClick)
  }, [handleChartClick])

  const handleExport = () => {
    const instance = echartsRef.current?.getEchartsInstance?.()
    if (!instance) return
    const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.title}.png`
    a.click()
  }

  const updateSeriesColor = (idx: number, color: SeriesColor) => setPlan(p => ({ ...p, series: p.series.map((s, i) => i === idx ? { ...s, color } : s) }))
  const removeSeries = (idx: number) => setPlan(p => ({ ...p, series: p.series.filter((_, i) => i !== idx) }))
  const toggleVisibility = (idx: number) => setPlan(p => ({ ...p, series: p.series.map((s, i) => i === idx ? { ...s, hidden: !s.hidden } : s) }))
  const toggleYAxis = (idx: number) => setPlan(p => ({ ...p, series: p.series.map((s, i) => i === idx ? { ...s, yAxis: s.yAxis === 1 ? 0 : 1 } : s) }))

  const filteredSeries = plan.series.map((s, i) => ({ s, i })).filter(({ s }) => s.name.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="space-y-5">
      {/* Copy toast */}
      {copyToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-lg animate-pulse">
          <CheckCircle className="w-4 h-4" /> 数据已复制到剪贴板
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3 card">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <input
            value={plan.title}
            onChange={e => setPlan(p => ({ ...p, title: e.target.value }))}
            className="text-lg font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-blue-500 outline-none px-1 py-0.5"
            placeholder="图表标题..."
          />
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.key}
                onClick={() => setGlobalType(ct.key)}
                title={ct.label}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${globalType === ct.key ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ct.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{ct.label}</span>
              </button>
            ))}
          </div>
          {!['quadrant', 'pie', 'scatter'].includes(globalType) && (
            <button
              onClick={() => setDualAxis(v => !v)}
              title="双Y轴模式"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
                dualAxis ? 'bg-violet-100 text-violet-700 border-violet-300 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-200 hover:bg-slate-50'
              }`}
            >
              <GitMerge className="w-4 h-4" /> 双轴
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
            <Download className="w-4 h-4" /> 导出 PNG
          </button>
        </div>
      </div>

      {/* Multi-dimensional info banner */}
      {(hasSize || hasCategory) && ['quadrant', 'scatter'].includes(globalType) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
          <LayoutGrid className="w-4 h-4 flex-shrink-0" />
          <span>
            多维气泡图模式：
            {hasSize && <span className="font-semibold"> 气泡大小 = {plan.sizeLabel ?? 'GMV'}</span>}
            {hasCategory && <span className="font-semibold"> · 颜色 = {plan.categoryLabel ?? '分类'}</span>}
            <span className="text-indigo-500 ml-2">按住 Ctrl/Alt 点击气泡可复制数据</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* 左侧：搜索式系列配置 */}
        <div className="md:col-span-1 space-y-4">
          <div className="card h-full flex flex-col">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Sigma className="w-4 h-4 text-blue-500" /> 数据系列配置
            </h4>
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="搜索指标..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[400px]">
              {filteredSeries.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">没有匹配的指标</div>
              ) : (
                filteredSeries.map(({ s, i }) => (
                  <div key={i} className={`p-2.5 rounded-lg border transition-all ${s.hidden ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={!s.hidden}
                          onChange={() => toggleVisibility(i)}
                          className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                        />
                        <input
                          value={s.name}
                          onChange={e => setPlan(p => ({ ...p, series: p.series.map((ss, j) => j === i ? { ...ss, name: e.target.value } : ss) }))}
                          className="flex-1 text-sm font-medium text-slate-800 bg-transparent outline-none truncate"
                        />
                      </div>
                      <button onClick={() => removeSeries(i)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors ml-1 flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {!s.hidden && !['quadrant', 'pie'].includes(globalType) && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          {COLORS.slice(0, 5).map(c => (
                            <button key={c} onClick={() => updateSeriesColor(i, c)}
                              className={`w-3.5 h-3.5 rounded-full transition-transform hover:scale-110 ${(s.color ?? COLORS[i % COLORS.length]) === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : ''}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        {dualAxis && (
                          <button onClick={() => toggleYAxis(i)} title="分配到左轴/右轴"
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-all ${
                              s.yAxis === 1 ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                            {s.yAxis === 1 ? '➡ 右轴' : '⬅ 左轴'}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Show data point count & dimension info */}
                    <div className="mt-1.5 text-[10px] text-slate-400">
                      {s.data.length} 个数据点
                      {s.data.some(d => d.size != null) && ' · 含大小维度'}
                      {s.data.some(d => d.category != null) && ' · 含分类'}
                    </div>
                  </div>
                ))
              )}
            </div>
            {plan.series.length === 0 && (
              <div className="text-center py-10 mt-auto">
                <p className="text-slate-400 text-xs">请从其他分析面板，点击"📊 制图"载入数据</p>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：图表 + 数据表 */}
        <div className="md:col-span-3 space-y-5">
          {option ? (
            <div className="card">
              <ReactECharts
                ref={echartsRef}
                option={option}
                style={{ height: 420 }}
                notMerge
                onChartReady={onChartReady}
              />
            </div>
          ) : (
            <div className="card py-24 text-center">
              <LayoutGrid className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">请先选择或载入足够的数据系列</p>
              <p className="text-slate-400 text-xs mt-1">四象限图需要至少 2 个指标（X 与 Y 轴）</p>
            </div>
          )}

          {/* 数据明细 */}
          {visibleSeries.length > 0 && !['quadrant', 'scatter'].includes(globalType) && allXValues.length > 0 && (
            <div className="card overflow-x-auto">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> 数据明细
              </h4>
              <table className="w-full text-xs text-left min-w-[500px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-2.5">X 轴</th>
                    {visibleSeries.map((s, i) => (
                      <th key={i} className="px-4 py-2.5 text-right">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allXValues.slice(-30).map(x => (
                    <tr key={x} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-2 text-slate-600 font-medium">{x.length > 10 ? x.slice(5) : x}</td>
                      {visibleSeries.map((s, i) => {
                        const v = s.data.find(d => d.x === x)?.y ?? 0
                        return <td key={i} className="px-4 py-2 text-right text-slate-800">{fmt(v)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {allXValues.length > 30 && <div className="text-center text-slate-400 text-xs py-2 mt-2 bg-slate-50 rounded">仅显示最新 30 条</div>}
            </div>
          )}

          {/* Scatter/Quadrant data table */}
          {visibleSeries.length >= 2 && ['quadrant', 'scatter'].includes(globalType) && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> 散点数据
                </h4>
                <button
                  onClick={() => {
                    const xS = visibleSeries[0]
                    const yS = visibleSeries[1]
                    const header = `名称\t${xS.name}\t${yS.name}${hasSize ? `\t${plan.sizeLabel ?? '数值'}` : ''}${hasCategory ? `\t${plan.categoryLabel ?? '分类'}` : ''}`
                    const rows = allXValues.map(x => {
                      const xd = xS.data.find(d => d.x === x)
                      const yd = yS.data.find(d => d.x === x)
                      let line = `${x}\t${xd?.y ?? 0}\t${yd?.y ?? 0}`
                      if (hasSize) line += `\t${xd?.size ?? yd?.size ?? 0}`
                      if (hasCategory) line += `\t${xd?.category ?? yd?.category ?? ''}`
                      return line
                    })
                    copyToClipboard([header, ...rows].join('\n'))
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs rounded-lg border border-slate-200 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> 复制全部
                </button>
              </div>
              <table className="w-full text-xs text-left min-w-[400px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-2.5">名称</th>
                    <th className="px-4 py-2.5 text-right">{visibleSeries[0].name}</th>
                    <th className="px-4 py-2.5 text-right">{visibleSeries[1].name}</th>
                    {hasSize && <th className="px-4 py-2.5 text-right">{plan.sizeLabel ?? '数值'}</th>}
                    {hasCategory && <th className="px-4 py-2.5">{plan.categoryLabel ?? '分类'}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allXValues.slice(0, 50).map(x => {
                    const xd = visibleSeries[0].data.find(d => d.x === x)
                    const yd = visibleSeries[1].data.find(d => d.x === x)
                    return (
                      <tr key={x} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-2 font-medium text-slate-800">{x}</td>
                        <td className="px-4 py-2 text-right">{fmt(xd?.y ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{fmt(yd?.y ?? 0)}</td>
                        {hasSize && <td className="px-4 py-2 text-right">{fmt(xd?.size ?? yd?.size ?? 0)}</td>}
                        {hasCategory && <td className="px-4 py-2 text-slate-600">{xd?.category ?? yd?.category ?? ''}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
