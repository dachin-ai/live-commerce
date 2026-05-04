/**
 * AI 智能待办生成器模块
 * 负责：LLM 调用封装、JSON 解析修复、角色/工具自动标注、主生成函数
 * 原属 aiTasksService.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { dbGet, dbAll } from '../../db'
import { callLLMOnce } from '../scriptLLM'
import { getLLMConfigForFeature, getEffectiveToolConfigForUser } from '../llmTools'
import {
  TODO_STATS_DAYS,
  toStr,
  getPeriodDateRange,
  getPeriodDateRangeFromEnd,
  getStoreLatestStatsDate,
  aggregateStatsForRange,
  getRawDailyStatsForLLM,
  getYearOverYearStats,
  getMonthOverMonthStats,
  analyzeTrend,
  detectAnomalies,
  getDynamicThresholds,
  Anomaly,
} from './statsAnalysis'
import {
  getStoreStage,
  generateStageBasedTasks,
  generateComparisonTasks,
  STAGE_LLM_HINT,
} from './dataBenchmarks'
import {
  getUpcomingEvents,
  getTimeContext,
  EventDef,
} from './eventsCalendar'
import { matchRoleAndFeature } from '../../config/featureKeywords'
import {
  TODO_SYSTEM_PROMPT_TEMPLATE,
  TODO_USER_MESSAGE_TEMPLATE,
  ANOMALY_SYSTEM_PROMPT_TEMPLATE,
  ANOMALY_USER_MESSAGE_TEMPLATE,
  renderTemplate,
} from '../../config/prompts'

// ==================== 类型定义 ====================

export type LLMAnomalyTask = { title: string; description: string; priority: string }

export type IntelligentTodoItem = {
  title: string
  description: string
  priority: string
  aiFeature?: string
  assignedRole?: string
  estimatedDays?: string | null
  category?: string | null
  responsible?: string | null
}

export type IntelligentTodosLLMResult = { tasks: IntelligentTodoItem[]; llmEmptyReason?: string }

export const TEMPERATURE_INPUT_FOR_LLM = '【气温待办维度】结合上述国家/区域与当前气温带，按 Coze 内置逻辑生成相关待办。'

// ==================== 日志工具 ====================

export function appendGenerateTasksLog(line: string): void {
  try {
    const logPath = path.join(__dirname, '..', '..', '..', 'generate-tasks.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // ignore
  }
}

// ==================== locale 转换 ====================

export function localeToCountryCode(locale: string | undefined): string {
  if (!locale) return 'CN'
  const u = (locale || '').toUpperCase()
  if (u.startsWith('ZH')) return 'CN'
  if (u.startsWith('EN')) return 'US'
  if (u.startsWith('TH')) return 'TH'
  if (u.startsWith('VI')) return 'VN'
  if (u.startsWith('ID')) return 'ID'
  if (u.startsWith('MY')) return 'MY'
  if (u.startsWith('MS')) return 'MY'
  if (u.startsWith('SG')) return 'SG'
  if (u.startsWith('PH')) return 'PH'
  return u.slice(0, 2) || 'CN'
}

// ==================== 角色 & 工具自动标注 ====================

export function stripToolsSectionFromDescription(desc: string): string {
  if (!desc || !desc.includes('【工具】')) return desc
  return desc
    .replace(/\n*【工具】[^\n]*(?:\n(?!【)[^\n]*)*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function llmTasksCoverEvent(titles: string[]): boolean {
  const eventKeywords = /节日|倒计时|备货|大促|春节|618|双11|双12|宋干|水灯/
  return titles.some((t) => eventKeywords.test(t))
}

export function llmTasksCoverShortVideo(titles: string[]): boolean {
  return titles.some((t) => /短视频|引流|发布.*视频|视频.*引流/.test(t))
}

/**
 * 角色 & AI 功能自动标注 — 委托给 config/featureKeywords.ts 集中管理。
 * 保留此函数签名以兼容所有调用方。
 */
export function autoTagTaskRoleAndTool(title: string, description: string): { assignedRole: string | undefined; aiFeature: string | undefined } {
  return matchRoleAndFeature(title, description)
}

// ==================== JSON 解析修复工具 ====================

export function extractTasksJsonFromText(text: string): string | null {
  let work = text
  const codeBlockMatch = work.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    const inner = codeBlockMatch[1].trim()
    if (inner.startsWith('{') || inner.startsWith('[')) work = inner
  }

  let start = work.indexOf('{"tasks"')
  if (start < 0) start = work.indexOf('{"tasks":')
  if (start < 0) start = work.indexOf('{tasks:')
  if (start < 0) start = work.indexOf('{ tasks:')
  if (start < 0) start = work.indexOf('{ "tasks"')

  if (start < 0) {
    const idx = work.indexOf('"tasks"')
    if (idx >= 0) start = work.lastIndexOf('{', idx)
  }

  if (start < 0) {
    const arrayStart = work.indexOf('[{')
    if (arrayStart >= 0 && (work.indexOf('"title"') > arrayStart || work.indexOf('"task"') > arrayStart)) {
      const extracted = extractBalancedBracket(work, arrayStart, '[', ']')
      if (extracted) return `{"tasks":${extracted}}`
    }
    return null
  }

  const extracted = extractBalancedBracket(work, start, '{', '}')
  return extracted
}

export function sanitizeTasksJson(jsonStr: string): string {
  let s = jsonStr
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/\r\n/g, '\n')
    .trim()
  s = s.replace(/"title([^"]+)",\s*"(description|priority)"/g, (_m, val, key) => `"title":"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}","${key}"`)
  s = s.replace(/"priority(urgent|normal)"(\s*[,}\]])/g, '"priority":"$1"$2')
  return s
}

