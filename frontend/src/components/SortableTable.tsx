import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Columns, Search } from 'lucide-react'

export interface ColumnDef<T = any> {
  key: string
  label: string
  format?: (val: any, row: T) => string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  defaultHidden?: boolean
  width?: string
}

interface Props<T = any> {
  columns: ColumnDef<T>[]
  data: T[]
  maxRows?: number
  title?: string
}

function defaultFormat(val: any): string {
  if (val == null) return '-'
  if (typeof val === 'number') {
    if (Number.isNaN(val)) return '-'
    return val.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  }
  return String(val)
}

export default function SortableTable<T extends Record<string, any>>({ columns, data, maxRows = 50, title }: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set(columns.filter(c => c.defaultHidden).map(c => c.key)))
  const [showColPicker, setShowColPicker] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const visibleCols = columns.filter(c => !hiddenCols.has(c.key))

  const filtered = useMemo(() => {
    if (!searchTerm) return data
    const term = searchTerm.toLowerCase()
    return data.filter(row => 
      columns.some(c => {
        const v = row[c.key]
        return v != null && String(v).toLowerCase().includes(term)
      })
    )
  }, [data, searchTerm, columns])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const na = typeof va === 'number' ? va : parseFloat(String(va))
      const nb = typeof vb === 'number' ? vb : parseFloat(String(vb))
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [filtered, sortKey, sortDir])

  const displayed = sorted.slice(0, maxRows)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const toggleCol = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="card overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {title && <h4 className="text-sm font-semibold text-slate-700">{title}</h4>}
        <div className="flex items-center gap-2 ml-auto">
          {/* 搜索 */}
          <div className="relative">
            <input
              type="text"
              placeholder="搜索..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-40 pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1.5" />
          </div>
          {/* 列选择器 */}
          <div className="relative">
            <button
              onClick={() => setShowColPicker(v => !v)}
              className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Columns className="w-3.5 h-3.5" /> 列
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-[160px] max-h-[320px] overflow-y-auto">
                {columns.map(c => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(c.key)}
                      onChange={() => toggleCol(c.key)}
                      className="w-3 h-3 rounded text-blue-600 border-slate-300"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-slate-600 bg-slate-50 border-b border-slate-200">
            <tr>
              {visibleCols.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-3 py-2.5 select-none transition-colors ${
                    col.sortable !== false ? 'cursor-pointer hover:bg-slate-100' : ''
                  } ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      sortKey === col.key
                        ? (sortDir === 'asc'
                          ? <ChevronUp className="w-3 h-3 text-blue-600" />
                          : <ChevronDown className="w-3 h-3 text-blue-600" />)
                        : <ChevronsUpDown className="w-3 h-3 text-slate-300" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((row, i) => {
              // 优先用稳定 ID，排序变化时 React 可正确复用节点
              const rowKey = row.id ?? row.productId ?? row.campaignName ?? row.name ?? i
              return (
              <tr key={rowKey} className="hover:bg-slate-50/80 transition-colors">
                {visibleCols.map(col => {
                  const val = row[col.key]
                  const formatted = col.format ? col.format(val, row) : defaultFormat(val)
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${typeof val === 'number' ? 'font-medium text-slate-800' : 'text-slate-700'}`}
                      title={String(val ?? '')}
                    >
                      {formatted}
                    </td>
                  )
                })}
              </tr>
              ) // closes return (
            })} // closes arrow fn block + .map() + JSX {}

          </tbody>
        </table>
      </div>

      {sorted.length > maxRows && (
        <div className="text-center text-slate-400 text-xs py-2 mt-2 bg-slate-50 rounded-b-lg">
          显示前 {maxRows} 条，共 {sorted.length} 条
        </div>
      )}
      {sorted.length === 0 && (
        <div className="text-center text-slate-400 text-xs py-8">暂无数据</div>
      )}

      {/* 点击空白关闭列选择器 */}
      {showColPicker && <div className="fixed inset-0 z-40" onClick={() => setShowColPicker(false)} />}
    </div>
  )
}
