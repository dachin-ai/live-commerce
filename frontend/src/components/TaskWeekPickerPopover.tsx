import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { buildMonthCalendarRows, formatLocalYMD, parseYMDLocal, weekdayLabels } from '../utils/calendarLocal'

export { getWeekMondayFromDate, formatLocalYMD } from '../utils/calendarLocal'

function toYMD(d: Date): string {
  return formatLocalYMD(d)
}

export type TaskWeekPickerPopoverProps = {
  weekStart: string
  maxWeekStart: string
  onWeekStartChange: (ymd: string) => void
  onClear?: () => void
  onToday: () => void
  summary: string
  locale?: string
  disabled?: boolean
}

export default function TaskWeekPickerPopover({
  weekStart,
  maxWeekStart,
  onWeekStartChange,
  onClear,
  onToday,
  summary,
  locale = 'zh-CN',
  disabled = false,
}: TaskWeekPickerPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hoverWeek, setHoverWeek] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [viewYear, setViewYear] = useState(() => {
    const d = parseYMDLocal(weekStart)
    return d.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => parseYMDLocal(weekStart).getMonth() + 1)

  useEffect(() => {
    if (!open) return
    const d = parseYMDLocal(weekStart)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth() + 1)
  }, [open, weekStart])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', onDown)
      return () => document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const rows = useMemo(() => buildMonthCalendarRows(viewYear, viewMonth), [viewYear, viewMonth])
  const labels = useMemo(() => weekdayLabels(locale), [locale])

  const todayDate = useMemo(() => {
    const n = new Date()
    return toYMD(new Date(n.getFullYear(), n.getMonth(), n.getDate()))
  }, [])

  const goPrevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m <= 1) {
        setViewYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }, [])

  const goNextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m >= 12) {
        setViewYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }, [])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    const list: number[] = []
    for (let i = y - 8; i <= y + 1; i++) list.push(i)
    return list
  }, [])

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])

  const headerTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth - 1, 1)
    return new Intl.DateTimeFormat(locale || 'zh-CN', { year: 'numeric', month: 'long' }).format(d)
  }, [viewYear, viewMonth, locale])

  const pickRow = (row: Date[]) => {
    const ws = toYMD(row[0])
    if (ws > maxWeekStart) return
    onWeekStartChange(ws)
    setOpen(false)
  }

  const handleToday = () => {
    onToday()
    setOpen(false)
  }

  const handleClear = () => {
    onClear?.()
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) setOpen((o) => !o)
        }}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-2.5 py-1.5 text-sm text-white transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/20'
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('dashboard.weekFilterTitle')}
      >
        <Calendar className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
        <span className="tabular-nums text-left max-w-[14rem] truncate">{summary}</span>
        <ChevronDown className={clsx('w-4 h-4 shrink-0 opacity-80 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="calendar-popover-panel absolute right-0 top-full z-[100] mt-2 w-[min(100vw-1.5rem,20rem)]"
          role="dialog"
          aria-label={t('tasks.weekPickerAria')}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={goPrevMonth}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label={t('tasks.weekPickerPrevMonth')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="max-w-[5.5rem] rounded-md border border-slate-200 bg-white py-1 pl-2 pr-1 text-sm text-slate-800"
                aria-label={t('tasks.weekPickerYear')}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {locale?.startsWith('zh') ? `${y}年` : y}
                  </option>
                ))}
              </select>
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="max-w-[5rem] rounded-md border border-slate-200 bg-white py-1 pl-2 pr-1 text-sm text-slate-800"
                aria-label={t('tasks.weekPickerMonth')}
              >
                {monthOptions.map((m) => {
                  const label = new Intl.DateTimeFormat(locale || 'zh-CN', { month: 'short' }).format(
                    new Date(2000, m - 1, 1)
                  )
                  return (
                    <option key={m} value={m}>
                      {locale?.startsWith('zh') ? `${m}月` : label}
                    </option>
                  )
                })}
              </select>
            </div>
            <button
              type="button"
              onClick={goNextMonth}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label={t('tasks.weekPickerNextMonth')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-1 text-center text-xs text-slate-500">{headerTitle}</div>

          <div className="grid grid-cols-7 gap-0 text-center text-xs font-medium text-slate-500">
            {labels.map((lb, i) => (
              <div key={i} className="py-1">
                {lb}
              </div>
            ))}
          </div>

          <div className="mt-0.5 space-y-0.5">
            {rows.map((row, ri) => {
              const rowWeek = toYMD(row[0])
              const rowDisabled = rowWeek > maxWeekStart
              const isSelectedWeek = rowWeek === weekStart
              const isHoverWeek = hoverWeek === rowWeek && !rowDisabled

              return (
                <div
                  key={ri}
                  className={clsx(
                    'grid grid-cols-7 gap-0',
                    !rowDisabled && 'cursor-pointer',
                    rowDisabled && 'cursor-not-allowed opacity-40'
                  )}
                  onMouseLeave={() => setHoverWeek(null)}
                  onClick={() => !rowDisabled && pickRow(row)}
                >
                  {row.map((cell, ci) => {
                    const inMonth = cell.getMonth() === viewMonth - 1
                    const ymd = toYMD(cell)
                    const isTodayCell = ymd === todayDate
                    const inHover = isHoverWeek
                    const inSelect = isSelectedWeek

                    return (
                      <div
                        key={ymd}
                        className="relative flex min-h-[2rem] items-center justify-center p-px"
                        onMouseEnter={() => !rowDisabled && setHoverWeek(rowWeek)}
                      >
                        <span
                          className={clsx(
                            'flex h-8 w-full items-center justify-center text-sm tabular-nums',
                            inSelect && 'bg-picker-600 font-medium text-white shadow-sm',
                            !inSelect && inHover && 'bg-picker-100 text-picker-900',
                            !inSelect && !inHover && inMonth && 'text-slate-800',
                            !inSelect && !inHover && !inMonth && 'text-slate-400',
                            isTodayCell && !inSelect && 'ring-1 ring-inset ring-picker-400 rounded-md',
                            ci === 0 && (inSelect || inHover) && 'rounded-l-md',
                            ci === 6 && (inSelect || inHover) && 'rounded-r-md'
                          )}
                        >
                          {cell.getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            {onClear ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                {t('tasks.weekPickerClear')}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={handleToday}
              className="text-sm font-medium text-picker-600 hover:text-picker-700"
            >
              {t('tasks.weekPickerToday')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