function isStructuralCloseQuoteForTasksJson(s: string, pos: number): boolean {
  let j = pos + 1
  while (j < s.length && /\s/.test(s[j])) j++
  if (j < s.length && s[j] === '}') return true
  if (j >= s.length || s[j] !== ',') return false
  j++
  while (j < s.length && /\s/.test(s[j])) j++
  if (j >= s.length || s[j] !== '"') return false
  j++
  const rest = s.slice(j)
  return /^(priority|title|description|task|expected_outcome|name|content|level|importance|action_steps)"/.test(rest)
}

const TASK_JSON_STRING_FIELD_PREFIXES = [
  '"title":"',
  '"description":"',
  '"task":"',
  '"expected_outcome":"',
  '"content":"',
  '"name":"',
] as const

export function repairUnescapedQuotesInTaskStringValues(jsonStr: string): string {
  let out = ''
  let i = 0
  while (i < jsonStr.length) {
    let matched = false
    for (const prefix of TASK_JSON_STRING_FIELD_PREFIXES) {
      if (jsonStr.startsWith(prefix, i)) {
        out += prefix
        i += prefix.length
        while (i < jsonStr.length) {
          const c = jsonStr[i]
          if (c === '\\' && i + 1 < jsonStr.length) {
            out += c + jsonStr[i + 1]
            i += 2
            continue
          }
          if (c === '"') {
            if (isStructuralCloseQuoteForTasksJson(jsonStr, i)) {
              out += '"'
              i++
              break
            }
            out += '\\"'
            i++
            continue
          }
          out += c
          i++
        }
        matched = true
        break
      }
    }
    if (!matched) {
      out += jsonStr[i]
      i++
    }
  }
  return out
}

export function extractBalancedBracket(text: string, start: number, openChar: string, closeChar: string): string | null {
  let depth = 0
  let inString = false
  let escape = false
  let quote = ''

  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\' && inString) {
      escape = true
      continue
    }
    if (!inString) {
      if (c === openChar) depth += 1
      else if (c === closeChar) {
        depth -= 1
        if (depth === 0) return text.slice(start, i + 1)
      } else if (c === '"' || c === "'") {
        inString = true
        quote = c
      }
      continue
    }
    if (c === quote) inString = false
  }
  return null
}

// ==================== LLM 异常分析 ====================

