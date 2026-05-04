import express from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'
import crypto from 'crypto'
import { callLLMOnce, isScriptLLMConfigured } from '../services/scriptLLM'
import { getScriptLLMConfigSync, getScriptLLMConfigSource, getScriptLLMAllowedUserIds, getScriptLLMEnabledFeatures } from '../services/scriptLLMConfig'
import { getLLMModesSync, setLLMModesInDB, loadScriptLLMConfigCache } from '../services/scriptLLMConfig'
import {
  listLlmTools,
  getDefaultToolId,
  getUserSelectedToolId,
  setUserSelectedToolId,
  getEffectiveToolConfigForUser,
  createLlmTool,
  updateLlmTool,
  deleteLlmTool,
  getLLMConfigForFeature,
  getFeatureLlmMapping,
  setFeatureLlmMapping,
  type FeatureLlmMapping,
} from '../services/llmTools'
import { logRequest } from '../utils/requestLog'
import scriptRouter from './ai/script'
import systemAgentRouter from './ai/systemAgent'

import {
  appendGenerateTasksLog,
  getPeriodDateRange,
  getPeriodDateRangeFromEnd,
  getStoreLatestStatsDate,
  aggregateStatsForRange,
  getRawDailyStatsForLLM,
  getRecommendedTimeSlot,
  getDataSourceByPlatform,
  getConversionRateBenchmark,
  getCategoryAOVBenchmark,
  getCategoryName,
  getStoreTier,
  getStoreStage,
  analyzeTrend,
  detectAnomalies,
  getDynamicThresholds,
  nextOccurrence,
  getUpcomingEvents,
  getTimeContext,
  getYearOverYearStats,
  getMonthOverMonthStats,
  generateComparisonTasks,
  generateStageBasedTasks,
  analyzeAnomaliesWithLLM,
  extractTasksJsonFromText,
  sanitizeTasksJson,
  extractBalancedBracket,
  localeToCountryCode,
  generateIntelligentTodosWithLLM,
  stripToolsSectionFromDescription,
  llmTasksCoverEvent,
  autoTagTaskRoleAndTool,
  llmTasksCoverShortVideo,
  generateSuggestedTodosForStore,
  Anomaly,
  EventDef,
  LLMAnomalyTask,
  IntelligentTodoItem,
  IntelligentTodosLLMResult,
  TODO_STATS_DAYS,
  toStr,
  TEMPERATURE_INPUT_FOR_LLM,
  STAGE_LLM_HINT
} from '../services/aiTasksService'

/** 智能生成单条待办（含 Coze 扩展字段），入库与 API 响应共用 */
type GenerateTasksItem = IntelligentTodoItem & { source?: string }

export { SCRIPT_LLM_REQUIRED_MESSAGE } from './ai/script'

const router = express.Router()
// ==================== 通过 API 与智能体 Bot 交互（无需登录，API Key 认证） ====================
const BOT_API_KEY = process.env.BOT_API_KEY || process.env.EXTERNAL_BOT_API_KEY || ''
function getBotApiKeyFromRequest(req: express.Request): string | null {
  const auth = req.headers.authorization
  if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null
  const key = req.headers['x-api-key']
  return typeof key === 'string' ? key.trim() || null : null
}
function requireBotApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!BOT_API_KEY || !BOT_API_KEY.trim()) {
    return res.status(503).json({ success: false, error: '服务未配置 BOT_API_KEY，无法通过 API 与智能体交互' })
  }
  const key = getBotApiKeyFromRequest(req)
  if (!key || key !== BOT_API_KEY) {
    return res.status(401).json({ success: false, error: 'API Key 缺失或无效' })
  }
  next()
}

/** POST /api/ai/bot/generate-tasks：智能体/第三方用 API Key 调用，传 Excel（TSV）+ 提示词，返回待办列表（不写库） */
router.post('/bot/generate-tasks', requireBotApiKey, async (req, res) => {
  try {
    const body = req.body || {}
    const rawDailyTable = typeof body.rawDailyTable === 'string' ? body.rawDailyTable.trim() : ''
    const metricsOverride = body.metricsOverride && typeof body.metricsOverride === 'object' ? body.metricsOverride : {}
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim().slice(0, 500) : ''
    const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : ''
    const locale = typeof body.locale === 'string' ? body.locale.trim() || 'zh-CN' : 'zh-CN'
    const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : undefined

    const hasPayload = rawDailyTable && (Number(metricsOverride.total_revenue) > 0 || Number(metricsOverride.total_viewers) > 0 || Number(metricsOverride.total_orders) > 0)
    if (!storeId && !hasPayload) {
      return res.status(400).json({
        success: false,
        error: '请提供 storeId（使用该店铺 DB 数据），或 rawDailyTable + metricsOverride（Excel/按日明细 + 汇总指标）',
      })
    }

    let llmConfig = await getLLMConfigForFeature('tasks')
    if (!llmConfig) {
      return res.status(503).json({ success: false, error: '未配置 LLM，无法生成智能待办。请配置 SCRIPT_LLM_URL / SCRIPT_LLM_API_KEY 或管理后台话术 LLM，或为「智能待办」指定工具。' })
    }

    let tasks: GenerateTasksItem[] = []
    if (storeId) {
      const storeExists = await dbGet('SELECT id FROM stores WHERE id = ?', [storeId])
      if (!storeExists) {
        return res.status(404).json({ success: false, error: '店铺不存在' })
      }
      const result = await generateSuggestedTodosForStore(storeId, {
        rawDailyOverride: rawDailyTable || undefined,
        metricsOverride: Object.keys(metricsOverride).length > 0 ? metricsOverride : undefined,
        additionalUserPrompt: userPrompt || undefined,
        llmConfig,
        locale,
        countryCode,
      })
      tasks = result.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        estimatedDays: t.estimatedDays ?? null,
        category: t.category ?? null,
        responsible: t.responsible ?? null,
        aiFeature: t.aiFeature,
        assignedRole: t.assignedRole,
      }))
    } else {
      const region = '中国'
      const currentStats = {
        totalGMV: Number(metricsOverride.total_revenue) || 0,
        totalDuration: Number(metricsOverride.total_duration) || 1,
        totalViewers: Number(metricsOverride.total_viewers) || 0,
        totalOrders: Number(metricsOverride.total_orders) || 0,
        totalInteractions: Number(metricsOverride.total_interactions) || 0,
      }
      const historicalStats = {
        avgGMV: 0,
        avgViewers: 0,
        avgConversionRate: 0,
        avgDuration: 0,
        avgOrders: 0,
        avgInteractions: 0,
        avgGMVPerHour: 0,
        avgInteractionRate: 0,
        avgAOV: 0,
      }
      const storeInfo = {
        name: '第三方-API',
        platform: '未指定',
        region,
        targetAudience: '',
        brandPositioning: '',
        brandStrategy: '',
        description: '',
        minPrice: null,
        maxPrice: null,
        currencySymbol: '¥',
      }
      const timeContext = getTimeContext(region)
      const upcomingEvents = getUpcomingEvents(region, new Date())
      const storeStage = getStoreStage(
        currentStats.totalGMV,
        currentStats.totalDuration,
        Math.max(1, Math.floor(currentStats.totalOrders / 10))
      )
      const llmResult = await generateIntelligentTodosWithLLM({
        storeInfo,
        storeCategories: [],
        currentStats,
        historicalStats,
        timeContext,
        upcomingEvents,
        storeStage,
        trendAnalysis: null,
        anomaliesSummary: '',
        existingTaskTitles: [],
        rawDailyStatsText: rawDailyTable,
        additionalUserPrompt: userPrompt || undefined,
        llmConfig,
        locale,
        countryCode,
      })
      tasks = llmResult.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        estimatedDays: t.estimatedDays ?? null,
        category: t.category ?? null,
        responsible: t.responsible ?? null,
        aiFeature: t.aiFeature,
        assignedRole: t.assignedRole,
      }))
    }

    res.json({ success: true, tasks })
  } catch (e) {
    console.error('[bot/generate-tasks]', e)
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : '生成失败',
    })
  }
})

// 所有路由都需要认证
router.use(authenticate)
// 话术相关路由（配置、生成、流式）拆至 ai/script.ts
router.use('/script', scriptRouter)
router.use('/system-agent', systemAgentRouter)

