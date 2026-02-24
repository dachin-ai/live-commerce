import api from './api'

export type ScriptType =
  | 'full-sales'
  | 'segment-audience'
  | 'segment-product'
  | 'segment-concerns'
  | 'segment-benefits'
  | 'segment-after-sales'
  | 'segment-closing'
export type ScriptLanguage = 'zh-CN' | 'en-US' | 'th-TH'

export interface GenerateScriptParams {
  productName?: string
  /** 产品 SKU（可选），对应 Coze sku_info */
  productSku?: string
  price?: string
  features?: string
  targetAudience?: string
  scriptType?: ScriptType
  language?: ScriptLanguage
  promoCopy?: string
  /** Coze 风格参数（优先于 promoCopy） */
  promotion_info?: string
  storeId?: string
  /** 国家名称（如 泰国、菲律宾），用于 Coze country */
  country?: string
  /** 国家代码（如 TH、PH），优先级最高 */
  countryCode?: string
  /** 自定义要求，对应 Coze custom_requirements */
  custom_requirements?: string
  customRequirements?: string
  topic?: string
  duration?: number
  style?: string
}

export interface GenerateTasksParams {
  storeId: string
  /** 当前店铺无运营数据时，用该店铺的 stats 生成待办（任务仍归属 storeId），用于测试/同样本店铺 */
  useStatsFromStoreId?: string
  /** 按日明细 TSV（表头：日期\\tGMV\\t直播时长(h)\\t观看\\t订单\\t…），可来自 Excel 解析；有则优先于 DB */
  rawDailyTable?: string
  /** 汇总指标覆盖（与 rawDailyTable 搭配使用，无 DB 时必填）：total_revenue、total_viewers、total_orders、total_duration 等 */
  metricsOverride?: Record<string, unknown>
  /** 用户补充提示词，会追加到发给 LLM 的 userMessage */
  userPrompt?: string
  /** 用户界面语言（如 zh-CN、en-US、th-TH），传给 LLM 以便按语言回复；不传则从 localStorage lvbcsym_locale 读取 */
  locale?: string
  /** 国家/地区代码（如 CN、US、TH），不传则从 locale 推导 */
  countryCode?: string
}

export interface ScriptLLMResult {
  id?: string
  content?: string
  [key: string]: unknown
}

/** 查询话术 LLM 配置（GET /api/ai/script/config）；管理员返回 allowedUserIds、enabledFeatures，非管理员返回 hasAccess、hasAccessForTasks（能否使用智能生成待办） */
export async function getScriptLLMConfig(): Promise<{
  configured: boolean
  allowedUserIds?: string[] | null
  enabledFeatures?: string[] | null
  hasAccess?: boolean
  hasAccessForTasks?: boolean
}> {
  const data = await api.get('/ai/script/config')
  return data as unknown as { configured: boolean; allowedUserIds?: string[] | null; enabledFeatures?: string[] | null; hasAccess?: boolean; hasAccessForTasks?: boolean }
}

/** 豆包（火山方舟）API 基地址 */
export const DOUBAO_LLM_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

/** 默认 Coze 智能体 stream_run 地址（话术生成优先使用） */
export const DEFAULT_SCRIPT_LLM_URL = 'https://zbmr4xq6rm.coze.site/stream_run'

/** LLM 智能体方式：Coze Agent、OpenAI 兼容 */
export type LLMModeId = 'coze_agent' | 'openai'

/** 诊断话术 LLM 是否已配置（GET /api/ai/llm-diagnostic），用于排查待办 LLM 0 条 */
export async function getLlmDiagnostic(): Promise<{ configured: boolean; source: 'env' | 'db' | 'none'; hint: string }> {
  const data = await api.get('/ai/llm-diagnostic')
  return data as unknown as { configured: boolean; source: 'env' | 'db' | 'none'; hint: string }
}

/** 获取可选智能体方式与当前偏好（GET /api/ai/llm-modes） */
export async function getLlmModes(): Promise<{
  modes: Array<{ id: LLMModeId; label: string }>
  versions: Array<{ id: string; label: string }>
  currentTodo: LLMModeId
  currentScript: LLMModeId
  currentAnomaly: LLMModeId
  effectiveMode: LLMModeId | null
  configured: boolean
}> {
  const data = await api.get('/ai/llm-modes')
  return data as unknown as Awaited<ReturnType<typeof getLlmModes>>
}