export async function analyzeAnomaliesWithLLM(
  anomalies: Anomaly[],
  storeInfo: any,
  currentStats: any,
  storeCategories: string[] = [],
  llmConfig?: { url: string; apiKey: string; model?: string },
  locale: string = 'zh-CN',
  countryCode: string = 'CN'
): Promise<LLMAnomalyTask[]> {
  const storeName = storeInfo?.name || '当前店铺'
  const storePlatform = storeInfo?.platform || ''
  const categories = Array.isArray(storeCategories) && storeCategories.length > 0
    ? storeCategories.join('、')
    : ''
  const anomalyLines = anomalies
    .map(
      (a) =>
        `- ${a.metric}：当前 ${a.currentValue.toFixed(2)}，预期约 ${a.expectedValue.toFixed(2)}，${a.description}`
    )
    .join('\n')
  const statsLine =
    currentStats != null
      ? `当前数据：GMV ${currentStats.totalGMV ?? 0}，观看 ${currentStats.totalViewers ?? 0}，订单 ${currentStats.totalOrders ?? 0}，转化率 ${(currentStats.totalViewers > 0 ? (currentStats.totalOrders / currentStats.totalViewers) * 100 : 0).toFixed(2)}%。`
      : ''

  const systemPrompt = renderTemplate(ANOMALY_SYSTEM_PROMPT_TEMPLATE, { locale, countryCode })

  const userMessage = renderTemplate(ANOMALY_USER_MESSAGE_TEMPLATE, {
    locale,
    countryCode,
    storeName,
    platformSuffix: storePlatform ? `（${storePlatform}）` : '',
    categoriesSuffix: categories ? `，类目：${categories}` : '',
    statsLine,
    anomalyLines,
  })

  const raw = await callLLMOnce({
    systemPrompt,
    userMessage,
    temperature: 0.4,
    taskType: 'todo',
    config: llmConfig,
  })
  if (!raw || !raw.trim()) return []

  let text = raw.trim()
  const jsonMatch = text.match(/\{[\s\S]*"tasks"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { tasks?: Array<{ title?: string; description?: string; priority?: string }> }
      const list = parsed?.tasks
      if (Array.isArray(list) && list.length > 0) {
        return list
          .slice(0, 5)
          .filter((t) => t && (t.title || t.description))
          .map((t) => ({
            title: String(t.title || 'LLM 建议任务').slice(0, 80),
            description: String(t.description || '').slice(0, 500),
            priority: t.priority === 'urgent' ? 'urgent' : 'normal',
          }))
      }
    } catch {
      // 继续尝试行解析
    }
  }

  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const result: LLMAnomalyTask[] = []
  for (const line of lines) {
    const pipe = line.indexOf('|')
    const colon = line.indexOf('：') >= 0 ? line.indexOf('：') : line.indexOf(':')
    if (pipe >= 0) {
      const title = line.slice(0, pipe).trim().slice(0, 80)
      const description = line.slice(pipe + 1).trim().slice(0, 500)
      if (title) result.push({ title, description, priority: 'normal' })
    } else if (colon >= 0) {
      const title = line.slice(0, colon).trim().replace(/^[#\d、.-]+/, '').slice(0, 80)
      const description = line.slice(colon + 1).trim().slice(0, 500)
      if (title) result.push({ title, description, priority: 'normal' })
    }
    if (result.length >= 3) break
  }
  return result
}

// ==================== 核心：LLM 待办生成 ====================

export async function generateIntelligentTodosWithLLM(params: {
  storeInfo: any
  storeCategories: string[]
  currentStats: any
  historicalStats: any
  timeContext: ReturnType<typeof getTimeContext>
  upcomingEvents: Array<{ name: string; date: string; daysUntil: number; recommendation: string }>
  storeStage: ReturnType<typeof getStoreStage>
  trendAnalysis: { trend: string; description: string } | null
  anomaliesSummary: string
  existingTaskTitles?: string[]
  rawDailyStatsText?: string
  additionalUserPrompt?: string
  llmConfig?: { url: string; apiKey: string; model?: string }
  locale?: string
  countryCode?: string
}): Promise<IntelligentTodosLLMResult> {
  const {
    storeInfo,
    storeCategories,
    currentStats,
    historicalStats,
    timeContext,
    upcomingEvents,
    storeStage,
    trendAnalysis,
    anomaliesSummary,
    existingTaskTitles = [],
    rawDailyStatsText,
    additionalUserPrompt,
    llmConfig,
    locale: paramLocale = 'zh-CN',
    countryCode: paramCountryCode,
  } = params
  const locale = (paramLocale || 'zh-CN').trim() || 'zh-CN'
  const countryCode = (paramCountryCode || localeToCountryCode(locale)).toUpperCase()

  const storeName = storeInfo?.name || '当前店铺'
  const storePlatform = storeInfo?.platform || ''
  const region = storeInfo?.region || 'CN'
  const categories = storeCategories.length > 0 ? storeCategories.join('、') : '未指定'
  const targetAudience = storeInfo?.targetAudience?.trim() || ''
  const brandPositioning = storeInfo?.brandPositioning?.trim() || ''
  const brandStrategy = storeInfo?.brandStrategy?.trim() || ''
  const minPrice = storeInfo?.minPrice != null ? Number(storeInfo.minPrice) : null
  const maxPrice = storeInfo?.maxPrice != null ? Number(storeInfo.maxPrice) : null
  const currencySymbol = storeInfo?.currencySymbol ?? '¥'
  const currencyName = region === '泰国' || region === 'TH' ? '泰铢' : region === '越南' || region === 'VN' ? '越南盾' : region === '印度尼西亚' || region === 'ID' ? '印尼盾' : region === '马来西亚' || region === 'MY' ? '马币' : region === '新加坡' || region === 'SG' ? '新币' : region === '菲律宾' || region === 'PH' ? '比索' : '人民币'
  const priceRange =
    minPrice != null && maxPrice != null
      ? `${currencySymbol}${minPrice}～${maxPrice}`
      : minPrice != null
        ? `${currencySymbol}${minPrice}起`
        : maxPrice != null
          ? `至${currencySymbol}${maxPrice}`
          : '未设'
  const storeDescription = storeInfo?.description?.trim() || ''
  const gmv = currentStats?.totalGMV ?? 0
  const duration = currentStats?.totalDuration ?? 0
  const viewers = currentStats?.totalViewers ?? 0
  const orders = currentStats?.totalOrders ?? 0
  const interactions = currentStats?.totalInteractions ?? 0
  const conversionRate = viewers > 0 ? (orders / viewers) * 100 : 0
  const interactionRate = viewers > 0 ? (interactions / viewers) * 100 : 0
  const gmvPerHour = duration > 0 ? gmv / duration : 0
  const hasHistory = (historicalStats?.avgGMV ?? 0) > 0 || (historicalStats?.avgViewers ?? 0) > 0
  const gmvChange = hasHistory && historicalStats.avgGMV > 0 ? ((gmv - historicalStats.avgGMV) / historicalStats.avgGMV * 100) : null
  const convChange = hasHistory && historicalStats.avgConversionRate > 0 ? (conversionRate - historicalStats.avgConversionRate) : null

  const eventsShort =
    upcomingEvents.length > 0
      ? upcomingEvents
          .slice(0, 3)
          .map((e) => `${e.name}${e.daysUntil}天后`)
          .join('、')
      : '无'

  const attrs: string[] = []
  if (targetAudience) attrs.push(`目标人群：${targetAudience}`)
  if (brandPositioning) attrs.push(`品牌定位：${brandPositioning}`)
  attrs.push(`价格区间：${priceRange}`)
  if (brandStrategy) attrs.push(`品牌策略：${brandStrategy.slice(0, 200)}${brandStrategy.length > 200 ? '…' : ''}`)
  if (storeDescription) attrs.push(`店铺说明：${storeDescription.slice(0, 150)}${storeDescription.length > 150 ? '…' : ''}`)
  const storeAttrsBlock = attrs.length > 0 ? `\n【店铺属性】${attrs.join(' | ')}\n` : '\n'

  const rawDataBlock = rawDailyStatsText?.trim()
    ? `\n【按日明细】请基于下表分析趋势与规律：\n\`\`\`\n${rawDailyStatsText.trim()}\n\`\`\`\n`
    : ''

  const historicalBlock = hasHistory
    ? gmvChange !== null && convChange !== null
      ? `前期平均 GMV ${historicalStats.avgGMV?.toFixed(0) ?? 0} ${currencyName}（本期${gmvChange > 0 ? '增长' : '下降'} ${Math.abs(gmvChange).toFixed(1)}%） | 平均转化 ${historicalStats.avgConversionRate?.toFixed(1) ?? 0}%（本期${convChange > 0 ? '提升' : '下降'} ${Math.abs(convChange).toFixed(1)}个百分点）`
      : `前期平均 GMV ${historicalStats.avgGMV?.toFixed(0) ?? 0} ${currencyName} | 平均转化 ${historicalStats.avgConversionRate?.toFixed(1) ?? 0}%`
    : `无历史数据，仅基于最近30天（首次生成或新店铺）`

  const systemPrompt = renderTemplate(TODO_SYSTEM_PROMPT_TEMPLATE, { locale, countryCode })

  const days = 30
  const completedOrders = Number(currentStats?.totalCompletedOrders ?? 0) || 0
  const likes = Number(currentStats?.totalLikes ?? 0) || 0
  const comments = Number(currentStats?.totalComments ?? 0) || 0
  const shares = Number(currentStats?.totalShares ?? 0) || 0
  const follows = Number(currentStats?.totalFollows ?? 0) || 0
  const productViews = Number(currentStats?.totalProductViews ?? 0) || 0
  const productClicks = Number(currentStats?.totalProductClicks ?? 0) || 0

  const storeDataObj = {
    conversion_rate: Number(conversionRate.toFixed(2)),
    daily_views: Math.round(Number(viewers) / days) || 0,
    avg_order_value: orders > 0 ? Number((gmv / orders).toFixed(2)) : 0,
    daily_orders: Number((orders / days).toFixed(1)),
    live_duration_hours: Number(duration.toFixed(1)),
    weekly_sessions: Number(currentStats?.totalRounds ?? 0) > 0 ? Math.round(Number(currentStats.totalRounds) / 4) : 0,
    platform: storePlatform || '未知平台',
    country: region || '中国',
    store_name: storeName,
    categories,
    currency: currencyName,
    existing_tasks: existingTaskTitles.slice(0, 10),
    total_interactions: Number(interactions) || 0,
    interaction_rate: Number(interactionRate.toFixed(2)) || 0,
    total_likes: likes,
    total_comments: comments,
    total_shares: shares,
    total_follows: follows,
    total_product_views: productViews,
    total_product_clicks: productClicks,
    completed_orders: completedOrders,
  }
  const storeDataJson = JSON.stringify(storeDataObj)
  const storeAttributesStr = attrs.length > 0 ? attrs.join(' | ') : ''
  const rawDailyTableStr = rawDailyStatsText?.trim() ?? ''

  const userMessage = renderTemplate(TODO_USER_MESSAGE_TEMPLATE, {
    storeDataJson,
    storeAttributesStr,
    rawDailyTableStr,
    locale,
    countryCode,
    storeName,
    storePlatform: storePlatform || '未填',
    region,
    categories,
    storeAttrsLine: storeAttrsBlock.trim() ? `\n- 其他属性：${attrs.join(' | ')}` : '',
    orders: String(orders),
    completedOrders: String(completedOrders),
    viewers: String(viewers),
    interactions: String(interactions),
    likes: String(likes),
    comments: String(comments),
    shares: String(shares),
    follows: String(follows),
    interactionRate: interactionRate.toFixed(2),
    productViews: String(productViews),
    productClicks: String(productClicks),
    gmv: gmv.toFixed(2),
    currencyName,
    conversionRate: conversionRate.toFixed(2),
    duration: duration.toFixed(1),
    gmvPerHour: gmvPerHour.toFixed(0),
    historicalBlock,
    rawDataBlock,
    existingTasksLine: existingTaskTitles.length > 0 ? `\n- 已有待办（避免重复）：${existingTaskTitles.slice(0, 10).join('；')}${existingTaskTitles.length > 10 ? '…' : ''}` : '',
    additionalPromptLine: additionalUserPrompt?.trim() ? `\n- 用户补充：${additionalUserPrompt.trim().slice(0, 300)}` : '',
  })

  // 重试由底层 scriptLLM.ts COZE_MAX_RETRIES 统一管理，业务层单次调用
  const todoStreamTimeoutMs = Number(process.env.COZE_TODO_TIMEOUT_MS) || 120000
  const raw = await callLLMOnce({
    systemPrompt,
    userMessage,
    temperature: existingTaskTitles.length > 0 ? 0.75 : 0.6,
    maxTokens: 3000,
    taskType: 'todo',
    timeoutMs: todoStreamTimeoutMs,
    config: llmConfig,
  })
  if (!raw || !raw.trim()) {
    const reason = 'Coze/LLM 调用返回空（可能超时、流式未产出或未配置），详见 coze-debug.log'
    console.warn('[待办生成]', reason)
    appendGenerateTasksLog(`[待办生成] ${reason}，将走规则兜底`)
    return { tasks: [], llmEmptyReason: reason }
  }

  let text = raw.trim()
  const jsonStr = extractTasksJsonFromText(text)
  if (!jsonStr) {
    const preview = text.slice(0, 200).replace(/\n/g, ' ')
    const reason = `Coze 返回了约 ${text.length} 字，但未包含合法 JSON 对象。返回前 200 字: ${preview}`
    console.warn('[待办生成]', reason)
    appendGenerateTasksLog(`[待办生成] LLM 未返回合法 JSON`)
    return { tasks: [], llmEmptyReason: reason }
  }

  const parsePayload = (str: string) => {
    return JSON.parse(str) as {
      tasks?: Array<{
        title?: string
        task_name?: string
        description?: string
        priority?: string
        task?: string
        expected_outcome?: string
        action_steps?: string[]
        name?: string
        content?: string
        level?: string
        importance?: string
        estimated_days?: string
        estimatedDays?: string
        estimated_time?: string
        category?: string
        responsible?: string
      }>
    }
  }

  /** 按优先级依次尝试修复并解析，返回首个成功结果与修复等级（0=无修复，1~3=修复程度） */
  const tryParseWithRepair = (str: string): { parsed: ReturnType<typeof parsePayload>; repairLevel: 0 | 1 | 2 | 3 } => {
    try {
      return { parsed: parsePayload(str), repairLevel: 0 }
    } catch { /* 尝试下一级 */ }
    try {
      return { parsed: parsePayload(sanitizeTasksJson(str)), repairLevel: 1 }
    } catch { /* 尝试下一级 */ }
    try {
      return { parsed: parsePayload(repairUnescapedQuotesInTaskStringValues(str)), repairLevel: 2 }
    } catch { /* 尝试最终修复 */ }
    // 最终组合修复：可能抛出，由外层 catch 处理
    return { parsed: parsePayload(repairUnescapedQuotesInTaskStringValues(sanitizeTasksJson(str))), repairLevel: 3 }
  }

  try {
    const { parsed, repairLevel } = tryParseWithRepair(jsonStr)
    if (repairLevel > 0) {
      appendGenerateTasksLog(`[待办生成] JSON 修复等级 ${repairLevel}（1=sanitize, 2=unescapeQuotes, 3=combined），建议检查 LLM 输出格式`)
    }
    const list = parsed?.tasks
    if (!Array.isArray(list) || list.length === 0) {
      const reason = 'Coze 返回的 JSON 中 tasks 为空或非数组'
      console.warn('[待办生成]', reason)
      appendGenerateTasksLog('[待办生成] LLM 返回 tasks 为空或非数组，将走规则兜底')
      return { tasks: [], llmEmptyReason: reason }
    }
    const seenExact = new Set<string>()
    const tasks = list
      .filter((t) => {
        if (!t) return false
        const titleRaw = (t.title ?? t.task_name ?? t.task ?? t.name ?? t.content ?? t.description ?? '').trim()
        return !!titleRaw
      })
      .map((t) => {
        const titleStr = String(t.title ?? t.task_name ?? t.task ?? t.name ?? t.content ?? '智能建议任务').trim().slice(0, 200)
        const descParts: string[] = []
        if (t.description && String(t.description).trim()) descParts.push(String(t.description).trim())
        if (t.expected_outcome && String(t.expected_outcome).trim()) descParts.push(String(t.expected_outcome).trim())
        if (t.content && t.content !== titleStr && String(t.content).trim()) descParts.push(String(t.content).trim())
        if (Array.isArray(t.action_steps) && t.action_steps.length > 0) {
          const steps = t.action_steps.map((s) => String(s).trim()).filter(Boolean)
          if (steps.length > 0) descParts.push(steps.join('\n'))
        }
        const description = descParts.length > 0 ? descParts.join('\n').trim().slice(0, 8000) : ''
        const priorityRaw = (t.priority ?? t.level ?? t.importance ?? '').toString().toLowerCase()
        const priority =
          priorityRaw === 'urgent' || priorityRaw === 'high' || priorityRaw === 'critical' || priorityRaw === '高' ? 'urgent' : 'normal'
        const tags = autoTagTaskRoleAndTool(titleStr, description)
        const estRaw = t.estimated_days ?? t.estimatedDays ?? t.estimated_time
        const estimatedDays =
          estRaw != null && String(estRaw).trim() ? String(estRaw).trim().slice(0, 64) : null
        const category =
          t.category != null && String(t.category).trim() ? String(t.category).trim().slice(0, 64) : null
        const responsible =
          t.responsible != null && String(t.responsible).trim() ? String(t.responsible).trim().slice(0, 128) : null
        return {
          title: titleStr,
          description,
          priority,
          assignedRole: tags.assignedRole,
          aiFeature: tags.aiFeature,
          estimatedDays,
          category,
          responsible,
        }
      })
      .filter((t) => {
        const key = `${t.title}\n${t.description}`.trim()
        if (!key) return false
        if (seenExact.has(key)) return false
        seenExact.add(key)
        return true
      })
    return { tasks }
  } catch (e) {
    const errMsg = (e as Error)?.message ?? ''
    const reason = `Coze 返回的 JSON 解析失败: ${errMsg}`
    console.warn('[待办生成]', reason)
    appendGenerateTasksLog(`[待办生成] LLM JSON 解析失败（所有修复策略均失败）: ${errMsg}`)
    return { tasks: [], llmEmptyReason: reason }
  }
}

// ==================== 主函数：为店铺生成待办建议 ====================

export async function generateSuggestedTodosForStore(
  storeId: string,
  options?: {
    metricsOverride?: Record<string, unknown>
    rawDailyOverride?: string
    additionalUserPrompt?: string
    llmConfig?: { url: string; apiKey: string; model?: string }
    useStatsFromStoreId?: string
    locale?: string
    countryCode?: string
    weekStart?: string
  }
): Promise<{
  tasks: Array<{
    title: string
    description: string
    priority: string
    source?: string
    aiFeature?: string
    assignedRole?: string
    estimatedDays?: string | null
    category?: string | null
    responsible?: string | null
  }>
  llmEmptyReason?: string
  statsDateRangeUsed?: { dateFrom: string; dateTo: string }
  statsDateRangeReason?: string
}> {
  const store = await dbGet<Record<string, unknown>>('SELECT * FROM stores WHERE id = ?', [storeId])
  if (!store) return { tasks: [] }

  let llmEmptyReason: string | undefined

  const cats = await dbAll<{ name: string }>(
    `SELECT c.name FROM categories c INNER JOIN store_categories sc ON c.id = sc.categoryId WHERE sc.storeId = ?`,
    [storeId]
  )
  const storeCategories = (cats || []).map((r) => r.name)
  const region: string = (store.region != null && typeof store.region === 'string' ? store.region : '中国')

  const pendingRows = await dbAll<{ title: string }>(
    "SELECT title FROM tasks WHERE storeId = ? AND status = 'pending'",
    [storeId]
  )
  const existingTaskTitles = (pendingRows || []).map((r) => (r.title || '').trim()).filter(Boolean)
  const storeInfo = {
    name: (store.name && String(store.name)) || `店铺-${storeId}`,
    platform: (store.platform && String(store.platform)) || '未知平台',
    region,
    targetAudience: (store.targetAudience && String(store.targetAudience)) || '',
    brandPositioning: (store.brandPositioning && String(store.brandPositioning)) || '',
    brandStrategy: (store.brandStrategy != null && typeof store.brandStrategy === 'string' ? store.brandStrategy : '') || '',
    description: (store.description != null && typeof store.description === 'string' ? store.description : '') || '',
    minPrice: store.minPrice != null ? Number(store.minPrice) : null,
    maxPrice: store.maxPrice != null ? Number(store.maxPrice) : null,
    currencySymbol: (store.currencySymbol && String(store.currencySymbol).slice(0, 1)) || '¥',
  }

  const uploadTask = {
    title: '请上传最近30天的运营数据',
    description: '上传后系统将基于数据自动生成运营建议与待办。',
    priority: 'urgent' as const,
    assignedRole: 'operator' as const,
    aiFeature: undefined as string | undefined,
  }
  const existingTitleSet = new Set(existingTaskTitles)
  type ResultItem = {
    title: string
    description: string
    priority: string
    source?: string
    aiFeature?: string
    assignedRole?: string
    estimatedDays?: string | null
    category?: string | null
    responsible?: string | null
  }
  let result: ResultItem[] = []

  const dedup = (list: ResultItem[]) => {
    const seenExact = new Set<string>()
    return list
      .filter((t) => {
        const title = (t.title || '').trim()
        const desc = (t.description || '').trim()
        if (!title) return false
        if (existingTitleSet.has(title) && !desc) return false
        const key = `${title}\n${desc}`.trim()
        if (seenExact.has(key)) return false
        seenExact.add(key)
        return true
      })
      .map((t) => {
        if (!t.assignedRole || !t.aiFeature) {
          const tags = autoTagTaskRoleAndTool(t.title, t.description)
          return {
            ...t,
            assignedRole: t.assignedRole || tags.assignedRole,
            aiFeature: t.aiFeature || tags.aiFeature
          }
        }
        return t
      })
  }

  const computeEndDate = () => {
    const ws = options?.weekStart
    if (ws && typeof ws === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ws.trim())) {
      const d = new Date(`${ws.trim()}T00:00:00.000Z`)
      if (isNaN(d.getTime())) {
        console.warn(`[generateSuggestedTodosForStore] 无效 weekStart: "${ws}"，已回退到当前日期`)
        appendGenerateTasksLog(`[generateSuggestedTodosForStore] 无效 weekStart "${ws}"，回退到今日`)
        return toStr(new Date())
      }
      d.setUTCDate(d.getUTCDate() + 6)
      return toStr(d)
    }
    return toStr(new Date())
  }
  const anchorEndDate = computeEndDate()
  let statsDateRangeUsed: { dateFrom: string; dateTo: string } | undefined
  let statsDateRangeReason: string | undefined

  const strictRange = getPeriodDateRangeFromEnd(anchorEndDate, 0)
  statsDateRangeUsed = strictRange
  const strictAgg = await aggregateStatsForRange(storeId, strictRange.dateFrom, strictRange.dateTo)
  const hasDataInStrict30 =
    !!strictAgg &&
    (strictAgg.totalViewers > 0 || strictAgg.totalGMV > 0 || strictAgg.totalOrders > 0 || strictAgg.totalDuration > 0)

  // ─── 内联辅助：LLM-调用 → stage-fallback → 比较任务 → dedup（两条 DB 分支共用） ───
  type LLMPipelineInput = {
    currentStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number }
    historicalStats: { avgGMV: number; avgViewers: number; avgConversionRate: number; avgDuration: number; avgOrders: number; avgInteractions: number; avgGMVPerHour: number; avgInteractionRate: number; avgAOV: number }
    rawDailyStatsText: string | undefined
    refDate: string
    dataRange: { dateFrom: string; dateTo: string }
  }
  const runLLMPipeline = async (p: LLMPipelineInput): Promise<{ tasks: ResultItem[]; emptyReason?: string }> => {
    const timeContext = getTimeContext(region)
    const upcomingEvents = getUpcomingEvents(region, new Date(`${p.refDate}T00:00:00.000Z`))
    const storeStage = getStoreStage(p.currentStats.totalGMV, p.currentStats.totalDuration, Math.max(1, Math.floor(p.currentStats.totalOrders / 10)))
    const llmResult = await generateIntelligentTodosWithLLM({
      storeInfo, storeCategories, currentStats: p.currentStats, historicalStats: p.historicalStats,
      timeContext, upcomingEvents, storeStage, trendAnalysis: null, anomaliesSummary: '',
      existingTaskTitles, rawDailyStatsText: p.rawDailyStatsText,
      additionalUserPrompt: options?.additionalUserPrompt, llmConfig: options?.llmConfig,
      locale: options?.locale, countryCode: options?.countryCode,
    })
    let pTasks: ResultItem[] = llmResult.tasks as ResultItem[]
    const pEmptyReason = llmResult.llmEmptyReason
    if (pTasks.length === 0) {
      const statsCountRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM stats WHERE storeId = ?', [storeId])
      const stageTasks = generateStageBasedTasks(storeStage, storeInfo, p.currentStats, statsCountRow?.c ?? 0)
      pTasks = stageTasks.map(t => ({ title: t.title, description: t.description, priority: t.priority, source: 'stage', aiFeature: t.aiFeature })) as ResultItem[]
    } else {
      pTasks = pTasks.map(t => ({ ...t, source: 'llm_intelligent' })) as ResultItem[]
    }
    const yoyStats = await getYearOverYearStats(storeId, p.dataRange.dateFrom, p.dataRange.dateTo)
    const momStats = await getMonthOverMonthStats(storeId, p.dataRange.dateFrom, p.dataRange.dateTo)
    const cmpTasks = generateComparisonTasks(p.currentStats, yoyStats, momStats, storeInfo)
    if (cmpTasks.length > 0) pTasks.push(...cmpTasks.map(t => ({ ...t, aiFeature: 'comparison' as const })))
    return { tasks: dedup(pTasks), emptyReason: pTasks.every(t => t.source !== 'llm_intelligent') ? pEmptyReason : undefined }
  }

  if (hasDataInStrict30) {
    const currentRange = strictRange
    const prevRange = getPeriodDateRangeFromEnd(anchorEndDate, 1)
    const rawFromDb = await getRawDailyStatsForLLM(storeId, currentRange.dateFrom, currentRange.dateTo)
    const rawRaw = options?.rawDailyOverride ?? rawFromDb
    const rawDailyStatsText = rawRaw && String(rawRaw).trim() ? String(rawRaw) : undefined
    const currentAgg = strictAgg
    const prevAgg = await aggregateStatsForRange(storeId, prevRange.dateFrom, prevRange.dateTo)
    const metrics = options?.metricsOverride || {}
    const cur = currentAgg || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 }
    const prev = prevAgg || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 }
    const currentStats = {
      totalGMV: Number((metrics as any).total_revenue) || cur.totalGMV,
      totalDuration: cur.totalDuration || 1,
      totalViewers: Number((metrics as any).total_viewers) || cur.totalViewers,
      totalOrders: Number((metrics as any).total_orders) || cur.totalOrders,
      totalInteractions: cur.totalInteractions || 0,
    }
    const historicalStats = {
      avgGMV: prev.totalGMV,
      avgViewers: prev.totalViewers,
      avgConversionRate: prev.totalViewers > 0 ? (prev.totalOrders / prev.totalViewers) * 100 : 0,
      avgDuration: prev.totalDuration,
      avgOrders: prev.totalOrders,
      avgInteractions: prev.totalInteractions,
      avgGMVPerHour: prev.totalDuration > 0 ? prev.totalGMV / prev.totalDuration : 0,
      avgInteractionRate: prev.totalViewers > 0 ? (prev.totalInteractions / prev.totalViewers) * 100 : 0,
      avgAOV: prev.totalOrders > 0 ? prev.totalGMV / prev.totalOrders : 0,
    }

    const pipelineResult1 = await runLLMPipeline({ currentStats, historicalStats, rawDailyStatsText, refDate: anchorEndDate, dataRange: currentRange })
    if (pipelineResult1.emptyReason) llmEmptyReason = pipelineResult1.emptyReason
    result = pipelineResult1.tasks
  } else {
    // 2a）无 DB 数据但入参带了「按日明细 + 汇总」
    const rawOverride = options?.rawDailyOverride?.trim()
    const metrics = options?.metricsOverride && typeof options.metricsOverride === 'object' ? options.metricsOverride : {} as any
    const hasOverride = rawOverride && (Number(metrics.total_revenue) > 0 || Number(metrics.total_viewers) > 0 || Number(metrics.total_orders) > 0)
    if (hasOverride) {
      const currentStats = {
        totalGMV: Number(metrics.total_revenue) || 0,
        totalDuration: Number(metrics.total_duration) || 1,
        totalViewers: Number(metrics.total_viewers) || 0,
        totalOrders: Number(metrics.total_orders) || 0,
        totalInteractions: Number(metrics.total_interactions) || 0,
      }
      const historicalStats = { avgGMV: 0, avgViewers: 0, avgConversionRate: 0, avgDuration: 0, avgOrders: 0, avgInteractions: 0, avgGMVPerHour: 0, avgInteractionRate: 0, avgAOV: 0 }
      const timeContext = getTimeContext(region)
      const upcomingEvents = getUpcomingEvents(region, new Date())
      const storeStage = getStoreStage(currentStats.totalGMV, currentStats.totalDuration, Math.max(1, Math.floor(currentStats.totalOrders / 10)))
      const llmResultOverride = await generateIntelligentTodosWithLLM({
        storeInfo, storeCategories, currentStats, historicalStats, timeContext, upcomingEvents, storeStage,
        trendAnalysis: null, anomaliesSummary: '', existingTaskTitles,
        rawDailyStatsText: rawOverride,
        additionalUserPrompt: options?.additionalUserPrompt,
        llmConfig: options?.llmConfig,
        locale: options?.locale,
        countryCode: options?.countryCode,
      })
      if (llmResultOverride.tasks.length > 0) {
        result = dedup(llmResultOverride.tasks.map((t) => ({
          title: t.title, description: t.description, priority: t.priority, source: 'llm_intelligent', aiFeature: (t as ResultItem).aiFeature,
        })) as ResultItem[])
        return { tasks: result, llmEmptyReason: llmResultOverride.llmEmptyReason }
      }
      if (llmResultOverride.llmEmptyReason) llmEmptyReason = llmResultOverride.llmEmptyReason
    }

    // 2) 回退到 latestDate
    let latestDate = options?.weekStart ? anchorEndDate : await getStoreLatestStatsDate(storeId)
    if (options?.weekStart) {
      const strict2Agg = await aggregateStatsForRange(storeId, strictRange.dateFrom, strictRange.dateTo)
      const hasStrict2 = !!strict2Agg && (strict2Agg.totalViewers > 0 || strict2Agg.totalGMV > 0 || strict2Agg.totalOrders > 0 || strict2Agg.totalDuration > 0)
      if (!hasStrict2) {
        const latest = await getStoreLatestStatsDate(storeId)
        if (latest && latest !== anchorEndDate) {
          latestDate = latest
          statsDateRangeReason = '所选自然周对应区间无数据，已回退到本店最新有数据的30天区间生成'
        }
      }
    }
    if (!latestDate) {
      const prevYear = new Date().getFullYear() - 1
      const yearRange = { dateFrom: `${prevYear}-01-01`, dateTo: `${prevYear}-12-31` }
      const yearAgg = await aggregateStatsForRange(storeId, yearRange.dateFrom, yearRange.dateTo)
      if (yearAgg && (yearAgg.totalViewers > 0 || yearAgg.totalGMV > 0 || yearAgg.totalOrders > 0 || yearAgg.totalDuration > 0)) {
        latestDate = yearRange.dateTo
      }
    }
    if (latestDate) {
      const existingRange = getPeriodDateRangeFromEnd(latestDate, 0)
      statsDateRangeUsed = existingRange
      const existingAgg = await aggregateStatsForRange(storeId, existingRange.dateFrom, existingRange.dateTo)
      const hasExistingData = !!existingAgg && (existingAgg.totalViewers > 0 || existingAgg.totalGMV > 0 || existingAgg.totalOrders > 0 || existingAgg.totalDuration > 0)
      if (hasExistingData) {
        // Branch 3: latestDate 区间有 DB 数据 — 共用 runLLMPipeline，仅 refDate / dataRange 不同
        const prevRange = getPeriodDateRangeFromEnd(latestDate, 1)
        const prevAgg = await aggregateStatsForRange(storeId, prevRange.dateFrom, prevRange.dateTo)
        const prev = prevAgg || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 }
        const currentStats = {
          totalGMV: existingAgg.totalGMV, totalDuration: existingAgg.totalDuration || 1,
          totalViewers: existingAgg.totalViewers, totalOrders: existingAgg.totalOrders, totalInteractions: existingAgg.totalInteractions || 0,
        }
        const historicalStats = {
          avgGMV: prev.totalGMV, avgViewers: prev.totalViewers,
          avgConversionRate: prev.totalViewers > 0 ? (prev.totalOrders / prev.totalViewers) * 100 : 0,
          avgDuration: prev.totalDuration, avgOrders: prev.totalOrders, avgInteractions: prev.totalInteractions,
          avgGMVPerHour: prev.totalDuration > 0 ? prev.totalGMV / prev.totalDuration : 0,
          avgInteractionRate: prev.totalViewers > 0 ? (prev.totalInteractions / prev.totalViewers) * 100 : 0,
          avgAOV: prev.totalOrders > 0 ? prev.totalGMV / prev.totalOrders : 0,
        }
        const rawFromDb = await getRawDailyStatsForLLM(storeId, existingRange.dateFrom, existingRange.dateTo)
        const rawRaw2 = options?.rawDailyOverride ?? rawFromDb
        const rawDailyStatsText = rawRaw2 && String(rawRaw2).trim() ? String(rawRaw2) : undefined
        const pipelineResult3 = await runLLMPipeline({ currentStats, historicalStats, rawDailyStatsText, refDate: latestDate, dataRange: existingRange })
        if (pipelineResult3.emptyReason) llmEmptyReason = pipelineResult3.emptyReason
        result = pipelineResult3.tasks
      }
    }
  }

  // 3) 若数据超过15天未更新，追加「请上传」任务
  const latestDataDate = await getStoreLatestStatsDate(storeId)
  const daysSince = (dateStr: string) =>
    Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000))
  if (!latestDataDate || daysSince(latestDataDate) > 15) {
    if (!result.some((t) => (t.title || '').trim() === uploadTask.title.trim())) {
      const desc =
        result.length > 0
          ? '当前已基于店铺最近有数据的 30 天做了分析；若已有更新数据可上传以便获得更贴合当下的建议。'
          : uploadTask.description
      result.push({ ...uploadTask, description: desc, source: 'stage' })
    }
  }
  if (result.length === 0) {
    console.warn(`[generateSuggestedTodosForStore] storeId=${storeId} 各分支未产出任何待办，兜底追加「请上传最近30天的运营数据」`)
    result.push({ ...uploadTask, source: 'stage' })
  }
  return { tasks: result, llmEmptyReason, statsDateRangeUsed, statsDateRangeReason }
}
