import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import {
  buildMonthCalendarRows,
  formatLocalYMD,
  parseYMDLocal,
  weekdayLabels,
} from '../utils/calendarLocal'

function toYMD(d: Date): string {
  return formatLocalYMD(d)
}

export type DatePickerPopoverProps = {
  value: string
  onChange: (ymd: string) => void
  min?: string
  max?: string
  locale?: string
  placeholder?: string
  ariaLabel: string
  disabled?: boolean
}

export default function DatePickerPopover({
  value,
  onChange,
  min,
  max,
  locale = 'zh-CN',
  placeholder,
  ariaLabel,
  disabled = false,
}: DatePickerPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hoverDay, setHoverDay] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const openFrom = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return parseYMDLocal(value)
    return new Date()
  }, [value])

  const [viewYear, setViewYear] = useState(() => openFrom.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => openFrom.getMonth() + 1)

  useEffect(() => {
    if (!open) return
    const d = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseYMDLocal(value) : new Date()
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth() + 1)
  }, [open, value])

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

  const inRange = useCallback(
    (ymd: string) => {
      if (min && ymd < min) return false
      if (max && ymd > max) return false
      return true
    },
    [min, max]
  )

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
    const now = new Date().getFullYear()
    let yMin = now - 8
    let yMax = now + 1
    if (min) yMin = Math.min(yMin, parseInt(min.slice(0, 4), 10))
    if (max) yMax = Math.max(yMax, parseInt(max.slice(0, 4), 10))
    const list: number[] = []
    for (let y = yMin; y <= yMax; y++) list.push(y)
    return list
  }, [min, max])

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])

  const headerTitle = useMemo(() => {
    const d = new Date(viewYear, viewMonth - 1, 1)
    return new Intl.DateTimeFormat(locale || 'zh-CN', { year: 'numeric', month: 'long' }).format(d)
  }, [viewYear, viewMonth, locale])

  const displayValue = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
    try {
      return new Intl.DateTimeFormat(locale || 'zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(parseYMDLocal(value))
    } catch {
      return value
    }
  }, [value, locale])

  const pickDay = (ymd: string) => {
    if (!inRange(ymd)) return
    onChange(ymd)
    setOpen(false)
  }

  const handleToday = () => {
    if (!inRange(todayDate)) return
    onChange(todayDate)
    setOpen(false)
  }

  const ph = placeholder ?? t('common.pickDate')

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) setOpen((o) => !o)
        }}
        className={clsx('calendar-field-trigger', disabled && 'opacity-50 cursor-not-allowed')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0 text-picker-600" aria-hidden />
        <span className="min-w-[6.5rem] text-left">{displayValue || ph}</span>
        <ChevronDown className={clsx('w-3.5 h-3.5 shrink-0 text-slate-400', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="calendar-popover-panel absolute left-0 top-full z-[100] mt-1.5 w-[min(100vw-1.5rem,20rem)]"
          role="dialog"
          aria-label={ariaLabel}
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
            {rows.map((row, ri) => (
              <div key={ri} className="grid grid-cols-7 gap-0">
                {row.map((cell) => {
                  const ymd = toYMD(cell)
                  const inMonth = cell.getMonth() === viewMonth - 1
                  const isTodayCell = ymd === todayDate
                  const isSelected = ymd === value
                  const allowed = inRange(ymd)
                  const isHover = hoverDay === ymd && allowed

                  return (
                    <div key={ymd} className="relative flex min-h-[2rem] items-center justify-center p-px">
                      <button
                        type="button"
                        disabled={!allowed}
                        onMouseEnter={() => allowed && setHoverDay(ymd)}
                        onMouseLeave={() => setHoverDay(null)}
                        onClick={() => pickDay(ymd)}
                        className={clsx(
                          'flex h-8 w-full items-center justify-center rounded-md text-sm tabular-nums transition-colors',
                          !allowed && 'cursor-not-allowed text-slate-300',
                          allowed && 'cursor-pointer',
                          isSelected && 'bg-picker-600 font-medium text-white shadow-sm',
                          !isSelected && isHover && allowed && 'bg-picker-100 text-picker-900',
                          !isSelected && !isHover && inMonth && allowed && 'text-slate-800 hover:bg-slate-50',
                          !isSelected && !isHover && !inMonth && allowed && 'text-slate-400 hover:bg-slate-50',
                          isTodayCell && !isSelected && allowed && 'ring-1 ring-inset ring-picker-400'
                        )}
                      >
                        {cell.getDate()}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <span />
            <button
              type="button"
              onClick={handleToday}
              disabled={!inRange(todayDate)}
              className="text-sm font-medium text-picker-600 hover:text-picker-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('tasks.weekPickerToday')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