/** 保存智能体方式偏好（PUT /api/ai/llm-modes），仅管理员可调用 */
export async function setLlmModes(options: { todo?: LLMModeId; script?: LLMModeId }): Promise<{
  success: boolean
  currentTodo: LLMModeId
  currentScript: LLMModeId
}> {
  const data = await api.put('/ai/llm-modes', options)
  return data as unknown as Awaited<ReturnType<typeof setLlmModes>>
}

/** 保存话术 LLM 配置（POST /api/ai/script/config），仅管理员可调用；allowedUserIds 为选定用户；enabledFeatures 为启用功能 id 列表（未传或 null 表示全部启用） */
export async function saveScriptLLMConfig(
  url: string,
  apiKey: string,
  model?: string,
  allowedUserIds?: string[],
  enabledFeatures?: string[] | null
): Promise<{ success: boolean; message?: string }> {
  const data = await api.post('/ai/script/config', {
    url,
    apiKey,
    model: model || undefined,
    allowedUserIds: allowedUserIds ?? undefined,
    enabledFeatures: enabledFeatures ?? undefined,
  })
  return data as unknown as { success: boolean; message?: string }
}

/** 智能生成任务会调用 LLM，可能需 15～90 秒（含重试），单独延长超时 */
const GENERATE_TASKS_TIMEOUT_MS = 90000
/** 话术生成（同步）、报告等长耗时接口超时 */
const SCRIPT_AND_REPORT_TIMEOUT_MS = 60000

/** 从 locale 推导国家/地区代码（与后端、LanguageContext 一致） */
function localeToCountryCode(locale: string | undefined): string {
  if (!locale) return 'CN'
  const u = (locale || '').toUpperCase()
  if (u.startsWith('ZH')) return 'CN'
  if (u.startsWith('EN')) return 'US'
  if (u.startsWith('TH')) return 'TH'
  if (u.startsWith('VI')) return 'VN'
  if (u.startsWith('ID')) return 'ID'
  if (u.startsWith('MY') || u.startsWith('MS')) return 'MY'
  if (u.startsWith('SG')) return 'SG'
  if (u.startsWith('PH')) return 'PH'
  return u.slice(0, 2) || 'CN'
}

declare global {
  interface Window {
    __API_BASE__?: string
  }
}

/** 调用后端生成智能任务（POST /api/ai/generate-tasks）；body 带 locale/countryCode 供 LLM 按语言回复 */
/** 生成任务接口返回的 metadata 结构 */
export interface GenerateTasksMetadata {
  llmIntelligentCount?: number
  ruleCount?: number
  skippedDuplicateCount?: number
  generatedCount?: number
  llmStatusMessage?: string
  llmStatus?: string
  statsDateRangeUsed?: { dateFrom: string; dateTo: string }
}

export async function generateTasks(params: GenerateTasksParams): Promise<{ message: string; tasks: unknown[]; metadata?: GenerateTasksMetadata }> {
  let locale = params.locale
  if (!locale && typeof window !== 'undefined') {
    try {
      locale = localStorage.getItem('lvbcsym_locale') || undefined
    } catch {
      // ignore
    }
  }
  locale = locale || 'zh-CN'
  const countryCode = params.countryCode || localeToCountryCode(locale)
  const body: Record<string, unknown> = {
    storeId: params.storeId,
    locale,
    countryCode,
  }
  if (params.useStatsFromStoreId) body.useStatsFromStoreId = params.useStatsFromStoreId
  if (params.rawDailyTable?.trim()) body.rawDailyTable = params.rawDailyTable.trim()
  if (params.metricsOverride && typeof params.metricsOverride === 'object') body.metricsOverride = params.metricsOverride
  if (params.userPrompt?.trim()) body.userPrompt = params.userPrompt.trim()
  const data = await api.post('/ai/generate-tasks', body, { timeout: GENERATE_TASKS_TIMEOUT_MS })
  return data as unknown as { message: string; tasks: unknown[]; metadata?: GenerateTasksMetadata }
}

