/**
 * API 层类型定义
 * 涵盖所有路由的请求体 (Request) 和响应体 (Response)
 */

// ==================== 通用响应结构 ====================

export interface ApiSuccess<T = unknown> {
  data: T
  message?: string
}

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ==================== 分页 ====================

export interface PaginationQuery {
  page?: number
  pageSize?: number
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ==================== 认证 ====================

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    name: string
    email: string
    role: string
    status: string
  }
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
  role?: string
}

// ==================== 任务待办 ====================

export interface CreateTaskRequest {
  title: string
  description?: string
  priority?: 'urgent' | 'normal'
  storeId?: string
  aiFeature?: string
  source?: string
  assignedRole?: string
  estimatedDays?: string
  category?: string
  responsible?: string
  weekStart?: string
  dueDate?: string
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  priority?: 'urgent' | 'normal'
  status?: 'pending' | 'in-progress' | 'completed'
  aiFeature?: string
  assignedRole?: string
  estimatedDays?: string
  category?: string
  responsible?: string
  dueDate?: string
}

export interface GenerateTasksRequest {
  storeId: string
  additionalUserPrompt?: string
  locale?: string
  weekStart?: string
  rawDailyOverride?: string
  metricsOverride?: Record<string, unknown>
}

export interface GenerateTasksResponse {
  tasks: Array<{
    title: string
    description: string
    priority: 'urgent' | 'normal'
    source?: string
    aiFeature?: string
    assignedRole?: string
    estimatedDays?: string | null
    category?: string | null
    responsible?: string | null
  }>
  inserted?: number
  llmEmptyReason?: string
  statsDateRangeUsed?: { dateFrom: string; dateTo: string }
  statsDateRangeReason?: string
}

// ==================== 店铺 ====================

export interface CreateStoreRequest {
  name: string
  platform?: string
  region?: string
  targetAudience?: string
  brandPositioning?: string
  brandStrategy?: string
  description?: string
  minPrice?: number
  maxPrice?: number
  currencySymbol?: string
  categories?: string[]
}

export interface UpdateStoreRequest extends Partial<CreateStoreRequest> {
  id: string
}

// ==================== 统计数据 ====================

export interface ImportStatsRequest {
  storeId: string
  date: string
  totalGMV: number
  totalDuration: number
  totalViewers: number
  totalOrders: number
  totalInteractions?: number
  rounds?: number
  likes?: number
  comments?: number
  shares?: number
  follows?: number
  productViews?: number
  productClicks?: number
  completedOrders?: number
}

// ==================== 话术/脚本 ====================

export interface GenerateScriptRequest {
  storeId: string
  scriptType?: string
  productName?: string
  targetAudience?: string
  tone?: string
  additionalContext?: string
  locale?: string
}

export interface GenerateScriptResponse {
  content: string
  scriptId?: string
  tokensUsed?: number
}

// ==================== LLM 工具配置 ====================

export interface CreateLlmToolRequest {
  name: string
  type: 'coze_agent' | 'openai' | 'google_ai' | 'custom'
  url: string
  apiKey: string
  model?: string
  features?: string[]
  isActive?: boolean
}

export interface UpdateLlmToolRequest extends Partial<CreateLlmToolRequest> {
  id: string
}

export interface LlmDiagnosticResponse {
  configured: boolean
  source: 'db' | 'env' | 'none'
  hint: string
  tools?: Array<{ id: string; name: string; type: string; features: string[] }>
}

// ==================== 素材库 ====================

export interface CreateMaterialRequest {
  storeId: string
  type: 'script' | 'image' | 'video' | 'document' | 'other'
  title: string
  content?: string
  url?: string
  tags?: string
}

// ==================== 用户偏好 ====================

export interface UpdatePreferencesRequest {
  preferences: Record<string, unknown>
}

// ==================== 视频分析 ====================

export interface VideoAnalysisRequest {
  storeId: string
  videoUrl?: string
  taskType?: 'scene_scoring' | 'script_review' | 'product_showcase'
}

export interface VideoAnalysisResponse {
  analysisId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: {
    score?: number
    suggestions?: string[]
    rawContent?: string
  }
}
