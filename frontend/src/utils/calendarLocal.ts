/** 本地自然周：周一为一周开始（与待办 weekStart、统计区间一致） */
export function getWeekMondayFromDate(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = date.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diffToMonday)
  return date
}

export function formatLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseYMDLocal(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map(Number)
  return new Date(y, m - 1, day)
}

/** 某月日历：从该月第一周在网格中的周一开始，共 6 行 × 7 列（周一至周日） */
export function buildMonthCalendarRows(viewYear: number, viewMonth: number): Date[][] {
  const firstOfMonth = new Date(viewYear, viewMonth - 1, 1)
  const gridStart = getWeekMondayFromDate(firstOfMonth)
  const rows: Date[][] = []
  let cur = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate())
  for (let r = 0; r < 6; r++) {
    const row: Date[] = []
    for (let c = 0; c < 7; c++) {
      row.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()))
      cur.setDate(cur.getDate() + 1)
    }
    rows.push(row)
  }
  return rows
}

export function weekdayLabels(locale: string): string[] {
  const base = new Date(2024, 0, 1) // Monday
  const opt: Intl.DateTimeFormatOptions =
    locale?.startsWith('zh') || locale?.startsWith('ja') ? { weekday: 'narrow' } : { weekday: 'short' }
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    return new Intl.DateTimeFormat(locale || 'zh-CN', opt).format(d)
  })
}
