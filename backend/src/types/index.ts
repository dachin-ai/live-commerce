/**
 * types/index.ts — 类型系统入口
 * 统一重导出所有业务类型与 API 类型
 *
 * 子模块:
 *   db.ts  — 数据库行级类型 (每张表对应一个接口)
 *   api.ts — API 请求/响应类型 (路由层使用)
 */

export * from './db'
export * from './api'

// ==================== 通用工具类型 ====================

/** 从对象类型中排除 null | undefined */
export type NonNullableFields<T> = {
  [K in keyof T]-?: NonNullable<T[K]>
}

/** 让所有字段可选但保留字段类型（深度 Partial） */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

// ==================== 旧有类型（向后兼容保留） ====================

/** @deprecated 使用 TaskRow 代替 */
export interface Task {
  id: string
  title: string
  description?: string
  priority: 'urgent' | 'normal'
  status: 'pending' | 'in-progress' | 'completed'
  createdAt: string
}

/** @deprecated 使用 StatsRow 代替 */
export interface LiveStats {
  totalGMV: number
  totalDuration: number
  totalViewers: number
  activeViewers: number
  totalInteractions: number
  totalOrders: number
  averageConversionRate: number
  averageDurationPerRound: number
  gmvPerHour: number
  averageDurationPerDay: number
  roundsPerDay: number
  rounds: number
  previousPeriod: {
    totalGMV: number
    totalDuration: number
    activeViewers: number
    averageConversionRate: number
    averageDurationPerRound: number
    gmvPerHour: number
    averageDurationPerDay: number
    roundsPerDay: number
  }
}