/** 调用后端生成话术/脚本（POST /api/ai/script），长耗时单独超时 */
export async function generateScript(params: GenerateScriptParams): Promise<ScriptLLMResult> {
  const body: Record<string, unknown> = {
    topic: params.productName || params.topic || '直播脚本',
    duration: params.duration ?? 30,
    style: params.style || '专业',
  }
  if (params.productName) body.productName = params.productName
  if (params.productSku) body.productSku = params.productSku
  if (params.price) body.price = params.price
  if (params.features) body.features = params.features
  if (params.targetAudience) body.targetAudience = params.targetAudience
  if (params.scriptType) body.scriptType = params.scriptType
  if (params.language) body.language = params.language
  if (params.promotion_info != null) body.promotion_info = params.promotion_info
  else if (params.promoCopy != null) body.promoCopy = params.promoCopy
  if (params.country) body.country = params.country
  if (params.countryCode) body.countryCode = params.countryCode
  if (params.custom_requirements != null) body.custom_requirements = params.custom_requirements
  else if (params.customRequirements != null) body.custom_requirements = params.customRequirements
  if (params.storeId) body.storeId = params.storeId
  const data = await api.post('/ai/script', body, { timeout: SCRIPT_AND_REPORT_TIMEOUT_MS })
  return data as unknown as ScriptLLMResult
}

/** 流式话术总超时（连接+读取），略大于后端 Coze 流超时（120s），避免完整销售流程在逼单处被前端先断开 */
const SCRIPT_STREAM_TIMEOUT_MS = 135000
/** 非中文时需预留后端翻译时间，延长超时 */
const SCRIPT_STREAM_TIMEOUT_MS_NON_ZH = 180000

/** 流式生成话术（POST /api/ai/script/stream），SSE 推送，支持打字机效果 */
export async function generateScriptStream(
  params: GenerateScriptParams,
  callbacks: {
    onChunk?: (content: string) => void
    onDone?: (script: ScriptLLMResult) => void
    onError?: (message: string) => void
    /** Coze/LLM 超时或失败导致使用模板话术时触发，便于前端提示「已为您切换为模板话术」 */
    onFallback?: (reason: string) => void
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    topic: params.productName || params.topic || '直播脚本',
    duration: params.duration ?? 30,
    style: params.style || '专业',
  }
  if (params.productName) body.productName = params.productName
  if (params.productSku) body.productSku = params.productSku
  if (params.price) body.price = params.price
  if (params.features) body.features = params.features
  if (params.targetAudience) body.targetAudience = params.targetAudience
  if (params.scriptType) body.scriptType = params.scriptType
  if (params.language) body.language = params.language
  if (params.promotion_info != null) body.promotion_info = params.promotion_info
  else if (params.promoCopy != null) body.promoCopy = params.promoCopy
  if (params.country) body.country = params.country
  if (params.countryCode) body.countryCode = params.countryCode
  if (params.custom_requirements != null) body.custom_requirements = params.custom_requirements
  else if (params.customRequirements != null) body.custom_requirements = params.customRequirements
  if (params.storeId) body.storeId = params.storeId

  const token = localStorage.getItem('token')
  const base = (typeof window !== 'undefined' && window.__API_BASE__) || '/api'
  const timeoutMs = params.language && params.language !== 'zh-CN' ? SCRIPT_STREAM_TIMEOUT_MS_NON_ZH : SCRIPT_STREAM_TIMEOUT_MS
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs)
  const clearTimeoutAndRelease = (reader: ReadableStreamDefaultReader<Uint8Array> | null) => {
    clearTimeout(timeoutId)
    if (reader) reader.releaseLock()
  }
  let res: Response
  try {
    res = await fetch(`${base}/ai/script/stream`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch (e: unknown) {
    clearTimeout(timeoutId)
    const error = e as { name?: string; message?: string }
    if (error.name === 'AbortError') {
      callbacks.onError?.('话术生成超时，请稍后重试')
    } else {
      callbacks.onError?.(error.message || '请求失败')
    }
    return
  }
  if (!res.ok) {
    clearTimeout(timeoutId)
    let msg = '请求失败'
    try {
      const errBody = await res.json() as { error?: string }
      if (errBody?.error && typeof errBody.error === 'string') msg = errBody.error
    } catch {
      // 忽略解析失败
    }
    callbacks.onError?.(msg)
    return
  }
  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timeoutId)
    callbacks.onError?.('无法读取流')
    return
  }
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    let done = false
    while (!done) {
      const { done: readDone, value } = await reader.read()
      if (readDone) {
        done = true
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data) as {
            content?: string
            done?: boolean
            script?: ScriptLLMResult
            error?: string
            fallbackReason?: string
          }
          if (parsed.error) {
            callbacks.onError?.(parsed.error)
            return
          }
          if (typeof parsed.content === 'string') callbacks.onChunk?.(parsed.content)
          if (parsed.done && parsed.script) {
            callbacks.onDone?.(parsed.script)
            if (parsed.fallbackReason) callbacks.onFallback?.(parsed.fallbackReason)
          }
        } catch {
          // 忽略单行解析错误
        }
      }
    }
  } catch (e: unknown) {
    const error = e as { name?: string; message?: string }
    if (error.name === 'AbortError') {
      callbacks.onError?.('话术生成超时，请稍后重试')
    } else {
      callbacks.onError?.(error.message || '流式读取失败')
    }
  } finally {
    clearTimeoutAndRelease(reader)
  }
}

