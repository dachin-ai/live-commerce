import { useState, useMemo } from 'react'
import { Filter, Table2, ArrowRightLeft, Target, Search, Download } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import {
  useCrossAnalysis,
  useProductEnriched,
  TtTable,
  TABLE_LABELS,
  TABLE_FIELDS,
  runQuery,
  QueryConfig
} from '../services/ttAnalytics'
import CustomSelect from './CustomSelect'

interface Props {
  storeId: string
  dateFrom?: string
  dateTo?: string
}

/**
 * CSV 注入防御：若单元格内容以公式触发字符开头（=, +, -, @, TAB, CR），
 * 在前面加单引号强制 Excel/WPS 将其识别为文本而非公式，防止 Formula Injection RCE。
 */
function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}` // 前置单引号，Excel 会忽略单引号但阻止公式执行
  }
  return value
}

function exportToCsv(filename: string, rows: any[], columns: { key: string; label: string }[]) {
  if (!rows || !rows.length) return
  const headers = columns.map(c => `"${sanitizeCsvCell(c.label)}"`).join(',')
  const csvData = rows.map(row =>
    columns.map(c => {
      let val = row[c.key]
      if (val === null || val === undefined) val = ''
      const strVal = String(val).replace(/"/g, '""') // 转义双引号
      return `"${sanitizeCsvCell(strVal)}"`
    }).join(',')
  ).join('\n')

  const blob = new Blob(['\uFEFF' + headers + '\n' + csvData], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0,10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href) // 释放内存，防止内存泄漏
}


export default function TtDataExplorer({ storeId, dateFrom, dateTo }: Props) {
  const [activeView, setActiveView] = useState<'cross' | 'funnel' | 'custom'>('cross')

  return (
    <div className="space-y-6">
      {/* 视图切换器 */}
      <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveView('cross')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'cross' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          跨表分析 (广告 vs 有机)
        </button>
        <button
          onClick={() => setActiveView('funnel')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'funnel' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Target className="w-4 h-4" />
          增强产品漏斗
        </button>
        <button
          onClick={() => setActiveView('custom')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'custom' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Filter className="w-4 h-4" />
          查询构建器
        </button>
      </div>

      {activeView === 'cross' && <CrossAnalysisView storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} />}
      {activeView === 'funnel' && <ProductFunnelView storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} />}
      {activeView === 'custom' && <CustomQueryView storeId={storeId} dateFrom={dateFrom} dateTo={dateTo} />}
    </div>
  )
}

// ─── 1. Cross Analysis View ─────────────────────────────────────────────

function CrossAnalysisView({ storeId, dateFrom, dateTo }: Props) {
  const { data, isLoading } = useCrossAnalysis(storeId, dateFrom, dateTo)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('organicRevenue')
  const [sortDesc, setSortDesc] = useState(true)

  const filteredData = useMemo(() => {
    if (!data) return []
    let arr = [...data]
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter((d: any) => d.liveName?.toLowerCase().includes(q))
    }
    arr.sort((a, b) => {
      const va = Number(a[sortField] || 0)
      const vb = Number(b[sortField] || 0)
      return sortDesc ? vb - va : va - vb
    })
    return arr
  }, [data, search, sortField, sortDesc])

  const handleSort = (field: string) => {
    if (sortField === field) setSortDesc(!sortDesc)
    else { setSortField(field); setSortDesc(true) }
  }

  const exportData = () => {
    exportToCsv('Cross_Analysis', filteredData, [
      { key: 'liveName', label: '直播场次' },
      { key: 'organicRevenue', label: '自然GMV' },
      { key: 'organicViews', label: '自然观看' },
      { key: 'adCost', label: '广告花费' },
      { key: 'adRevenue', label: '广告GMV' },
      { key: 'adRoi', label: '广告ROI' }
    ])
  }

  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>
  if (!data || data.length === 0) return <div className="py-12 text-center text-slate-500">该时段暂无匹配数据</div>

  return (
    <div className="space-y-4">
      <div className="card">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">自然流量与广告效益对比</h4>
        <ReactECharts 
          option={{
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { data: ['自然GMV', '广告花费', '广告GMV'], bottom: 0 },
            grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
            xAxis: { type: 'value' },
            yAxis: { type: 'category', data: filteredData.slice(0, 30).map((d: any) => d.liveName).reverse(), axisLabel: { width: 100, overflow: 'truncate' } },
            series: [
              { name: '自然GMV', type: 'bar', stack: 'total', itemStyle: { color: '#3b82f6' }, data: filteredData.slice(0, 30).map((d: any) => d.organicRevenue).reverse() },
              { name: '广告GMV', type: 'bar', stack: 'total', itemStyle: { color: '#10b981' }, data: filteredData.slice(0, 30).map((d: any) => d.adRevenue).reverse() },
              { name: '广告花费', type: 'bar', itemStyle: { color: '#f59e0b' }, data: filteredData.slice(0, 30).map((d: any) => -d.adCost).reverse() }
            ]
          }} 
          style={{ height: filteredData.length > 15 ? 600 : 400 }} 
        />
      </div>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索直播间名称..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={exportData} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> 导出 CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 rounded-t-lg">
              <tr>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('liveName')}>直播场次</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100" onClick={() => handleSort('organicRevenue')}>自然GMV {sortField==='organicRevenue' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100" onClick={() => handleSort('organicViews')}>自然观看 {sortField==='organicViews' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100" onClick={() => handleSort('adCost')}>广告花费 {sortField==='adCost' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100" onClick={() => handleSort('adRevenue')}>广告GMV {sortField==='adRevenue' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100" onClick={() => handleSort('adRoi')}>广告ROI {sortField==='adRoi' && (sortDesc ? '↓' : '↑')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 w-64 truncate" title={row.liveName}>{row.liveName}</td>
                  <td className="px-4 py-3">{Number(row.organicRevenue || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">{Number(row.organicViews || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-amber-600">{Number(row.adCost || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-emerald-600">{Number(row.adRevenue || 0).toLocaleString()}</td>
                  <td className={`px-4 py-3 font-medium ${row.adRoi > 2 ? 'text-emerald-600' : row.adRoi < 1 && row.adRoi > 0 ? 'text-red-500' : ''}`}>
                    {Number(row.adRoi || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── 2. Product Funnel View ─────────────────────────────────────────────

function ProductFunnelView({ storeId, dateFrom, dateTo }: Props) {
  const { data, isLoading } = useProductEnriched(storeId, dateFrom, dateTo)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('bestGmv')
  const [sortDesc, setSortDesc] = useState(true)

  const filteredData = useMemo(() => {
    if (!data) return []
    let arr = [...data]
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter((d: any) => d.productName?.toLowerCase().includes(q))
    }
    arr.sort((a, b) => {
      const va = Number(a[sortField] || 0)
      const vb = Number(b[sortField] || 0)
      return sortDesc ? vb - va : va - vb
    })
    return arr
  }, [data, search, sortField, sortDesc])

  const handleSort = (field: string) => {
    if (sortField === field) setSortDesc(!sortDesc)
    else { setSortField(field); setSortDesc(true) }
  }

  const exportData = () => {
    exportToCsv('Enhanced_Products', filteredData, [
      { key: 'productName', label: '产品名称' },
      { key: 'views', label: '浏览' },
      { key: 'clicks', label: '点击' },
      { key: 'skuOrders', label: '订单' },
      { key: 'bestGmv', label: '最高GMV' },
      { key: 'commissionRate', label: '佣金率(%)' }
    ])
  }

  if (isLoading) return <div className="py-12 text-center text-slate-500">加载中...</div>
  if (!data || data.length === 0) return <div className="py-12 text-center text-slate-500">该时段暂无匹配数据</div>

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索产品名称..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={exportData} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> 导出 CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-500 whitespace-nowrap">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 rounded-t-lg">
              <tr>
                <th className="px-4 py-3">产品名称</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('views')}>浏览 {sortField==='views' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('clicks')}>点击 {sortField==='clicks' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('addToCartUsers')}>加购 {sortField==='addToCartUsers' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('skuOrders')}>订单 {sortField==='skuOrders' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('bestGmv')}>综合GMV {sortField==='bestGmv' && (sortDesc ? '↓' : '↑')}</th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('commissionRate')}>佣金率% {sortField==='commissionRate' && (sortDesc ? '↓' : '↑')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row: any, i: number) => {
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-xs truncate" title={row.productName}>{row.productName}</td>
                    <td className="px-4 py-3">{Number(row.views || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">{Number(row.clicks || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">{Number(row.addToCartUsers || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">{Number(row.skuOrders || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{Number(row.bestGmv || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {row.commissionRate > 0 ? (
                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">
                          {row.commissionRate}%
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── 3. Custom Query View ───────────────────────────────────────────────

function CustomQueryView({ storeId, dateFrom, dateTo }: Props) {
  const [table, setTable] = useState<TtTable>('tt_live_sessions')
  const [groupBy, setGroupBy] = useState<string>('')
  const [aggregates, setAggregates] = useState<{fn: string, field: string}[]>([
    { fn: 'SUM', field: 'grossRevenue' }
  ])
  
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleQuery = async () => {
    setLoading(true)
    setError('')
    try {
      const config: QueryConfig = {
        table,
        storeId,
        dateFrom,
        dateTo,
        select: [],
        groupBy: groupBy ? [groupBy] : undefined,
        aggregates: aggregates.map(a => ({ fn: a.fn, field: a.field, alias: `${a.fn}_${a.field}` })),
        limit: 100
      }
      if (groupBy) config.select.push(groupBy)
      
      const res = await runQuery(config)
      setData(res.rows)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const tableOptions = Object.entries(TABLE_LABELS).map(([v, l]) => ({ value: v, label: l }))
  const fieldOptions = TABLE_FIELDS[table]
  const numFields = fieldOptions.filter(f => f.type === 'number')
  const txtFields = fieldOptions.filter(f => f.type === 'text')

  return (
    <div className="space-y-4">
      <div className="card bg-slate-50 border border-slate-200">
        <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          强大的多维查询构建器
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">1. 选择数据源</label>
            <CustomSelect options={tableOptions} value={table} onChange={(v) => { setTable(v as TtTable); setGroupBy('') }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">2. 划分维度 (Group By) - 可选</label>
            <CustomSelect 
              options={[{value: '', label: '不分组 (显示原始明细)'}, ...txtFields.map(f => ({value: f.field, label: f.label}))]} 
              value={groupBy} onChange={(v) => setGroupBy(v)} 
            />
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-500 mb-2">3. 提取度量指标 (Select / Aggregates)</label>
          <div className="flex flex-wrap gap-2">
            {numFields.map(f => {
              const isSelected = aggregates.some(a => a.field === f.field)
              return (
                <button
                  key={f.field}
                  onClick={() => {
                    if (isSelected) setAggregates(aggregates.filter(a => a.field !== f.field))
                    else setAggregates([...aggregates, { fn: groupBy ? 'SUM' : 'AVG', field: f.field }])
                  }}
                  className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors flex items-center gap-1 ${
                    isSelected ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'
                  }`}
                >
                  {f.label}
                  {isSelected && groupBy && <span className="bg-white/20 px-1 rounded text-[10px]">SUM</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleQuery}
            disabled={loading || aggregates.length === 0}
            className="px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {loading ? '正在分析...' : '运行查询生成图表'}
          </button>
          {error && <span className="ml-4 text-sm text-red-500">{error}</span>}
        </div>
      </div>

      {data.length > 0 && (
        <div className="space-y-4">
          {/* Chart Rendering */}
          {groupBy && aggregates.length > 0 && (
            <div className="card">
              <ReactECharts 
                option={{
                  tooltip: { trigger: 'axis' },
                  xAxis: { type: 'category', data: data.map(d => d[groupBy]).slice(0, 20), axisLabel: { width: 80, overflow: 'truncate' } },
                  yAxis: { type: 'value' },
                  series: aggregates.map(agg => ({
                    name: fieldOptions.find(f => f.field === agg.field)?.label,
                    type: 'bar',
                    data: data.map(d => d[`${agg.fn}_${agg.field}`]).slice(0, 20)
                  }))
                }}
                style={{ height: 350 }}
              />
            </div>
          )}

          {/* Table Rendering */}
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Table2 className="w-4 h-4" />
                查询结果表格 ({data.length} 条)
              </h4>
              <button 
                onClick={() => exportToCsv('Custom_Query', data, Object.keys(data[0]).map(k => ({key: k, label: k})))}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors"
              >
                下载报表
              </button>
            </div>
            <table className="w-full text-sm text-left text-slate-500">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50 rounded-t-lg">
                <tr>
                  {Object.keys(data[0]).map(k => (
                    <th key={k} className="px-4 py-3">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                     {Object.entries(row).map(([k, val]) => {
                      const isNum = typeof val === 'number'
                      return (
                        <td key={k} className={`px-4 py-3 ${isNum ? 'font-mono' : 'truncate max-w-[200px]'}`} title={String(val)}>
                          {isNum ? Number(val).toLocaleString() : String(val || '-')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