// ==================== LLM 智能体/版本选择（供前端选项卡使用） ====================
/** 调用方式：Coze Agent（stream_run）、OpenAI 兼容 */
const LLM_MODES = [
  { id: 'coze_agent', label: 'Coze Agent' },
  { id: 'openai', label: 'OpenAI 兼容接口' },
] as const
const LLM_VERSIONS = [{ id: 'default', label: '当前默认' }] as const

/** GET /api/ai/llm-modes：返回可选智能体方式、当前偏好；生效方式=用户选择，实际调用时按此分支 */
router.get('/llm-modes', (req: AuthRequest, res) => {
  try {
    const config = getScriptLLMConfigSync()
    const modes = getLLMModesSync()
    res.json({
      modes: LLM_MODES,
      versions: LLM_VERSIONS,
      currentTodo: modes.todo,
      currentScript: modes.script,
      currentAnomaly: modes.todo,
      effectiveMode: config ? modes.todo : null,
      configured: Boolean(config),
    })
  } catch (e) {
    console.error('GET /llm-modes 失败:', e)
    res.status(500).json({ error: '查询失败' })
  }
})

/** GET /api/ai/llm-diagnostic：诊断话术 LLM 是否已配置及来源，便于排查「待办 LLM 0 条」 */
router.get('/llm-diagnostic', (req: AuthRequest, res) => {
  try {
    const source = getScriptLLMConfigSource()
    res.json({
      configured: source !== 'none',
      source,
      hint: source === 'none'
        ? '请管理员在「管理员」-「LLM 配置」中填写 API 地址与密钥并保存，或设置环境变量 SCRIPT_LLM_URL、SCRIPT_LLM_API_KEY 后重启后端。'
        : source === 'env'
          ? '当前使用环境变量，待办生成将尝试调用 LLM。若仍为 0 条，请点击「智能生成」并查看本次返回的提示。'
          : '当前使用数据库配置，待办生成将尝试调用 LLM。若仍为 0 条，请点击「智能生成」并查看本次返回的提示。',
    })
  } catch (e) {
    console.error('GET /llm-diagnostic 失败:', e)
    res.status(500).json({ error: '查询失败' })
  }
})

/** PUT /api/ai/llm-modes：保存智能体方式偏好（所有登录用户可修改，当前为全局偏好） */
router.put('/llm-modes', async (req: AuthRequest, res) => {
  try {
    const { todo, script } = req.body ?? {}
    const valid: Array<'coze_agent' | 'openai'> = ['coze_agent', 'openai']
    const updates: { todo?: 'coze_agent' | 'openai'; script?: 'coze_agent' | 'openai' } = {}
    if (valid.includes(todo)) updates.todo = todo
    if (valid.includes(script)) updates.script = script
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '请提供 todo 或 script（coze_agent | openai）' })
    }
    await setLLMModesInDB(updates)
    await loadScriptLLMConfigCache()
    const modes = getLLMModesSync()
    res.json({ success: true, currentTodo: modes.todo, currentScript: modes.script })
  } catch (e) {
    console.error('PUT /llm-modes 失败:', e)
    res.status(500).json({ error: '保存失败' })
  }
})

// ==================== 多套 AI 工具配置（llm_tools 表 + 用户选择） ====================

/** GET /api/ai/llm-tools：列表 + 当前用户选中的 toolId + 默认 toolId + 功能映射（管理员可见） */
router.get('/llm-tools', async (req: AuthRequest, res) => {
  try {
    const tools = await listLlmTools()
    const defaultId = await getDefaultToolId()
    const userId = req.user?.userId
    const selectedId = userId ? await getUserSelectedToolId(userId) : null
    const isAdmin = req.user?.role === 'admin'
    const featureMapping = isAdmin ? await getFeatureLlmMapping() : undefined
    res.json({
      tools,
      defaultToolId: defaultId,
      selectedToolId: selectedId ?? defaultId,
      ...(featureMapping !== undefined && { featureMapping }),
    })
  } catch (e) {
    console.error('GET /llm-tools 失败:', e)
    res.status(500).json({ error: '查询失败' })
  }
})

/** PUT /api/ai/feature-llm-mapping：设置功能→工具映射（仅管理员） */
router.put('/feature-llm-mapping', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { script, tasks, anomaly, video, systemAgent } = req.body ?? {}
    const mapping: FeatureLlmMapping = {}
    if (script != null && typeof script === 'string' && script.trim()) mapping.script = script.trim()
    if (tasks != null && typeof tasks === 'string' && tasks.trim()) mapping.tasks = tasks.trim()
    if (anomaly != null && typeof anomaly === 'string' && anomaly.trim()) mapping.anomaly = anomaly.trim()
    if (video != null && typeof video === 'string' && video.trim()) mapping.video = video.trim()
    if (systemAgent != null && typeof systemAgent === 'string' && systemAgent.trim()) mapping.systemAgent = systemAgent.trim()
    await setFeatureLlmMapping(mapping)
    res.json({ success: true, message: '功能映射已保存' })
  } catch (e) {
    console.error('PUT /feature-llm-mapping 失败:', e)
    res.status(500).json({ error: '保存失败' })
  }
})

/** PUT /api/ai/llm-tools/selected：当前用户选择使用的工具 ID */
router.put('/llm-tools/selected', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const { toolId } = req.body ?? {}
    const id = toolId != null ? String(toolId).trim() : null
    await setUserSelectedToolId(userId, id || null)
    const selectedId = id || (await getDefaultToolId())
    res.json({ success: true, selectedToolId: selectedId })
  } catch (e) {
    console.error('PUT /llm-tools/selected 失败:', e)
    res.status(500).json({ error: '保存失败' })
  }
})

/** POST /api/ai/llm-tools：创建一套工具（仅管理员） */
router.post('/llm-tools', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, url, api_key, model, sort_order } = req.body ?? {}
    const tool = await createLlmTool({
      name: name ?? '未命名',
      url: url ?? '',
      api_key: api_key ?? '',
      model,
      sort_order,
    })
    res.status(201).json({ success: true, tool: { id: tool.id, name: tool.name, url: tool.url, model: tool.model, sort_order: tool.sort_order } })
  } catch (e: any) {
    console.error('POST /llm-tools 失败:', e)
    res.status(400).json({ error: e?.message || '创建失败' })
  }
})

/** PUT /api/ai/llm-tools/:id：更新一套工具（仅管理员） */
router.put('/llm-tools/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name, url, api_key, model, sort_order } = req.body ?? {}
    const updated = await updateLlmTool(id, {
      ...(name !== undefined && { name }),
      ...(url !== undefined && { url }),
      ...(api_key !== undefined && { api_key }),
      ...(model !== undefined && { model }),
      ...(sort_order !== undefined && { sort_order }),
    })
    if (!updated) return res.status(404).json({ error: '工具不存在' })
    res.json({ success: true, tool: { id: updated.id, name: updated.name, url: updated.url, model: updated.model, sort_order: updated.sort_order } })
  } catch (e: any) {
    console.error('PUT /llm-tools/:id 失败:', e)
    res.status(400).json({ error: e?.message || '更新失败' })
  }
})

/** DELETE /api/ai/llm-tools/:id：删除一套工具（仅管理员） */
router.delete('/llm-tools/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    await deleteLlmTool(id)
    res.json({ success: true })
  } catch (e) {
    console.error('DELETE /llm-tools/:id 失败:', e)
    res.status(500).json({ error: '删除失败' })
  }
})

// ==================== 智能生成任务：辅助函数与路由 ====================
// ==================== 新增：店铺成长阶段分析 ====================
// ==================== 新增：趋势分析 ====================
// ==================== 新增：异常检测 ====================
// ==================== 新增：动态阈值判断 ====================
// ==================== 新增：节日/季节提醒 ====================
// ==================== 同比环比数据查询 ====================
// ==================== 新增：生成基于阶段的任务 ====================
// ==================== LLM 异常分析（复用话术 LLM 配置） ====================
// ==================== 核心路由：智能生成任务（全面重构） ====================