export interface ReportResult {
  summary: string
  period?: string
}

export interface MarketAnalysisResult {
  insight: string
}

export interface RecommendationsResult {
  items: unknown[]
}

export interface StoreComparisonResult {
  comparison: unknown[]
}

export interface StatsResult {
  stats: unknown
}

export interface MarketResearchResult {
  research: unknown
}

export interface StoreEfficiencyComparisonResult {
  comparison: unknown[]
}

/** 生成运营报告（后端未实现时返回占位），长耗时单独超时 */
export async function generateReport(params: { storeId: string; period?: string }): Promise<ReportResult> {
  const res = await api
    .post('/ai/report', params, { timeout: SCRIPT_AND_REPORT_TIMEOUT_MS })
    .catch(() => ({ summary: '报告功能待接入', period: params.period }))
  return res as ReportResult
}

/** 市场分析（后端未实现时返回占位） */
export async function analyzeMarket(params: { category?: string; timeframe?: string }): Promise<MarketAnalysisResult> {
  const res = await api
    .post('/ai/analyze-market', params)
    .catch(() => ({ insight: '市场分析功能待接入' }))
  return res as MarketAnalysisResult
}

/** 获取推荐（后端未实现时返回占位） */
export async function getRecommendations(params: { storeId: string; count?: number }): Promise<RecommendationsResult> {
  const res = await api
    .post('/ai/recommendations', params)
    .catch(() => ({ items: [] as unknown[] }))
  return res as RecommendationsResult
}

/** 店铺对比（后端未实现时返回占位） */
export async function compareStores(params: { storeIds: string[] }): Promise<StoreComparisonResult> {
  const res = await api
    .post('/ai/compare-stores', params)
    .catch(() => ({ comparison: [] as unknown[] }))
  return res as StoreComparisonResult
}

/** 生成统计（后端未实现时返回占位） */
export async function generateStats(params: { storeId: string; period?: string }): Promise<StatsResult> {
  const res = await api
    .post('/ai/stats', params)
    .catch(() => ({ stats: {} as unknown }))
  return res as StatsResult
}

/** 市场调研（后端未实现时返回占位） */
export async function marketResearch(params: { category?: string }): Promise<MarketResearchResult> {
  const res = await api
    .post('/ai/market-research', params)
    .catch(() => ({ research: {} as unknown }))
  return res as MarketResearchResult
}

/** 店铺效率对比（后端未实现时返回占位） */
export async function compareStoreEfficiency(params: { storeIds: string[] }): Promise<StoreEfficiencyComparisonResult> {
  const res = await api
    .post('/ai/compare-efficiency', params)
    .catch(() => ({ comparison: [] as unknown[] }))
  return res as StoreEfficiencyComparisonResult
}

/** 长文本翻译（话术等）超时：话术可能很长，后端会分批调 Google，需足够时间 */
const TRANSLATE_LONG_TIMEOUT_MS = 120000

/** 长文本翻译（话术等），用于界面语言非中文时展示翻译后的内容。POST /api/translate/long */
export async function translateLongTextForDisplay(
  text: string,
  targetLang: string,
  sourceLang: string = 'zh-CN'
): Promise<string> {
  try {
    const res = await api.post<{ translatedText: string }>(
      '/translate/long',
      { text, targetLang, sourceLang },
      { timeout: TRANSLATE_LONG_TIMEOUT_MS }
    )
    return (res as { translatedText?: string })?.translatedText ?? text
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } }; message?: string }
    const msg = error.response?.data?.error ?? error.message ?? 'Translation failed'
    type ErrorWithResponse = Error & { response?: { data?: { error?: string } } }
    const e: ErrorWithResponse = new Error(msg)
    e.response = error.response
    throw e
  }
}
