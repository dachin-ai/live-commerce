import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function padYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface WeekRow {
  from: string
  to: string
  days: { date: Date; inMonth: boolean }[]
  isCurrentWeek: boolean
}

function buildWeeks(year: number, month: number): WeekRow[] {
  const today = new Date()
  const todayDow = today.getDay()
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - (todayDow === 0 ? 6 : todayDow - 1))
  const thisMondayStr = padYMD(thisMonday)

  const lastDay = new Date(year, month + 1, 0)
  const start = new Date(year, month, 1)
  const startDow = start.getDay()
  start.setDate(start.getDate() - (startDow === 0 ? 6 : startDow - 1))

  const rows: WeekRow[] = []
  const cur = new Date(start)

  while (cur <= lastDay || rows.length < 4) {
    const weekStart = new Date(cur)
    const days: { date: Date; inMonth: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      days.push({ date: new Date(cur), inMonth: cur.getMonth() === month })
      cur.setDate(cur.getDate() + 1)
    }
    const weekEnd = new Date(cur); weekEnd.setDate(cur.getDate() - 1)
    rows.push({
      from: padYMD(weekStart),
      to: padYMD(weekEnd),
      days,
      isCurrentWeek: padYMD(weekStart) === thisMondayStr,
    })
    if (cur > lastDay && rows.length >= 4) break
    if (rows.length > 10) break
  }
  return rows
}

interface Props {
  onSelect: (from: string, to: string) => void
  onClose: () => void
}

export default function WeekPicker({ onSelect, onClose }: Props) {
  const today = new Date()
  const [vy, setVy] = useState(today.getFullYear())
  const [vm, setVm] = useState(today.getMonth())
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const weeks = buildWeeks(vy, vm)
  const todayStr = padYMD(today)

  const prev = () => { if (vm === 0) { setVm(11); setVy(y => y - 1) } else setVm(m => m - 1) }
  const next = () => { if (vm === 11) { setVm(0); setVy(y => y + 1) } else setVm(m => m + 1) }

  return (
    <div className="absolute top-full mt-1 left-0 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-72 select-none">
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <span className="text-sm font-semibold text-slate-700">{vy}年{vm + 1}月</span>
        <button onClick={next} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 text-center mb-1">
        {['一','二','三','四','五','六','日'].map(d => (
          <div key={d} className="text-[10px] font-medium text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* 周行 */}
      <div className="space-y-0.5">
        {weeks.map((wk, i) => (
          <div
            key={i}
            className={`grid grid-cols-7 rounded-lg cursor-pointer transition-colors ${
              hoverIdx === i ? 'bg-blue-100 ring-1 ring-blue-300' :
              wk.isCurrentWeek ? 'bg-slate-50 ring-1 ring-slate-200' : 'hover:bg-slate-50'
            }`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => { onSelect(wk.from, wk.to); onClose() }}
          >
            {wk.days.map((d, j) => {
              const ds = padYMD(d.date)
              const isToday = ds === todayStr
              const isFuture = d.date > today && ds !== todayStr
              return (
                <div key={j} className={`text-center text-xs py-1.5 rounded ${
                  isToday ? 'font-bold text-blue-600' :
                  !d.inMonth || isFuture ? 'text-slate-300' :
                  'text-slate-700'
                }`}>
                  {d.date.getDate()}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">点击选择自然周 (周一→周日)</span>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">✕ 关闭</button>
      </div>
    </div>
  )
}