router.post('/generate-tasks', async (req: AuthRequest, res) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  try {
    const { storeId, useStatsFromStoreId, rawDailyTable, metricsOverride, userPrompt, locale: bodyLocale, countryCode: bodyCountryCode, weekStart } = req.body
    const userId = req.user!.userId
    const role = req.user!.role
    const isAdmin = role === 'admin'
    const canBypassUserList = role === 'admin' || role === 'manager'

    // 管理员、经理可绕过用户列表；其他角色须在「允许使用 LLM 的用户」中。从 DB 直接读最新配置
    const allowedUserIds = await getScriptLLMAllowedUserIds()
    if (!canBypassUserList && allowedUserIds !== null && !allowedUserIds.includes(userId)) {
      console.warn('[generate-tasks] 403 用户不在允许列表', {
        userId,
        role: req.user!.role,
        allowedCount: allowedUserIds.length,
        hint: '请在管理员-权限配置中勾选该用户（或全选）并保存',
      })
      return res.status(403).json({
        error: '您暂无智能生成待办权限，请联系管理员在「管理员」-「权限配置」-「可使用 LLM 的用户」中勾选您的账号并保存。',
        code: 'GENERATE_TASKS_ACCESS_DENIED',
      })
    }
    const enabledFeatures = await getScriptLLMEnabledFeatures()
    if (enabledFeatures !== null && !enabledFeatures.includes('tasks')) {
      console.warn('[generate-tasks] 403 智能生成待办功能未开放', {
        userId,
        role: req.user!.role,
        enabledFeatures,
        hint: '请在权限配置中勾选「能够使用的功能」-「智能生成待办」并保存',
      })
      return res.status(403).json({
        error: '当前未开放智能生成待办功能，请联系管理员在「权限配置」中勾选「智能生成待办」并保存。',
        code: 'GENERATE_TASKS_FEATURE_DISABLED',
      })
    }

    // 任务归属：有店铺时，管理员为他人店铺生成则归属店铺主，否则归属当前用户（便于店铺主在待办列表看到）
    let taskOwnerId = userId
    if (storeId) {
      const store = await dbGet<{ userId: string }>('SELECT userId FROM stores WHERE id = ?', [storeId])
      if (!store) {
        return res.status(404).json({ error: '店铺不存在' })
      }
      const { userCanAccessStore } = await import('../utils/storeAccess')
      const canAccess = await userCanAccessStore(userId, storeId, req.user!.role)
      if (!canAccess) {
        return res.status(403).json({ error: '无权为该店铺生成待办' })
      }
      if (isAdmin && store.userId && store.userId !== userId) {
        taskOwnerId = store.userId
        console.log(`[生成任务] 管理员为他人店铺生成，待办归属店铺主 userId=${taskOwnerId}`)
        appendGenerateTasksLog(`[生成任务] 管理员为他人店铺生成，待办归属店铺主`)
      }
    }

    console.log(`[生成任务] userId=${userId}, storeId=${storeId}, taskOwnerId=${taskOwnerId}`)
    appendGenerateTasksLog(`[生成任务] userId=${userId}, storeId=${storeId}`)

    // 0. 按自然周缓存：同一店铺同一自然周内，若已有生成的待办则直接复用，不重复清空/生成
    const computeWeekStart = (d: Date) => {
      // 自然周：周一为起始。用服务端本地时间计算（不改变数据采样逻辑，仅控制缓存键）
      const date = new Date(d)
      const day = date.getDay() // 0=Sun...6=Sat
      const diffToMonday = day === 0 ? -6 : 1 - day
      date.setDate(date.getDate() + diffToMonday)
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${dd}`
    }
    const weekStartStr =
      typeof weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekStart.trim())
        ? weekStart.trim()
        : computeWeekStart(new Date())
    const weekStartIso = `${weekStartStr}T00:00:00.000Z`
    const weekEndDate = new Date(weekStartIso)
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7)
    const weekEndIso = weekEndDate.toISOString()

    if (storeId) {
      let cached: any[] = []
      const uploadPlaceholderTitle = '请上传最近30天的运营数据'
      try {
        cached = await dbAll(
          `SELECT id FROM tasks WHERE userId = ? AND storeId = ? AND weekStart = ? AND title <> ? LIMIT 1`,
          [taskOwnerId, storeId, weekStartStr, uploadPlaceholderTitle]
        )
      } catch (e: any) {
        const msg = String(e?.message ?? '')
        if (!msg.includes('no such column')) throw e
        cached = await dbAll(
          `SELECT id FROM tasks WHERE userId = ? AND storeId = ? AND createdAt >= ? AND createdAt < ? AND title <> ? LIMIT 1`,
          [taskOwnerId, storeId, weekStartIso, weekEndIso, uploadPlaceholderTitle]
        )
      }
      if (Array.isArray(cached) && cached.length > 0) {
        // 取消“缓存命中就跳过生成”的锁死限制：允许用户在已展示数据参考周期后反复生成（用于调参/重试 Coze）
        console.log(`[生成任务] 命中自然周缓存 weekStart=${weekStartStr}，继续生成（已取消跳过限制）`)
        appendGenerateTasksLog(`[生成任务] 命中自然周缓存 weekStart=${weekStartStr}，继续生成（已取消跳过限制）`)
      }
    }

    // 0. 未命中缓存：先清空该店铺下「归属用户」的未完成待办，再生成（管理员为他人店铺时清空店铺主的待办）
    if (storeId) {
      try {
        await dbRun(
          'DELETE FROM tasks WHERE status = ? AND userId = ? AND (storeId = ? OR (storeId IS NULL AND ? IS NULL)) AND weekStart = ?',
          ['pending', taskOwnerId, storeId, storeId, weekStartStr]
        )
      } catch (e: any) {
        const msg = String(e?.message ?? '')
        if (!msg.includes('no such column')) throw e
        // 旧库无 weekStart：退回原逻辑（会清空该店全部 pending）
        await dbRun(
          'DELETE FROM tasks WHERE status = ? AND userId = ? AND (storeId = ? OR (storeId IS NULL AND ? IS NULL))',
          ['pending', taskOwnerId, storeId, storeId]
        )
      }
      console.log('[智能生成] 已清空该店铺下未完成待办，再生成（确保基于现有数据抓取）')
      appendGenerateTasksLog('[智能生成] 已清空未完成待办，再生成')
    }

    // 1. 调用与智能生成共用同一套逻辑：generateSuggestedTodosForStore → LLM 或规则兜底
    let tasks: GenerateTasksItem[] = []
    let useAgentMethodResult = false
    /** 本次生成是否/为何未使用 LLM，供前端展示配置提示 */
    let llmStatus: 'used' | 'not_configured' | 'skipped_env' | 'returned_empty' | 'call_failed' | 'no_data' = 'not_configured'
    /** 本次使用的数据区间（null=该店无 stats），便于确认 12 月等是否被用上 */
    let statsDateRangeUsed: { dateFrom: string; dateTo: string } | null = null
    let statsDateRangeReason: string | undefined
    /** 当 LLM 返回空时从 generateSuggestedTodosForStore 透传的具体原因（便于排查 Coze） */
    let llmEmptyReasonFromStore: string | undefined
    let llmConfig: { url: string; apiKey: string; model?: string } | null =
      await getEffectiveToolConfigForUser(userId, req.body?.toolId)
    if (!llmConfig) llmConfig = await getLLMConfigForFeature('tasks')
    if (storeId) {
      const suggestedResult = await generateSuggestedTodosForStore(storeId, {
        llmConfig: llmConfig ?? undefined,
        useStatsFromStoreId: useStatsFromStoreId ?? undefined,
        rawDailyOverride: typeof rawDailyTable === 'string' && rawDailyTable.trim() ? rawDailyTable.trim() : undefined,
        metricsOverride: metricsOverride && typeof metricsOverride === 'object' ? metricsOverride : undefined,
        additionalUserPrompt: typeof userPrompt === 'string' && userPrompt.trim() ? userPrompt.trim().slice(0, 500) : undefined,
        locale: (typeof bodyLocale === 'string' && bodyLocale.trim()) ? bodyLocale.trim() : 'zh-CN',
        countryCode: (typeof bodyCountryCode === 'string' && bodyCountryCode.trim()) ? bodyCountryCode.trim().toUpperCase() : undefined,
        weekStart: weekStartStr,
      })
      const suggested = suggestedResult.tasks
      const llmEmptyReasonFromStore = suggestedResult.llmEmptyReason
      statsDateRangeUsed = suggestedResult.statsDateRangeUsed ?? statsDateRangeUsed
      statsDateRangeReason = suggestedResult.statsDateRangeReason ?? statsDateRangeReason
      if (suggested.length > 0) {
        tasks = suggested.map((t) => ({
          ...t,
          priority: (t.priority || 'normal') as 'urgent' | 'normal',
          source: t.source ?? 'llm_intelligent',
        }))
        useAgentMethodResult = true
        const hasLlmTasks = tasks.some((t) => t.source === 'llm_intelligent')
        llmStatus = hasLlmTasks ? 'used' : (llmConfig ? 'returned_empty' : 'not_configured')
        // 若为 returned_empty 且当前店铺无最近30天数据，实为「未调用 LLM」，提示更明确
        if (llmStatus === 'returned_empty' && storeId && llmConfig) {
          const strictRange = getPeriodDateRange(0)
          const strictAgg = await aggregateStatsForRange(storeId, strictRange.dateFrom, strictRange.dateTo)
          const hasStrictData =
            !!strictAgg &&
            (strictAgg.totalViewers > 0 || strictAgg.totalGMV > 0 || strictAgg.totalOrders > 0 || strictAgg.totalDuration > 0)
          if (!hasStrictData) {
            const latest = await getStoreLatestStatsDate(storeId)
            if (!latest) {
              llmStatus = 'no_data'
            } else {
              const existingRange = getPeriodDateRangeFromEnd(latest, 0)
              const existingAgg = await aggregateStatsForRange(storeId, existingRange.dateFrom, existingRange.dateTo)
              const hasExisting =
                !!existingAgg &&
                (existingAgg.totalViewers > 0 || existingAgg.totalGMV > 0 || existingAgg.totalOrders > 0 || existingAgg.totalDuration > 0)
              if (!hasExisting) llmStatus = 'no_data'
            }
          }
        }
        console.log(`[生成任务] 使用 Agent 同款方法，生成 ${tasks.length} 条待办，llmStatus=${llmStatus}`)
        appendGenerateTasksLog(`[生成任务] 使用 Agent 同款方法，生成 ${tasks.length} 条待办`)
      }
    }

    // 诊断：本次使用的数据区间（便于确认 12 月等是否被用上）
    if (storeId && useAgentMethodResult) {
      // 若指定了 weekStart：诊断区间与生成一致（以该自然周周日为 anchorEndDate）
      let anchorEndDate: string | null = null
      if (typeof weekStartStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekStartStr)) {
        const d = new Date(`${weekStartStr}T00:00:00.000Z`)
        d.setUTCDate(d.getUTCDate() + 6)
        anchorEndDate = toStr(d)
      }
      const latest = anchorEndDate || (await getStoreLatestStatsDate(storeId))
      if (latest) {
        const range = getPeriodDateRangeFromEnd(latest, 0)
        statsDateRangeUsed = { dateFrom: range.dateFrom, dateTo: range.dateTo }
      }
      // 若「anchorEndDate 往前30天」有数据，覆盖为 strict 区间便于展示
      const strictR = anchorEndDate ? getPeriodDateRangeFromEnd(anchorEndDate, 0) : getPeriodDateRange(0)
      const strictAggCheck = await aggregateStatsForRange(storeId, strictR.dateFrom, strictR.dateTo)
      const hasStrict =
        !!strictAggCheck &&
        (strictAggCheck.totalViewers > 0 || strictAggCheck.totalGMV > 0 || strictAggCheck.totalOrders > 0 || strictAggCheck.totalDuration > 0)
      if (hasStrict) statsDateRangeUsed = { dateFrom: strictR.dateFrom, dateTo: strictR.dateTo }
    }

    if (!useAgentMethodResult) {
    // 1. 获取店铺信息
    let storeInfo: any = null
    let storeCategories: string[] = []
    if (storeId) {
      try {
        storeInfo = await dbGet('SELECT * FROM stores WHERE id = ?', [storeId])
        const categoryRelations = await dbAll(
          `SELECT c.name FROM categories c
           INNER JOIN store_categories sc ON c.id = sc.categoryId
           WHERE sc.storeId = ?`,
          [storeId]
        )
        storeCategories = categoryRelations.map((r: any) => r.name)
        console.log(`[店铺信息] name=${storeInfo?.name}, categories=${storeCategories.join('/')}`)
      } catch (err) {
        console.warn('获取店铺信息失败:', err)
      }
    }

    // 2. 获取当前周期：先检查「点击当天往前 30 天」是否有数据；有则用该区间做待办，无则留「请上传最近30天的运营数据」并再分析系统里现有的最近 30 天（以最新有数据日为终点）
    let currentRange = getPeriodDateRange(0)
    let currentStats: any = null
    let usedFallbackPeriod = false
    if (storeId) {
      try {
        const strictRange = getPeriodDateRange(0)
        const strictAgg = await aggregateStatsForRange(storeId, strictRange.dateFrom, strictRange.dateTo)
        const hasDataInStrict30 =
          !!strictAgg &&
          (strictAgg.totalViewers > 0 || strictAgg.totalGMV > 0 || strictAgg.totalOrders > 0 || strictAgg.totalDuration > 0)
        if (hasDataInStrict30) {
          currentRange = strictRange
          currentStats = strictAgg
          console.log(`[最近30天] 当天往前30天有数据 ${currentRange.dateFrom}～${currentRange.dateTo} GMV=${currentStats.totalGMV}, 时长=${currentStats.totalDuration}h`)
        } else {
          const latestDate = await getStoreLatestStatsDate(storeId)
          if (latestDate) {
            const existingRange = getPeriodDateRangeFromEnd(latestDate, 0)
            const existingAgg = await aggregateStatsForRange(storeId, existingRange.dateFrom, existingRange.dateTo)
            const hasExistingData =
              !!existingAgg &&
              (existingAgg.totalViewers > 0 || existingAgg.totalGMV > 0 || existingAgg.totalOrders > 0 || existingAgg.totalDuration > 0)
            if (hasExistingData) {
              currentRange = existingRange
              currentStats = existingAgg
              usedFallbackPeriod = true
              console.log(`[周期] 当天往前30天无数据，使用系统现有最近30天 ${currentRange.dateFrom}～${currentRange.dateTo} GMV=${currentStats.totalGMV}`)
            }
          }
        }
      } catch (err) {
        console.warn('获取当前周期统计数据失败:', err)
      }
    }

    // 3. 获取历史统计数据：最近 5 个 30 天区间各自汇总；若当前周期为回退周期则按回退终点日往前推 5 段
    let recentStats: any[] = []
    let historicalStats: any = {
      avgGMV: 0,
      avgDuration: 0,
      avgViewers: 0,
      avgOrders: 0,
      avgInteractions: 0,
      avgConversionRate: 0,
      avgGMVPerHour: 0,
      avgInteractionRate: 0,
      avgAOV: 0,
    }

    if (storeId) {
      try {
        const periodRanges = usedFallbackPeriod
          ? [0, 1, 2, 3, 4].map((n) => getPeriodDateRangeFromEnd(currentRange.dateTo, n))
          : [0, 1, 2, 3, 4].map((n) => getPeriodDateRange(n))
        const periodRows = await Promise.all(
          periodRanges.map((range) =>
            aggregateStatsForRange(storeId, range.dateFrom, range.dateTo)
          )
        )
        for (const row of periodRows) {
          recentStats.push(row || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 })
        }

          const historicalData = recentStats.slice(1)
        if (historicalData.length > 0) {
          const count = historicalData.length
          historicalStats.avgGMV = historicalData.reduce((sum, s) => sum + (s.totalGMV || 0), 0) / count
          historicalStats.avgDuration = historicalData.reduce((sum, s) => sum + (s.totalDuration || 0), 0) / count
          historicalStats.avgViewers = historicalData.reduce((sum, s) => sum + (s.totalViewers || 0), 0) / count
          historicalStats.avgOrders = historicalData.reduce((sum, s) => sum + (s.totalOrders || 0), 0) / count
          historicalStats.avgInteractions = historicalData.reduce((sum, s) => sum + (s.totalInteractions || 0), 0) / count
          historicalStats.avgConversionRate = historicalStats.avgViewers > 0 
            ? (historicalStats.avgOrders / historicalStats.avgViewers) * 100 
            : 0
          historicalStats.avgGMVPerHour = historicalStats.avgDuration > 0 
            ? historicalStats.avgGMV / historicalStats.avgDuration 
            : 0
          historicalStats.avgInteractionRate = historicalStats.avgViewers > 0 
            ? (historicalStats.avgInteractions / historicalStats.avgViewers) * 100 
            : 0
          historicalStats.avgAOV = historicalStats.avgOrders > 0 
            ? historicalStats.avgGMV / historicalStats.avgOrders 
            : 0
          console.log(`[历史数据] 前${count}个30天区间平均 GMV=${historicalStats.avgGMV.toFixed(0)}, 转化率=${historicalStats.avgConversionRate.toFixed(2)}%`)
        }
      } catch (err) {
        console.warn('获取历史统计数据失败:', err)
      }
    }

    // 4. 不替店铺补「全局汇总数据」：该店铺无 stats 时保持 currentStats=null，走「无数据」分支，只生成引导任务（上传数据、完善店铺信息），避免待办中出现其他店铺的统计数字，与看板趋势图一致。
    tasks.length = 0

    /** 该店铺 stats 总记录数（与「最近30天是否有数据」无关）：用于区分真新店 vs 仅有历史数据；避免有 12 月数据等却被提示「上传首次数据」 */
    let statsRecordCount = 0
    if (storeId) {
      try {
        const statsCountRow = await dbGet<{ c: number }>(
          'SELECT COUNT(*) as c FROM stats WHERE storeId = ?',
          [storeId]
        )
        statsRecordCount = statsCountRow?.c ?? 0
      } catch (_) {}
    }

    // ==================== 主逻辑：按照流程图分支 ====================

    if (currentStats) {
      const gmv = currentStats.totalGMV || 0
      const duration = currentStats.totalDuration || 0
      const viewers = currentStats.totalViewers || 0
      const orders = currentStats.totalOrders || 0
      const interactions = currentStats.totalInteractions || 0
      const hasRealDataFallback = viewers > 0 || gmv > 0 || orders > 0
      // 当天往前30天无数据、但用了「系统现有最近30天」时：先留一条「请上传最近30天的运营数据」，再分析现有区间
      if (storeId && usedFallbackPeriod) {
        tasks.push({
          title: '请上传最近30天的运营数据',
          description: '上传后系统将基于数据自动生成运营建议与待办。',
          priority: 'urgent',
          source: 'stage',
        })
      }
      // 无运营数据（当前周期内 viewers/gmv/orders 均为 0）：仅一条「请上传最近30天的运营数据」，不调用 LLM
      if (storeId && !hasRealDataFallback) {
        // 若上面已因 usedFallbackPeriod 加过上传任务，此处不再重复
        if (!usedFallbackPeriod) {
          tasks.push({
            title: '请上传最近30天的运营数据',
            description: '上传后系统将基于数据自动生成运营建议与待办。',
            priority: 'urgent',
            source: 'stage',
          })
        }
      } else if (hasRealDataFallback) {
      /** 趋势分析结果，供 LLM 智能待办使用 */
      let trendAnalysis: { trend: string; description: string } | null = null

      // 计算关键指标
      const conversionRate = viewers > 0 ? (orders / viewers) * 100 : 0
      const gmvPerHour = duration > 0 ? gmv / duration : 0
      const interactionRate = viewers > 0 ? (interactions / viewers) * 100 : 0
      const avgOrderValue = orders > 0 ? gmv / orders : 0

      console.log(`[关键指标] 转化率=${conversionRate.toFixed(2)}%, GMV/h=${gmvPerHour.toFixed(0)}, 互动率=${interactionRate.toFixed(2)}%`)

      // 【统一】先计算所有上下文（供 LLM 或规则使用）
      const anomalies = detectAnomalies(currentStats, historicalStats, storeCategories)
      const storeStage = getStoreStage(gmv, duration, 0)
      if (recentStats.length >= 3) {
        trendAnalysis = analyzeTrend(recentStats)
        console.log(`[趋势分析] ${trendAnalysis.trend} - ${trendAnalysis.description}`)
      }
      const upcomingEvents = getUpcomingEvents(storeInfo?.region || 'CN', new Date())
      const thresholds = getDynamicThresholds(historicalStats, storeCategories, storeInfo?.minPrice, storeInfo?.maxPrice, storeInfo?.platform)
      const timeContext = getTimeContext(storeInfo?.region || 'CN')
      const anomaliesSummary = anomalies.length > 0 ? anomalies.map((a) => `${a.metric}${a.change}`).join('；') : ''
      console.log(`[店铺阶段] ${storeStage.name}（${storeStage.description}）`)

      // 【LLM 为主】已配置则优先调用 LLM，仅用规则做必要补充；失败则走规则兜底
      // 环境变量 SKIP_TODO_LLM=1 时跳过 LLM（仅用规则），便于模块调试与快速迭代
      let usedLLM = false
      const llmConfigured = Boolean(llmConfig)
      const skipTodoLlm = process.env.SKIP_TODO_LLM === '1'
      let existingPendingTitles: string[] = []
      try {
        const existingRows = await dbAll(
          'SELECT title FROM tasks WHERE status = ? AND userId = ? AND (storeId = ? OR (storeId IS NULL AND ? IS NULL))',
          ['pending', taskOwnerId, storeId || null, storeId || null]
        )
        existingPendingTitles = (existingRows || []).map((r: any) => r?.title).filter(Boolean)
      } catch (_) {
        // 忽略，继续生成
      }
      if (!llmConfigured) {
        llmStatus = 'not_configured'
        appendGenerateTasksLog('[待办生成] LLM 未配置，走规则兜底')
      } else if (skipTodoLlm) {
        llmStatus = 'skipped_env'
        appendGenerateTasksLog('[待办生成] SKIP_TODO_LLM=1，跳过 LLM，走规则兜底')
      }
      if (llmConfigured && !skipTodoLlm) {
        console.log('[待办生成] 已配置 LLM，正在调用智能待办（店铺平台=', storeInfo?.platform, '，已有待办数=', existingPendingTitles.length, '）')
        appendGenerateTasksLog(`[待办生成] 已配置 LLM，正在调用智能待办（店铺平台=${storeInfo?.platform ?? ''}，已有待办数=${existingPendingTitles.length}）`)
        try {
          const rawFromDb = await getRawDailyStatsForLLM(
            storeId,
            currentRange.dateFrom,
            currentRange.dateTo
          ).catch(() => '')
          const rawDailyStatsText = (typeof rawDailyTable === 'string' && rawDailyTable.trim() ? rawDailyTable.trim() : rawFromDb) || undefined
          if (rawDailyStatsText) {
            const lineCount = rawDailyStatsText.split('\n').length - 1
            const colCount = rawDailyStatsText.split('\n')[0]?.split('\t').length ?? 0
            console.log(`[待办生成] 已附带按日明细（全维度${colCount}列），共${lineCount}天供 Coze 分析`)
          }
          const llmRes = await generateIntelligentTodosWithLLM({
            storeInfo,
            storeCategories,
            currentStats,
            historicalStats,
            timeContext,
            upcomingEvents,
            storeStage,
            trendAnalysis,
            anomaliesSummary,
            existingTaskTitles: existingPendingTitles,
            rawDailyStatsText,
            additionalUserPrompt: typeof userPrompt === 'string' && userPrompt.trim() ? userPrompt.trim().slice(0, 500) : undefined,
            llmConfig: llmConfig ?? undefined,
            locale: typeof bodyLocale === 'string' && bodyLocale.trim() ? bodyLocale.trim() : 'zh-CN',
            countryCode: typeof bodyCountryCode === 'string' && bodyCountryCode.trim() ? bodyCountryCode.trim().toUpperCase() : undefined,
          })
          const intelligentTodos = llmRes.tasks
          if (intelligentTodos.length > 0) {
            usedLLM = true
            llmStatus = 'used'
            for (const t of intelligentTodos) {
              tasks.push({
                title: t.title,
                description: t.description,
                priority: t.priority as 'urgent' | 'normal',
                source: 'llm_intelligent',
                aiFeature: t.aiFeature ?? undefined,
                assignedRole: t.assignedRole ?? undefined,
                estimatedDays: t.estimatedDays ?? null,
                category: t.category ?? null,
                responsible: t.responsible ?? null,
              })
            }
            console.log(`[LLM 为主] 生成 ${intelligentTodos.length} 条智能待办`)
            appendGenerateTasksLog(`[待办生成] LLM 成功，生成 ${intelligentTodos.length} 条智能待办`)
            
            // 即使 LLM 成功，也应补充节日提醒（确保节日不被遗漏）
            const llmTitles = intelligentTodos.map(t => t.title)
            const hasEventInLLM = llmTitles.some(t => /节日|情人节|圣诞|宋干|水灯|倒计时|备货/.test(t))
            if (!hasEventInLLM && upcomingEvents.length > 0) {
              console.log(`[节日补充] LLM 未生成节日相关任务，补充 ${upcomingEvents.length} 个节日提醒`)
              for (const event of upcomingEvents) {
              tasks.push({
                  title: `【节日提醒】${event.name}倒计时${event.daysUntil}天 - 备货准备`,
                  description: `${event.name} ${event.daysUntil}天后到来。建议：${event.recommendation}`,
                  priority: event.daysUntil <= 7 ? ('urgent' as const) : ('normal' as const),
                  aiFeature: 'event',
                source: 'event',
                  assignedRole: 'operator',
                })
              }
            }
          } else {
            llmStatus = 'returned_empty'
            appendGenerateTasksLog('[待办生成] LLM 返回 0 条，走规则兜底')
          }
        } catch (e) {
          llmStatus = 'call_failed'
          console.warn('[LLM 智能待办] 调用失败，走规则兜底', e)
          appendGenerateTasksLog(`[待办生成] LLM 调用失败，走规则兜底: ${(e as Error)?.message ?? String(e)}`)
        }
      }

      // 【规则为辅】未配置 LLM 或 LLM 无结果时，规则引擎全量兜底
      if (!usedLLM) {
        const llmHint = ' 建议配置话术 LLM 后点击「智能生成」获取个性化待办。'
        if (anomalies.length > 0) {
          console.log(`[异常检测] 发现${anomalies.length}个异常`)
          for (const anomaly of anomalies) {
            tasks.push({
              title: `【异常】${anomaly.metric}${anomaly.change}下降 - 紧急诊断`,
              description: `数据异常：${anomaly.description}。当前值 ${anomaly.currentValue.toFixed(2)}，预期值 ${anomaly.expectedValue.toFixed(2)}，变化 ${anomaly.change}。${llmHint}`,
              priority: anomaly.severity === 'critical' ? 'urgent' : 'normal',
              aiFeature: anomaly.aiFeature,
              source: 'anomaly',
            })
          }
        }
        const stageTasks = generateStageBasedTasks(storeStage, storeInfo, currentStats, statsRecordCount)
        tasks.push(...stageTasks.map((t) => ({ ...t, source: 'stage' })))
        if (trendAnalysis && trendAnalysis.trend === 'declining') {
          tasks.push({
            title: '【趋势预警】GMV连续下降 - 制定扭转计划',
            description: `${trendAnalysis.description}。${llmHint}`,
            priority: 'urgent',
            source: 'anomaly',
          })
        }
        if (upcomingEvents.length > 0) {
          console.log(`[节日提醒] 发现${upcomingEvents.length}个即将到来的节日`)
          for (const event of upcomingEvents) {
            tasks.push({
              title: `【节日提醒】${event.name}倒计时${event.daysUntil}天 - 备货准备`,
              description: `${event.name} ${event.daysUntil}天后。${event.recommendation}。${llmHint}`,
              priority: event.daysUntil <= 7 ? 'urgent' : 'normal',
              aiFeature: 'event',
              source: 'event',
            })
          }
        }
        console.log(`[动态阈值] 转化率最低=${thresholds.conversionRate.min.toFixed(2)}%, 目标=${thresholds.conversionRate.target.toFixed(2)}%`)

        // 5.1 转化率优化（动态阈值）
        if (conversionRate < thresholds.conversionRate.min && viewers > 100) {
          const industryBenchmark = getConversionRateBenchmark(storeCategories, storeInfo?.minPrice, storeInfo?.maxPrice, storeInfo?.platform)
          const targetRate = thresholds.conversionRate.target
          const expectedOrders = Math.round(viewers * targetRate / 100)
          const additionalOrders = expectedOrders - orders
          const potentialGMV = additionalOrders * avgOrderValue

          tasks.push({
            title: `提升转化率至 ${targetRate.toFixed(1)}%`,
            description: `当前转化率 ${conversionRate.toFixed(2)}%，目标 ${targetRate.toFixed(1)}%。${industryBenchmark.comparison}。预计可增加 ${Math.max(0, additionalOrders)} 单、GMV ¥${Math.round(Math.max(0, potentialGMV)).toLocaleString()}。${llmHint}`,
            priority: conversionRate < thresholds.conversionRate.min * 0.8 ? 'urgent' : 'normal',
            aiFeature: 'script',
            source: 'threshold',
          })
        }

        // 5.2 直播时长优化（动态阈值）
        if (duration > 0 && gmvPerHour < thresholds.gmvPerHour.min) {
          const targetHours = Math.min(168, duration + 10)
          const additionalHours = targetHours - duration
          const expectedGMV = gmv + (additionalHours * gmvPerHour * 0.8)
          const growthPercent = gmv > 0 ? ((expectedGMV / gmv - 1) * 100).toFixed(0) : '0'

          tasks.push({
            title: `增加直播时长至 ${targetHours.toFixed(1)} 小时/周`,
            description: `当前 ${duration.toFixed(1)}h/周，时均 GMV ¥${Math.round(gmvPerHour).toLocaleString()}。建议增至 ${targetHours.toFixed(1)}h（+${additionalHours.toFixed(1)}h），预计周 GMV ¥${Math.round(expectedGMV).toLocaleString()}（+${growthPercent}%）。${llmHint}`,
            priority: duration < 15 ? 'urgent' : 'normal',
            aiFeature: 'schedule',
            source: 'threshold',
          })
        }

        // 5.3 互动率优化（动态阈值）
        if (interactionRate < thresholds.interactionRate.min && viewers > 50) {
          const targetRate = thresholds.interactionRate.target
          const expectedInteractions = Math.round(viewers * targetRate / 100)
          const additionalInteractions = expectedInteractions - interactions

          tasks.push({
            title: `提升互动率至 ${targetRate.toFixed(1)}%`,
            description: `当前互动率 ${interactionRate.toFixed(2)}%，目标 ${targetRate.toFixed(1)}%。预计需增加 ${Math.max(0, additionalInteractions)} 次互动。${llmHint}`,
            priority: interactionRate < thresholds.interactionRate.min * 0.8 ? 'urgent' : 'normal',
            aiFeature: 'engagement',
            source: 'threshold',
          })
        }

        // 5.4 客单价优化（动态阈值）
        if (avgOrderValue > 0 && avgOrderValue < thresholds.avgOrderValue.min && orders > 10) {
          const categoryAOVBenchmark = getCategoryAOVBenchmark(storeCategories)
          const targetAOV = thresholds.avgOrderValue.target
          const potentialGMV = orders * targetAOV - gmv
          const growthPercent = avgOrderValue > 0 ? ((targetAOV / avgOrderValue - 1) * 100).toFixed(0) : '0'

          tasks.push({
            title: `提升客单价至 ¥${Math.round(targetAOV)}`,
            description: `当前客单价 ¥${Math.round(avgOrderValue)}，目标 ¥${Math.round(targetAOV)}（行业约 ¥${Math.round(categoryAOVBenchmark)}）。预计可提升 GMV ¥${Math.round(Math.max(0, potentialGMV)).toLocaleString()}（+${growthPercent}%）。${llmHint}`,
            priority: 'normal',
            aiFeature: 'pricing',
            source: 'threshold',
          })
        }

        // 5.5 观看人数增长（动态阈值）
        if (viewers < thresholds.viewers.min && duration > 10) {
          const storeTier = getStoreTier(gmv)
          const targetViewers = Math.max(thresholds.viewers.target, storeTier.targetViewers)
          const additionalViewers = targetViewers - viewers

          tasks.push({
            title: `提升观看人数至 ${targetViewers} 人/周`,
            description: `当前 ${viewers} 人/周，目标 ${targetViewers} 人（${storeTier.name} 级别）。预计可增加 ${Math.max(0, additionalViewers)} 人。${llmHint}`,
            priority: viewers < thresholds.viewers.min * 0.8 ? 'urgent' : 'normal',
            aiFeature: 'marketing',
            source: 'threshold',
          })
        }

        // 冷启动且历史数据期数少时补充短视频引流，避免已有多期数据的店铺被重复建议
        if (storeStage.stage === 'cold_start' && viewers < 200 && statsRecordCount <= 2) {
          tasks.push({
            title: '每日发布1-2条短视频引流',
            description: `冷启动期，当前观看 ${viewers}。${llmHint}`,
            priority: 'urgent',
            aiFeature: 'content',
            source: 'stage',
          })
        }
      }
      } // end hasRealDataFallback
    } else {
      // 最近 30 天无汇总数据：统一为「请上传最近30天的运营数据」（无论从未上传或仅有历史数据）
      const noDataHint = ' 建议配置话术 LLM 后上传数据再点击「智能生成」获取智能待办。'
      if (statsRecordCount === 0) {
        console.log('[无数据] 店铺无任何统计记录，生成上传数据引导任务')
      } else {
        console.log(`[无数据] 店铺已有 ${statsRecordCount} 条历史数据，但最近30天无数据`)
      }
      tasks.push({
        title: '请上传最近30天的运营数据',
        description: `上传后系统将基于数据自动生成运营建议与待办。请前往「数据上传」选择本店铺并导入最近30天数据。${noDataHint}`,
        priority: 'urgent',
        source: 'stage',
      })

      const hasAudienceNoData = !!storeInfo?.targetAudience?.trim()
      const hasPositioningNoData = !!storeInfo?.brandPositioning?.trim()
      const hasPriceRangeNoData = storeInfo?.minPrice != null || storeInfo?.maxPrice != null
      if (!hasAudienceNoData && !hasPositioningNoData && !hasPriceRangeNoData) {
      tasks.push({
        title: '【新店铺】完善店铺信息',
          description: `店铺基础信息未填（目标人群、品牌定位、价格区间等）。${noDataHint}`,
        priority: 'normal',
        aiFeature: 'positioning',
        source: 'stage',
      })
    }

      const upcomingEventsNoData = getUpcomingEvents(storeInfo?.region || 'CN', new Date())
      if (upcomingEventsNoData.length > 0) {
        console.log(`[节日提醒] 无数据分支补充 ${upcomingEventsNoData.length} 个节日/大促待办`)
        for (const event of upcomingEventsNoData) {
          tasks.push({
            title: `【节日提醒】${event.name}倒计时${event.daysUntil}天 - 备货准备`,
            description: `${event.name} ${event.daysUntil}天后。${event.recommendation}。${noDataHint}`,
            priority: event.daysUntil <= 7 ? 'urgent' : 'normal',
            aiFeature: 'event',
            source: 'event',
          })
        }
      }
    }
    } // end if (!useAgentMethodResult)

    // 如果没有任何任务，生成通用提示
    if (tasks.length === 0) {
      console.log('[数据正常] 所有指标表现良好')
      tasks.push({
        title: '数据表现良好 - 持续优化',
        description: '当前无异常指标。建议配置话术 LLM 后点击「智能生成」获取持续优化建议。',
        priority: 'normal',
        source: 'threshold',
      })
    }

    // 结构性优化 1：同节日多条合并为一条（按节日名去重，保留第一条）
    const eventNameRe = /【节日提醒】([^倒]+)倒计时|筹备([^主]+)(主题)?直播|([^节]+)节/
    const seenEventNames = new Set<string>()
    let tasksAfterEventMerge = tasks.filter((task) => {
      if (task.source !== 'event') return true
      const title = (task.title || '').trim()
      const m = title.match(eventNameRe)
      const name = (m && (m[1] || m[2] || m[4] || '').trim()) || title.slice(0, 8)
      if (seenEventNames.has(name)) return false
      seenEventNames.add(name)
      return true
    })
    if (tasksAfterEventMerge.length < tasks.length) {
      console.log(`[去重] 节日合并 ${tasks.length} -> ${tasksAfterEventMerge.length} 条`)
      appendGenerateTasksLog(`[去重] 节日合并 ${tasks.length} -> ${tasksAfterEventMerge.length}`)
    }

    /** 同主题去重：标题前 8 字相同视为同主题（结构性优化） */
    const TITLE_PREFIX_LEN = 8
    const toPrefix = (t: string) => (t || '').trim().slice(0, TITLE_PREFIX_LEN)
    const seenInRun = new Set<string>()
    let tasksDeduped = tasksAfterEventMerge.filter((task) => {
      const key = (task.title || '').trim()
      if (!key || seenInRun.has(key)) return false
      const prefix = toPrefix(key)
      if (prefix.length >= TITLE_PREFIX_LEN) {
        for (const existing of seenInRun) {
          if (toPrefix(existing) === prefix) return false
        }
      }
      seenInRun.add(key)
      return true
    })
    if (tasksDeduped.length < tasksAfterEventMerge.length) {
      console.log(`[去重] 同标题/同主题去重 ${tasksAfterEventMerge.length} -> ${tasksDeduped.length} 条`)
      appendGenerateTasksLog(`[去重] 同标题/同主题去重 ${tasksAfterEventMerge.length} -> ${tasksDeduped.length}`)
    }

    // 结构性优化 2：自然因素/大促节日单独计算；其余按「最近发展区」排序（当下数据+直播运营逻辑下最应投入的优先），保留主待办上限
    const isEventOrPromo = (t: { title?: string; source?: string }): boolean => {
      const title = (t.title || '').trim()
      return t.source === 'event' || /节日|倒计时|情人节|圣诞|宋干|水灯|备货|大促|自然因素/.test(title)
    }
    const eventTasks = tasksDeduped.filter(isEventOrPromo)
    const mainTasks = tasksDeduped.filter((t) => !isEventOrPromo(t))
    const getRelevanceOrder = (t: { title?: string; source?: string; aiFeature?: string }): number => {
      const title = (t.title || '').trim()
      if (/请上传|上传.*数据/.test(title)) return 0
      if (t.source === 'stage' || /流量|转化路径|引流|冷启动|基础搭建/.test(title)) return 1
      if (/转化率|话术|选品|商品推荐|直播内容|直播节奏/.test(title) || ['script', 'content', 'product_recommend'].includes(t.aiFeature || '')) return 2
      if (t.source === 'anomaly') return 3
      if (/数据|报告|GMV|复盘|统计/.test(title) || ['stats', 'report', 'market-analysis'].includes(t.aiFeature || '')) return 4
      if (t.source === 'threshold') return 5
      return 6
    }
    const sortedMain = [...mainTasks].sort((a, b) => {
      const prio = (p: string) => (p === 'urgent' ? 0 : 1)
      if (prio(a.priority) !== prio(b.priority)) return prio(a.priority) - prio(b.priority)
      return getRelevanceOrder(a) - getRelevanceOrder(b)
    })
    const MAIN_MIN = 6
    const MAIN_MAX = 10
    // 节日、自然因素等不占主待办数量限制，全部保留（可超出主待办条数）
    const eventKept = eventTasks
    const mainKept = sortedMain.length <= MAIN_MAX ? sortedMain : sortedMain.slice(0, MAIN_MAX)
    tasksDeduped = [...eventKept, ...mainKept]
    if (eventKept.length > 0 || sortedMain.length > MAIN_MAX) {
      console.log(`[去重] 自然/节日 ${eventKept.length} 条（另计、不设上限），主待办 ${mainKept.length} 条（${MAIN_MIN}～${MAIN_MAX}），共 ${tasksDeduped.length} 条`)
      appendGenerateTasksLog(`[去重] 节日${eventKept.length}条另计不设上限，主待办${mainKept.length}条(6～10)，共${tasksDeduped.length}条`)
    }

    /** 从标题去掉末尾的「 (月/日)」后缀，用于与已有待办做基标题比对 */
    const getBaseTitle = (title: string) => (title || '').replace(/\s*\(\d{1,2}\/\d{1,2}\)\s*$/, '').trim()

    // 去重并创建任务（清空已在步骤 0 完成）：本批内同标题或同主题前缀只保留一条
    const createdTasks: Array<
      GenerateTasksItem & {
        id: string
        source: string
        status: string
        userId: string
        storeId: string | null
        createdAt: string
        weekStart: string
      }
    > = []
    let skippedDuplicateCount = 0
    const existingBaseTitles = new Set<string>()
    const existingPrefixes = new Set<string>()
    const hasNoPendingTasks = existingBaseTitles.size === 0
    if (hasNoPendingTasks) {
      console.log('[生成任务] 当前无待办，直接插入全部生成结果')
      appendGenerateTasksLog('[生成任务] 当前无待办，直接插入全部生成结果')
    }
    for (const task of tasksDeduped) {
      const baseTitle = getBaseTitle(task.title)
      const prefix = toPrefix(baseTitle)
      if (existingBaseTitles.has(baseTitle)) {
            skippedDuplicateCount += 1
        console.log(`[去重] 已有同标题/同基标题待办，跳过: ${task.title}`)
        appendGenerateTasksLog(`[去重] 已有待办，跳过: ${task.title}`)
            continue
          }
      if (prefix.length >= TITLE_PREFIX_LEN && existingPrefixes.has(prefix)) {
        skippedDuplicateCount += 1
        console.log(`[去重] 已有同主题待办(前缀${prefix})，跳过: ${task.title}`)
        appendGenerateTasksLog(`[去重] 同主题重复，跳过: ${task.title}`)
        continue
      }
      const titleToUse = task.title

      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()

      const taskSource = task.source ?? 'llm_intelligent'
      const desc = task.description != null ? String(task.description) : ''
      const pri = (task.priority && String(task.priority).trim()) || 'normal'
      const est = task.estimatedDays != null && String(task.estimatedDays).trim() ? String(task.estimatedDays).trim().slice(0, 64) : null
      const cat = task.category != null && String(task.category).trim() ? String(task.category).trim().slice(0, 64) : null
      const resp = task.responsible != null && String(task.responsible).trim() ? String(task.responsible).trim().slice(0, 128) : null
      try {
      await dbRun(
          'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt, aiFeature, source, assignedRole, estimatedDays, category, responsible, weekStart) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            titleToUse,
            desc,
            pri,
            'pending',
            taskOwnerId,
            storeId || null,
            createdAt,
            task.aiFeature ?? null,
            taskSource,
            task.assignedRole ?? null,
            est,
            cat,
            resp,
            weekStartStr,
          ]
        )
      } catch (insertErr: any) {
        const msg = String(insertErr?.message ?? '')
        if (msg.includes('no such column')) {
          try {
            await dbRun(
              'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt, aiFeature, source, assignedRole) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, titleToUse, desc, pri, 'pending', taskOwnerId, storeId || null, createdAt, task.aiFeature ?? null, taskSource, task.assignedRole ?? null]
            )
          } catch (e2: any) {
            const m2 = String(e2?.message ?? '')
            if (m2.includes('assignedRole') || m2.includes('no such column')) {
              await dbRun(
                'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt, aiFeature, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, titleToUse, desc, pri, 'pending', taskOwnerId, storeId || null, createdAt, task.aiFeature ?? null, taskSource]
              )
            } else {
              throw e2
            }
          }
        } else if (msg.includes('assignedRole')) {
          await dbRun(
            'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt, aiFeature, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, titleToUse, desc, pri, 'pending', taskOwnerId, storeId || null, createdAt, task.aiFeature ?? null, taskSource]
          )
        } else {
          throw insertErr
        }
      }
      existingBaseTitles.add(baseTitle)
      if (prefix.length >= TITLE_PREFIX_LEN) existingPrefixes.add(prefix)

      createdTasks.push({
        id,
        ...task,
        title: titleToUse,
        description: task.description,
        priority: task.priority,
        source: task.source ?? 'llm_intelligent',
        status: 'pending',
        userId: taskOwnerId,
        storeId: storeId || null,
        createdAt,
        aiFeature: task.aiFeature,
        assignedRole: task.assignedRole,
        estimatedDays: est,
        category: cat,
        responsible: resp,
        weekStart: weekStartStr,
      })

      console.log(`[创建任务] ${titleToUse} (来源: ${task.source})`)
      appendGenerateTasksLog(`[创建任务] ${titleToUse} (来源: ${task.source})`)
    }
    if (createdTasks.length === 0 && tasksDeduped.length > 0) {
      console.warn('[生成任务] 本次 0 条新任务，生成数=', tasksDeduped.length, '跳过(重复)=', skippedDuplicateCount)
      appendGenerateTasksLog(`[生成任务] 本次 0 条新任务，生成数=${tasksDeduped.length} 跳过(重复)=${skippedDuplicateCount}`)
    }

    logRequest({
      event: 'generate-tasks',
      requestId,
      userId,
      storeId: storeId || undefined,
      durationMs: Date.now() - startTime,
    })
    const duplicateMessage =
      skippedDuplicateCount > 0 && tasksDeduped.length > 0
        ? `本次生成了 ${tasksDeduped.length} 条建议，均与当前待办重复，未添加新任务。耗时主要来自 AI 调用（约 20～40 秒）。可先完成或关闭部分待办后再点击「智能生成」，将尝试产出不同维度的新建议。`
        : skippedDuplicateCount > 0
          ? '本次建议与已有待办重复，未添加新任务'
          : ''
    const llmStatusMessages: Record<typeof llmStatus, string> = {
      used: '',
      not_configured: '未检测到 LLM 配置，当前为规则待办。请在「管理员」-「LLM 配置」中填写 API 地址与密钥，或设置环境变量 SCRIPT_LLM_URL、SCRIPT_LLM_API_KEY 后重启。',
      skipped_env: '当前环境已跳过 LLM（SKIP_TODO_LLM=1），仅使用规则兜底。',
      no_data: '当前店铺在 stats 中无任何运营数据，未调用 LLM，已用规则兜底。12 月等历史数据会按「以该店最新有数据日为终点的 30 天」参与生成；若 12 月有数据仍提示本句，请确认当前选中的店铺与看到 12 月数据时是同一店铺，或先导入该店数据/选择「无数据时用：某店」。',
      returned_empty: '本次 LLM 返回为空，已用规则兜底。可检查 Coze 配置或稍后重试。',
      call_failed: 'LLM 调用失败，已用规则兜底。请检查网络与 API 配置。',
    }
    res.json({
      message: createdTasks.length > 0 ? `成功生成 ${createdTasks.length} 个智能任务` : (duplicateMessage || '已刷新，当前无新任务'),
      tasks: createdTasks,
      metadata: {
        serverBuild: '2026-04-10-cache-unlocked',
        generatedCount: tasksDeduped.length,
        createdCount: createdTasks.length,
        skippedDuplicateCount,
        llmIntelligentCount: tasksDeduped.filter(t => t.source === 'llm_intelligent').length,
        llmStatus,
        llmStatusMessage: (typeof llmEmptyReasonFromStore !== 'undefined' && llmEmptyReasonFromStore && llmStatus === 'returned_empty')
          ? llmEmptyReasonFromStore
          : llmStatusMessages[llmStatus],
        /** 本次使用的数据区间（null=该店无 stats），便于确认 12 月等是否被用上 */
        statsDateRangeUsed: statsDateRangeUsed ?? undefined,
        statsDateRangeReason: statsDateRangeReason,
        /** 本次请求时后端是否检测到话术 LLM 配置（便于与前端「已配置」对比排查） */
        llmConfiguredAtRequestTime: isScriptLLMConfigured(),
        ruleCount:
          tasksDeduped.filter(t => t.source === 'event').length +
          tasksDeduped.filter(t => t.source === 'stage').length +
          tasksDeduped.filter(t => t.source === 'anomaly').length +
          tasksDeduped.filter(t => t.source === 'threshold').length,
        eventCount: tasksDeduped.filter(t => t.source === 'event').length,
        stageCount: tasksDeduped.filter(t => t.source === 'stage').length,
        anomalyCount: tasksDeduped.filter(t => t.source === 'anomaly').length,
        thresholdCount: tasksDeduped.filter(t => t.source === 'threshold').length,
        llmAnomalyCount: tasksDeduped.filter(t => t.source === 'llm_anomaly').length,
      },
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const message = err.message || '生成任务失败'
    logRequest({
      event: 'generate-tasks',
      requestId,
      userId: req.user?.userId,
      storeId: req.body?.storeId,
      durationMs: Date.now() - startTime,
      error: message,
    })
    console.error('生成任务失败:', message)
    if (err.stack) console.error(err.stack)
    res.status(500).json({
      error: '生成任务失败',
      /** 具体错误原因，便于在浏览器 Network 或控制台排查 */
      detail: message,
    })
  }
})

/** 导出供系统内 generate-tasks、节日/阶段等逻辑使用（Agent 协议已移除，无第三方 /api/agent 入口） */
export {
  getUpcomingEvents,
  getTimeContext,
  getStoreStage,
  generateIntelligentTodosWithLLM,
  getRawDailyStatsForLLM,
  getPeriodDateRange,
  aggregateStatsForRange,
  getYearOverYearStats,
  getMonthOverMonthStats,
  generateComparisonTasks,
}
export default router
