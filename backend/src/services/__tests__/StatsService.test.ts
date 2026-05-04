import { describe, it, expect } from 'vitest'
import {
  getDateRange,
  getDateRangeFromMonthOrYear,
  getPreviousPeriodRange,
  getYoYBaselineRange,
  normalizeDateParam,
  normalizeMonthParam,
  emptyStats,
  buildMockStats,
} from '../StatsService'

describe('StatsService 日期工具', () => {
  describe('getDateRange', () => {
    it('today 返回今天', () => {
      const { dateFrom, dateTo } = getDateRange('today')
      expect(dateFrom).toBe(dateTo)
      expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('week 返回周一至周日', () => {
      const { dateFrom, dateTo } = getDateRange('week')
      const from = new Date(dateFrom + 'T00:00:00')
      const to = new Date(dateTo + 'T00:00:00')
      // 应为7天跨度
      const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
      expect(days).toBe(7)
      // from 应为周一 (getDay() === 1)
      expect(from.getDay()).toBe(1)
    })

    it('month 返回本月1号到末尾', () => {
      const { dateFrom, dateTo } = getDateRange('month')
      expect(dateFrom).toMatch(/-01$/)
      const to = new Date(dateTo + 'T00:00:00')
      const nextDay = new Date(to)
      nextDay.setDate(nextDay.getDate() + 1)
      expect(nextDay.getDate()).toBe(1) // 末尾的下一天是1号
    })

    it('year 返回1月1日到12月31日', () => {
      const y = new Date().getFullYear()
      const { dateFrom, dateTo } = getDateRange('year')
      expect(dateFrom).toBe(`${y}-01-01`)
      expect(dateTo).toBe(`${y}-12-31`)
    })

    it('custom 使用传入的日期', () => {
      const { dateFrom, dateTo } = getDateRange('custom', '2025-03-01', '2025-03-15')
      expect(dateFrom).toBe('2025-03-01')
      expect(dateTo).toBe('2025-03-15')
    })

    it('未知 timeRange 默认最近7天', () => {
      const { dateFrom, dateTo } = getDateRange('unknown')
      const from = new Date(dateFrom + 'T00:00:00')
      const to = new Date(dateTo + 'T00:00:00')
      const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
      expect(days).toBe(7)
    })
  })

  describe('getDateRangeFromMonthOrYear', () => {
    it('月份 2025-03 返回3月范围', () => {
      const range = getDateRangeFromMonthOrYear('2025-03')
      expect(range).not.toBeNull()
      expect(range!.dateFrom).toBe('2025-03-01')
      expect(range!.dateTo).toBe('2025-03-31')
    })

    it('年份 2025 返回全年范围', () => {
      const range = getDateRangeFromMonthOrYear(undefined, '2025')
      expect(range).not.toBeNull()
      expect(range!.dateFrom).toBe('2025-01-01')
      expect(range!.dateTo).toBe('2025-12-31')
    })

    it('无效输入返回 null', () => {
      expect(getDateRangeFromMonthOrYear()).toBeNull()
      expect(getDateRangeFromMonthOrYear('abc')).toBeNull()
    })
  })

  describe('getPreviousPeriodRange', () => {
    it('7天周期返回前7天', () => {
      const prev = getPreviousPeriodRange('2025-03-10', '2025-03-16')
      expect(prev.dateFrom).toBe('2025-03-03')
      expect(prev.dateTo).toBe('2025-03-09')
    })

    it('1天周期返回前一天', () => {
      const prev = getPreviousPeriodRange('2025-03-15', '2025-03-15')
      expect(prev.dateFrom).toBe('2025-03-14')
      expect(prev.dateTo).toBe('2025-03-14')
    })
  })

  describe('getYoYBaselineRange', () => {
    it('year 模式前移一年', () => {
      const yoy = getYoYBaselineRange('year', '2025-01-01', '2025-12-31')
      expect(yoy.dateFrom).toBe('2024-01-01')
      expect(yoy.dateTo).toBe('2024-12-31')
    })

    it('month 模式前移一月', () => {
      const yoy = getYoYBaselineRange('month', '2025-03-01', '2025-03-28')
      expect(yoy.dateFrom).toBe('2025-02-01')
      expect(yoy.dateTo).toBe('2025-02-28')
    })
  })

  describe('normalizeDateParam', () => {
    it('斜杠转短横线', () => {
      expect(normalizeDateParam('2025/3/5')).toBe('2025-03-05')
    })
    it('已规范格式不变', () => {
      expect(normalizeDateParam('2025-03-15')).toBe('2025-03-15')
    })
    it('空值返回空字符串', () => {
      expect(normalizeDateParam(undefined)).toBe('')
      expect(normalizeDateParam('')).toBe('')
    })
  })

  describe('normalizeMonthParam', () => {
    it('补零', () => {
      expect(normalizeMonthParam('2025-3')).toBe('2025-03')
    })
    it('已规范不变', () => {
      expect(normalizeMonthParam('2025-12')).toBe('2025-12')
    })
  })

  describe('emptyStats', () => {
    it('返回零值结构', () => {
      const s = emptyStats('week')
      expect(s.totalGMV).toBe(0)
      expect(s.previousPeriod.totalGMV).toBe(0)
      expect(s.yearOverYearPeriod.totalGMV).toBe(0)
      expect(s.trend).toEqual([])
    })
  })

  describe('buildMockStats', () => {
    it('week 返回有效 mock', () => {
      const s = buildMockStats('week')
      expect(s.totalGMV).toBeGreaterThan(0)
      expect(s.trend.length).toBe(7)
      expect(s.previousPeriod.totalGMV).toBeGreaterThan(0)
    })
    it('today 返回1天趋势', () => {
      const s = buildMockStats('today')
      expect(s.trend.length).toBe(1)
    })
  })
})
