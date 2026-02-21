/** 时间周期类型（与 Dashboard/AnalysisPage 一致） */
export type TimePeriod =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'monthPick'
  | 'yearPick'
  | 'custom'

/** 环比对比周期文案（与后端 previousPeriod 对应：上一等长周期） */
export function getComparisonPeriodLabel(
  timePeriod: TimePeriod,
  opts: {
    customDateFrom?: string
    customDateTo?: string
    selectedMonth?: string
    selectedYear?: string
  }
): string {
  const toStr = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  if (timePeriod === 'custom' && opts.customDateFrom && opts.customDateTo) {
    const from = new Date(opts.customDateFrom)
    const to = new Date(opts.customDateTo)
    const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1
    const prevTo = new Date(from)
    prevTo.setDate(prevTo.getDate() - 1)
    const prevFrom = new Date(prevTo)
    prevFrom.setDate(prevFrom.getDate() - days + 1)
    return `${toStr(prevFrom)}～${toStr(prevTo)}`
  }
  if (timePeriod === 'monthPick' && opts.selectedMonth) {
    const [y, m] = opts.selectedMonth.split('-').map(Number)
    const prevM = m === 1 ? 12 : m - 1
    const prevY = m === 1 ? y - 1 : y
    return `${prevY}年${String(prevM).padStart(2, '0')}月`
  }
  if (timePeriod === 'yearPick' && opts.selectedYear) {
    return `${Number(opts.selectedYear) - 1}年`
  }
  const map: Record<string, string> = {
    today: '昨日',
    week: '上周',
    month: '上月',
    quarter: '上季度',
    year: '去年',
  }
  return map[timePeriod] ?? '上一周期'
}
