import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

function parseYM(s: string): { y: number; m: number } {
  const [y, m] = s.split('-').map(Number)
  return { y, m: m || 1 }
}

function ymKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

const MONTH_GRID = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export type MonthPickerPopoverProps = {
  value: string
  onChange: (ym: string) => void
  min: string
  max: string
  locale?: string
  ariaLabel: string
  /** 触发按钮原生 title（如可选范围说明） */
  hintTitle?: string
  disabled?: boolean
}

export default function MonthPickerPopover({
  value,
  onChange,
  min,
  max,
  locale = 'zh-CN',
  ariaLabel,
  hintTitle,
  disabled = false,
}: MonthPickerPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const minP = useMemo(() => parseYM(min), [min])
  const maxP = useMemo(() => parseYM(max), [max])

  const initial = useMemo(() => (value && /^\d{4}-\d{2}$/.test(value) ? parseYM(value) : maxP), [value, maxP])
  const [viewYear, setViewYear] = useState(initial.y)

  useEffect(() => {
    if (!open) return
    const p = value && /^\d{4}-\d{2}$/.test(value) ? parseYM(value) : maxP
    setViewYear(Math.min(Math.max(p.y, minP.y), maxP.y))
  }, [open, value, minP.y, maxP.y])

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

  const yearOptions = useMemo(() => {
    const list: number[] = []
    for (let y = minP.y; y <= maxP.y; y++) list.push(y)
    return list
  }, [minP.y, maxP.y])

  const monthEnabled = useCallback(
    (m: number) => {
      const key = ymKey(viewYear, m)
      return key >= min && key <= max
    },
    [viewYear, min, max]
  )

  const displayValue = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return ''
    const { y, m } = parseYM(value)
    try {
      return new Intl.DateTimeFormat(locale || 'zh-CN', { year: 'numeric', month: 'long' }).format(
        new Date(y, m - 1, 1)
      )
    } catch {
      return value
    }
  }, [value, locale])

  const pickMonth = (m: number) => {
    if (!monthEnabled(m)) return
    onChange(ymKey(viewYear, m))
    setOpen(false)
  }

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
        title={hintTitle}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0 text-picker-600" aria-hidden />
        <span className="min-w-[7rem] text-left">{displayValue || t('common.pickMonth')}</span>
        <ChevronDown className={clsx('w-3.5 h-3.5 shrink-0 text-slate-400', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="calendar-popover-panel absolute left-0 top-full z-[100] mt-1.5 w-[min(100vw-1.5rem,18rem)]"
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className="mb-3 flex items-center justify-center gap-2">
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="max-w-[7rem] rounded-md border border-slate-200 bg-white py-1.5 pl-2 pr-1 text-sm text-slate-800"
              aria-label={t('tasks.weekPickerYear')}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {locale?.startsWith('zh') ? `${y}年` : y}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MONTH_GRID.map((m) => {
              const key = ymKey(viewYear, m)
              const en = monthEnabled(m)
              const sel = value === key
              const label = new Intl.DateTimeFormat(locale || 'zh-CN', { month: 'short' }).format(
                new Date(2000, m - 1, 1)
              )
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!en}
                  onClick={() => pickMonth(m)}
                  className={clsx(
                    'rounded-lg py-2 text-xs font-medium transition-colors',
                    sel && 'bg-picker-600 text-white shadow-sm',
                    !sel && en && 'border border-slate-200 bg-white text-slate-700 hover:border-picker-300 hover:bg-picker-50',
                    !en && 'cursor-not-allowed border border-transparent bg-slate-50 text-slate-300'
                  )}
                >
                  {locale?.startsWith('zh') ? `${m}月` : label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
