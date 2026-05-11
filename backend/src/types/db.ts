/**
 * 业务实体类型定义 — 数据库行级类型
 * 每个接口对应一张数据库表的行结构，消除路由/服务中的 any。
 */

// ==================== 核心业务实体 ====================

export interface TaskRow {
  id: string
  title: string
  description?: string | null
  priority: 'urgent' | 'normal'
  status: 'pending' | 'in-progress' | 'completed'
  createdAt: string
  userId?: string | null
  storeId?: string | null
  aiFeature?: string | null
  source?: string | null
  assignedRole?: string | null
  estimatedDays?: string | null
  category?: string | null
  responsible?: string | null
  weekStart?: string | null
  completedAt?: string | null
  dueDate?: string | null
}

export interface StoreRow {
  id: string
  name: string
  platform?: string | null
  region?: string | null
  userId?: string | null
  targetAudience?: string | null
  brandPositioning?: string | null
  brandStrategy?: string | null
  description?: string | null
  minPrice?: number | null
  maxPrice?: number | null
  currencySymbol?: string | null
  createdAt: string
  updatedAt?: string | null
}

export interface StatsRow {
  id: string
  storeId: string
  date: string
  totalGMV: number
  totalDuration: number
  totalViewers: number
  totalOrders: number
  totalInteractions: number
  rounds?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  follows?: number | null
  productViews?: number | null
  productClicks?: number | null
  completedOrders?: number | null
  activeViewers?: number | null
  averageConversionRate?: number | null
  clickThroughRate?: number | null
  interactionRate?: number | null
  gmvPerHour?: number | null
  createdAt?: string | null
}

export interface UserRow {
  id: string
  name: string
  email: string
  password: string
  role: 'admin' | 'operator' | 'user' | 'anchor'
  status: 'active' | 'inactive'
  createdAt: string
  updatedAt?: string | null
  language?: string | null
  avatar?: string | null
}

export interface CategoryRow {
  id: string
  name: string
  parentId?: string | null
  createdAt?: string | null
}

export interface StoreCategoryRow {
  storeId: string
  categoryId: string
}

export interface MaterialRow {
  id: string
  storeId: string
  type: 'script' | 'image' | 'video' | 'document' | 'other'
  title: string
  content?: string | null
  url?: string | null
  tags?: string | null
  createdAt: string
  updatedAt?: string | null
  userId?: string | null
}

// ==================== LLM 工具配置 ====================

export interface LlmToolRow {
  id: string
  name: string
  type: 'coze_agent' | 'openai' | 'google_ai' | 'custom'
  url: string
  apiKey: string
  model?: string | null
  features?: string | null   // JSON: string[] — 支持的功能 ('todo' | 'script' | 'anomaly')
  isActive: number           // INTEGER BOOLEAN: 0 | 1
  sort_order?: number | null
  createdAt: string
  updatedAt?: string | null
}

// ==================== 系统配置 ====================

export interface SystemConfigRow {
  key: string
  value: string
  updatedAt?: string | null
}

// ==================== 审计日志 ====================

export interface AuditLogRow {
  id: string
  userId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  details?: string | null
  ipAddress?: string | null
  createdAt: string
}

// ==================== 用户偏好 ====================

export interface UserPreferencesRow {
  userId: string
  preferences: string   // JSON string
  updatedAt?: string | null
}

// ==================== 版本日志 ====================

export interface VersionLogRow {
  id: string
  version: string
  title: string
  content: string
  releaseDate: string
  createdAt: string
}

// ==================== 消息/站内信 ====================

export interface MessageRow {
  id: string
  userId: string
  title: string
  content: string
  isRead: number   // 0 | 1
  type?: string | null
  relatedId?: string | null
  createdAt: string
}

// ==================== 用户 ↔ 店铺 访问权限 ====================

export interface StoreAccessRow {
  storeId: string
  userId: string
  role?: string | null
  createdAt?: string | null
}

// ==================== 话术脚本 ====================

export interface ScriptRow {
  id: string
  storeId: string
  title: string
  content: string
  type?: string | null
  tags?: string | null
  createdAt: string
  updatedAt?: string | null
  userId?: string | null
}

// ==================== 工作流 ====================

export interface WorkflowRow {
  id: string
  storeId?: string | null
  name: string
  config: string   // JSON string
  status: 'active' | 'inactive' | 'draft'
  createdAt: string
  updatedAt?: string | null
  userId?: string | null
}
