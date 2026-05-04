/**
 * AI 工具面板 — 共享类型定义
 * 供 AIFeatures.tsx 拆分出的所有子组件、hooks 使用
 */

import type {
  ReportResult,
  MarketAnalysisResult,
  RecommendationsResult,
  StoreComparisonResult,
  StatsResult,
  MarketResearchResult,
  ScriptType,
  ScriptLanguage,
} from '../../services/ai'
import type { Task } from '../../services/tasks'

// ==================== 结果类型 ====================

export type ToolResultData =
  | { type: 'script'; data: Record<string, unknown> }
  | { type: 'report'; data: ReportResult & { insights?: string[] } }
  | { type: 'analysis'; data: MarketAnalysisResult & { trends: Array<{ product: string; trend: string; change: string }> } }
  | { type: 'recommendations'; data: RecommendationsResult & { map?: unknown } }
  | { type: 'stats'; data: StatsResult & { summary?: string; keyMetrics?: Record<string, unknown>; trends?: string[] } }
  | { type: 'compare'; data: StoreComparisonResult & { efficiency?: { comparison?: Array<Record<string, unknown>>; recommendations?: string[] }; insights?: string[] } }
  | { type: 'research'; data: MarketResearchResult & { summary?: string; trends?: string[]; opportunities?: string[] } }
  | { type: 'assistant'; data: AssistantResultData }

export type StoredToolResult = { type: string; data: unknown }

export interface AssistantResultData {
  message: string
  tasks: Task[]
  urgentCount: number
  totalCount: number
}

// ==================== 话术表单类型 ====================

export type BundleItemRole = 'core' | 'tool'

export interface BundleItem {
  id: string
  name: string
  price: string
  sku: string
  features: string
  quantity: number
  role: BundleItemRole
}

export interface ScriptFormState {
  productName: string
  productSku: string
  price: string
  features: string
  targetAudience: string
  country: string
  scriptType: ScriptType
  language: ScriptLanguage
  promoCopy: string
}

export const SCRIPT_FORM_INITIAL: ScriptFormState = {
  productName: '',
  productSku: '',
  price: '',
  features: '',
  targetAudience: '',
  country: '',
  scriptType: 'full-sales',
  language: 'zh-CN',
  promoCopy: '',
}

// ==================== localStorage Keys ====================

export const SCRIPT_FORM_STORAGE_KEY = 'lvbcsym_script_form_draft'
export const SCRIPT_RESULT_STORAGE_KEY = 'lvbcsym_script_last_result'
export const TOOLS_RESULTS_STORAGE_KEY = 'lvbcsym_tools_results'
export const BUNDLE_ITEMS_MAX = 30

// ==================== Re-export 供子组件使用 ====================

export type { ScriptType, ScriptLanguage, Task }
