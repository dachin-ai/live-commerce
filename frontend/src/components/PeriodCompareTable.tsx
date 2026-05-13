import { useState } from 'react'
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Download } from 'lucide-react'

interface ProductRow {
  productId: string
  productName: string
  currentGmv: number; prevGmv: number
  currentOrders: number; prevOrders: number
  currentViews: number; prevViews: number
  currentClicks: number; prevClicks: number
  currentCarts: number; prevCarts: number
  gmvChange: number | null
  ordersChange: number | null
  viewsChange: number | null
  clicksChange: number | null
  cartsChange: number | null
}

interface Props {
  rows: ProductRow[]
  currentPeriod: { from: string; to: string }
  comparePeriod: { from: string; to: string }
}

type SortKey = 'gmvChange' | 'currentGmv' | 'ordersChange' | 'currentOrders'
type SortDir = 'asc' | 'desc'

function fmt(n: number | undefined | null): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function Delta({ val }: { val: number | null }) {
  if (val === null) return <span className="text-slate-300 text-[10px]">—</span>
  const up = val >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
    }`}>
      {up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{val.toFixed(1)}%
    </span>
  )
}

function MetricPair({ cur, prev, delta }: { cur: number; prev: number; delta: number | null }) {
  return (
    <td className="px-2 py-2 text-right align-top">
      <div className="text-xs font-semibold text-slate-800">{fmt(cur)}</div>
      <div className="text-[10px] text-slate-400">{fmt(prev)}</div>
      <div className="mt-0.5"><Delta val={delta} /></div>
    </td>
  )
}

export default function PeriodCompareTable({ rows, currentPeriod, comparePeriod }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('gmvChange')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = rows
    .filter(r => !search || r.productName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const va = a[sortKey] ?? -Infinity
      const vb = b[sortKey] ?? -Infinity
      return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number)
    })

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="px-2 py-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )

  // CSV 导出
  const handleExport = () => {
    // RFC 4180 转义 + Formula Injection 防御
    const escapeCsv = (v: any): string => {
      const s = String(v ?? '')
      // 防公式注入：以触发字符开头的内容前置单引号
      const sanitized = /^[=+\-@\t\r]/.test(s) ? "'" + s : s
      // RFC 4180：内部双引号转义为 ""，整体用双引号包裹
      return `"${sanitized.replace(/"/g, '""')}"`
    }

    const header = ['商品名', '当期GMV', '对比GMV', 'ΔGMV%', '当期订单', '对比订单', 'Δ订单%', '当期曝光', '对比曝光', 'Δ曝光%', '当期点击', '对比点击', 'Δ点击%']
    const csvRows = filtered.map(r => [
      escapeCsv(r.productName),
      r.currentGmv, r.prevGmv, r.gmvChange ?? '',
      r.currentOrders, r.prevOrders, r.ordersChange ?? '',
      r.currentViews, r.prevViews, r.viewsChange ?? '',
      r.currentClicks, r.prevClicks, r.clicksChange ?? '',
    ])
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `期间对比_${currentPeriod.from}_vs_${comparePeriod.from}.csv`
    a.click()
    URL.revokeObjectURL(url)  // 立即释放 Blob URL，防止内存泄漏
  }


  const rising = filtered.filter(r => (r.gmvChange ?? 0) > 0).length
  const falling = filtered.filter(r => (r.gmvChange ?? 0) < 0).length

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">当期 <span className="text-blue-600">{currentPeriod.from} ~ {currentPeriod.to}</span></p>
            <p className="text-xs text-slate-500 mt-0.5">vs 对比期 <span className="text-violet-600">{comparePeriod.from} ~ {comparePeriod.to}</span></p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <TrendingUp className="w-3.5 h-3.5" /> 突涨 {rising}
            </span>
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <TrendingDown className="w-3.5 h-3.5" /> 突跌 {falling}
            </span>
            <span className="text-slate-400">共 {filtered.length} 件</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text" placeholder="搜索商品名…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-blue-300 w-40"
          />
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> 导出 CSV
          </button>
        </div>
      </div>

      {/* 图例说明 */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400">
        <span>每格显示：<span className="font-semibold text-slate-600">当期值</span> / <span className="text-slate-400">对比期值</span> / <span className="text-emerald-600">Δ%</span></span>
        <span>点击表头排序</span>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-left min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50 min-w-[180px]">商品名称</th>
              <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-center" colSpan={1}>
                <div className="flex flex-col items-end">
                  <span className="text-blue-500">GMV</span>
                  <SortTh label="当期↕" k="currentGmv" />
                </div>
              </th>
              <SortTh label="ΔGMV%" k="gmvChange" />
              <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right">
                <div className="flex flex-col items-end">
                  <span className="text-indigo-500">订单</span>
                  <SortTh label="当期↕" k="currentOrders" />
                </div>
              </th>
              <SortTh label="Δ订单%" k="ordersChange" />
              <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right whitespace-nowrap">曝光</th>
              <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right whitespace-nowrap">点击</th>
              <th className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase text-right whitespace-nowrap">加购</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">暂无数据</td></tr>
            ) : filtered.map((r, i) => {
              const gmvDir = (r.gmvChange ?? 0) >= 0
              return (
                <tr key={r.productId ?? i} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                }`}>
                  {/* 商品名 */}
                  <td className="px-3 py-2 sticky left-0 bg-inherit">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${gmvDir ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <p className="text-xs font-medium text-slate-800 line-clamp-2 max-w-[160px]" title={r.productName}>
                        {r.productName || '未知商品'}
                      </p>
                    </div>
                  </td>
                  {/* GMV */}
                  <MetricPair cur={r.currentGmv} prev={r.prevGmv} delta={null} />
                  <td className="px-2 py-2 text-right align-middle">
                    <Delta val={r.gmvChange} />
                  </td>
                  {/* 订单 */}
                  <MetricPair cur={r.currentOrders} prev={r.prevOrders} delta={null} />
                  <td className="px-2 py-2 text-right align-middle">
                    <Delta val={r.ordersChange} />
                  </td>
                  {/* 曝光 */}
                  <MetricPair cur={r.currentViews} prev={r.prevViews} delta={r.viewsChange} />
                  {/* 点击 */}
                  <MetricPair cur={r.currentClicks} prev={r.prevClicks} delta={r.clicksChange} />
                  {/* 加购 */}
                  <MetricPair cur={r.currentCarts} prev={r.prevCarts} delta={r.cartsChange} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
