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

export { SCRIPT_LLM_REQUIRED_MESSAGE } from './ai/script'

const router = express.Router()

/** 生成任务相关日志同时写入文件，便于直接查看（路径: backend/generate-tasks.log） */
function appendGenerateTasksLog(line: string): void {
  try {
    const logPath = path.join(__dirname, '..', '..', 'generate-tasks.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // ignore
  }
}

/** 待办生成使用的统计周期：最近 30 天（降低单周偶然性） */
const TODO_STATS_DAYS = 30

const toStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 获取第 n 个 30 天区间的日期范围。n=0 为最近 30 天（含今天），n=1 为 30～60 天前，n=2 为 60～90 天前… */
function getPeriodDateRange(n: number): { dateFrom: string; dateTo: string } {
  const today = new Date()
  const end = new Date(today)
  end.setDate(end.getDate() - n * TODO_STATS_DAYS)
  const start = new Date(end)
  start.setDate(start.getDate() - (TODO_STATS_DAYS - 1))
  return { dateFrom: toStr(start), dateTo: toStr(end) }
}

/** 以 endDate（YYYY-MM-DD）为区间终点，取第 n 个 30 天区间。n=0 即 endDate 往前 30 天；n=1 即再往前 30 天… 用于「按最新有数据日回退」时的周期。 */
function getPeriodDateRangeFromEnd(endDate: string, n: number): { dateFrom: string; dateTo: string } {
  const end = new Date(endDate + 'T00:00:00')
  const endN = new Date(end)
  endN.setDate(endN.getDate() - n * TODO_STATS_DAYS)
  const start = new Date(endN)
  start.setDate(start.getDate() - (TODO_STATS_DAYS - 1))
  return { dateFrom: toStr(start), dateTo: toStr(endN) }
}

/** 查询该店铺在 stats 表中最新一条数据的日期（YYYY-MM-DD），无数据返回 null */
async function getStoreLatestStatsDate(storeId: string): Promise<string | null> {
  const row = await dbGet<{ maxDate: string }>(
    'SELECT MAX(date) as maxDate FROM stats WHERE storeId = ? AND date IS NOT NULL',
        [storeId]
      )
  return row?.maxDate ?? null
}

/** 在指定日期范围内按 storeId 汇总 stats，返回一条聚合记录。含 Excel 全维度聚合，供 LLM 入参。 */
async function aggregateStatsForRange(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  totalGMV: number
  totalDuration: number
  totalViewers: number
  totalOrders: number
  totalInteractions: number
  totalRounds?: number
  totalLikes?: number
  totalComments?: number
  totalShares?: number
  totalFollows?: number
  totalProductViews?: number
  totalProductClicks?: number
  totalCompletedOrders?: number
} | null> {
  const row = await dbGet<{
    totalGMV: number
    totalDuration: number
    totalViewers: number
    totalOrders: number
    totalInteractions: number
    totalRounds: number
    totalLikes: number
    totalComments: number
    totalShares: number
    totalFollows: number
    totalProductViews: number
    totalProductClicks: number
    totalCompletedOrders: number
  }>(
    `SELECT
       COALESCE(SUM(totalGMV), 0) as totalGMV,
       COALESCE(SUM(totalDuration), 0) as totalDuration,
       COALESCE(SUM(totalViewers), 0) as totalViewers,
       COALESCE(SUM(totalOrders), 0) as totalOrders,
       COALESCE(SUM(totalInteractions), 0) as totalInteractions,
       COALESCE(SUM(rounds), 0) as totalRounds,
       COALESCE(SUM(likes), 0) as totalLikes,
       COALESCE(SUM(comments), 0) as totalComments,
       COALESCE(SUM(shares), 0) as totalShares,
       COALESCE(SUM(follows), 0) as totalFollows,
       COALESCE(SUM(productViews), 0) as totalProductViews,
       COALESCE(SUM(productClicks), 0) as totalProductClicks,
       COALESCE(SUM(completedOrders), 0) as totalCompletedOrders
     FROM stats WHERE storeId = ? AND date >= ? AND date <= ?`,
    [storeId, dateFrom, dateTo]
  )
  if (!row) return null
  return {
    totalGMV: Number(row.totalGMV) || 0,
    totalDuration: Number(row.totalDuration) || 0,
    totalViewers: Number(row.totalViewers) || 0,
    totalOrders: Number(row.totalOrders) || 0,
    totalInteractions: Number(row.totalInteractions) || 0,
    totalRounds: Number(row.totalRounds) || 0,
    totalLikes: Number(row.totalLikes) || 0,
    totalComments: Number(row.totalComments) || 0,
    totalShares: Number(row.totalShares) || 0,
    totalFollows: Number(row.totalFollows) || 0,
    totalProductViews: Number(row.totalProductViews) || 0,
    totalProductClicks: Number(row.totalProductClicks) || 0,
    totalCompletedOrders: Number(row.totalCompletedOrders) || 0,
  }
}

/** 获取指定日期范围内按日明细，格式化为 TSV 供 Coze 分析。compact 时 21 天 + 8 列（含互动），以降低超时风险同时供 LLM 判断互动趋势。 */
async function getRawDailyStatsForLLM(
  storeId: string,
  dateFrom: string,
  dateTo: string,
  options?: { compact?: boolean }
): Promise<string> {
  const compact = options?.compact === true
  const limit = compact ? 21 : 31
  if (compact) {
    const rows = await dbAll<{
      date: string
      totalGMV: number
      totalDuration: number
      totalViewers: number
      totalOrders: number
      totalInteractions: number
      averageConversionRate: number
      gmvPerHour: number
    }>(
      `SELECT date, totalGMV, totalDuration, totalViewers, totalOrders,
              COALESCE(totalInteractions, 0) as totalInteractions,
              COALESCE(averageConversionRate, 0) as averageConversionRate,
              COALESCE(gmvPerHour, 0) as gmvPerHour
       FROM stats WHERE storeId = ? AND date >= ? AND date <= ?
       ORDER BY date ASC LIMIT ${limit}`,
      [storeId, dateFrom, dateTo]
    )
    if (!rows || rows.length === 0) return ''
    const header = '日期\tGMV\t时长(h)\t观看\t订单\t互动\t转化率(%)\t时均GMV'
    const lines = rows.map((r) => {
      const conv = ((Number(r.averageConversionRate) || 0) * 100).toFixed(2)
      const gph = Math.round(Number(r.gmvPerHour) || 0)
      return `${r.date}\t${Math.round(Number(r.totalGMV) || 0)}\t${(Number(r.totalDuration) || 0).toFixed(1)}\t${Number(r.totalViewers) || 0}\t${Number(r.totalOrders) || 0}\t${Number(r.totalInteractions) || 0}\t${conv}\t${gph}`
    })
    return [header, ...lines].join('\n')
  }
  const rows = await dbAll<{
    date: string
    totalGMV: number
    totalDuration: number
    totalViewers: number
    activeViewers: number
    totalOrders: number
    completedOrders: number
    totalInteractions: number
    likes: number
    comments: number
    shares: number
    follows: number
    productViews: number
    productClicks: number
    rounds: number
    averageConversionRate: number
    clickThroughRate: number
    interactionRate: number
    gmvPerHour: number
  }>(
    `SELECT date, totalGMV, totalDuration, totalViewers, 
            COALESCE(activeViewers, 0) as activeViewers,
            totalOrders, 
            COALESCE(completedOrders, 0) as completedOrders,
            totalInteractions,
            COALESCE(likes, 0) as likes,
            COALESCE(comments, 0) as comments,
            COALESCE(shares, 0) as shares,
            COALESCE(follows, 0) as follows,
            COALESCE(productViews, 0) as productViews,
            COALESCE(productClicks, 0) as productClicks,
            COALESCE(rounds, 0) as rounds,
            COALESCE(averageConversionRate, 0) as averageConversionRate,
            COALESCE(clickThroughRate, 0) as clickThroughRate,
            COALESCE(interactionRate, 0) as interactionRate,
            COALESCE(gmvPerHour, 0) as gmvPerHour
     FROM stats WHERE storeId = ? AND date >= ? AND date <= ?
     ORDER BY date ASC LIMIT ${limit}`,
    [storeId, dateFrom, dateTo]
  )
  if (!rows || rows.length === 0) return ''
  const header = '日期\tGMV\t时长(h)\t观看\t在线\t订单\t完成\t互动\t点赞\t评论\t分享\t关注\t商品曝光\t商品点击\t场次\t转化率(%)\t点击率(%)\t互动率(%)\t时均GMV'
  const lines = rows.map((r) => {
    const conv = ((Number(r.averageConversionRate) || 0) * 100).toFixed(2)
    const ctr = ((Number(r.clickThroughRate) || 0) * 100).toFixed(2)
    const ir = ((Number(r.interactionRate) || 0) * 100).toFixed(2)
    const gph = Math.round(Number(r.gmvPerHour) || 0)
    return `${r.date}\t${Math.round(Number(r.totalGMV) || 0)}\t${(Number(r.totalDuration) || 0).toFixed(1)}\t${Number(r.totalViewers) || 0}\t${Number(r.activeViewers) || 0}\t${Number(r.totalOrders) || 0}\t${Number(r.completedOrders) || 0}\t${Number(r.totalInteractions) || 0}\t${Number(r.likes) || 0}\t${Number(r.comments) || 0}\t${Number(r.shares) || 0}\t${Number(r.follows) || 0}\t${Number(r.productViews) || 0}\t${Number(r.productClicks) || 0}\t${Number(r.rounds) || 0}\t${conv}\t${ctr}\t${ir}\t${gph}`
  })
  return [header, ...lines].join('\n')
}

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

    let tasks: Array<{ title: string; description: string; priority: string }> = []
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
      tasks = result.tasks.map((t) => ({ title: t.title, description: t.description, priority: t.priority }))
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
      tasks = llmResult.tasks.map((t) => ({ title: t.title, description: t.description, priority: t.priority }))
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
    const { script, tasks, anomaly, video } = req.body ?? {}
    const mapping: FeatureLlmMapping = {}
    if (script != null && typeof script === 'string' && script.trim()) mapping.script = script.trim()
    if (tasks != null && typeof tasks === 'string' && tasks.trim()) mapping.tasks = tasks.trim()
    if (anomaly != null && typeof anomaly === 'string' && anomaly.trim()) mapping.anomaly = anomaly.trim()
    if (video != null && typeof video === 'string' && video.trim()) mapping.video = video.trim()
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

/**
 * 基于店铺品类、区域和目标受众推荐最佳直播时段
 */
function getRecommendedTimeSlot(categories: string[], region?: string, targetAudience?: string): string {
  const categoryTimeSlots: { [key: string]: { time: string; reason: string } } = {
    '服饰鞋包': { time: '19:00-22:00', reason: '下班后购物高峰，女性用户活跃' },
    '女装': { time: '19:30-22:30', reason: '女性用户晚间浏览高峰，转化率高' },
    '男装': { time: '20:00-22:00', reason: '男性用户晚间休闲时段' },
    '美妆个护': { time: '20:00-23:00', reason: '晚间护肤、化妆教程观看高峰' },
    '面部护肤': { time: '20:00-23:00', reason: '晚间护肤习惯，女性用户活跃' },
    '彩妆': { time: '19:00-22:00', reason: '下班后化妆教程需求旺盛' },
    '食品健康': { time: '10:00-12:00, 18:00-20:00', reason: '早午餐前和晚餐时段，食品购买欲强' },
    '休闲零食': { time: '15:00-17:00, 20:00-22:00', reason: '下午茶和晚间零食时段' },
    '生鲜': { time: '08:00-10:00, 17:00-19:00', reason: '早市和晚市买菜高峰' },
    '亲子生活': { time: '10:00-12:00, 19:00-21:00', reason: '妈妈群体上午和晚间带娃时段' },
    '母婴': { time: '10:00-12:00, 20:00-22:00', reason: '宝妈上午休息和晚间哄睡后时段' },
    '童装': { time: '10:00-12:00, 19:00-21:00', reason: '妈妈群体购物高峰' },
    '家居家电': { time: '20:00-22:00', reason: '晚间家庭决策时段' },
    '家电': { time: '20:00-22:00', reason: '晚间家庭成员共同决策' },
    '3C数码': { time: '20:00-23:00', reason: '男性用户晚间数码产品研究高峰' },
    '手机': { time: '20:00-23:00', reason: '晚间数码爱好者活跃时段' },
    '电脑': { time: '20:00-23:00', reason: '晚间技术讨论和购买决策时段' },
    '运动户外': { time: '18:00-20:00, 21:00-23:00', reason: '下班后运动和晚间运动后休息时段' },
    '运动服饰': { time: '18:00-20:00', reason: '下班后运动装备购买高峰' },
    '珠宝文玩': { time: '20:00-22:00', reason: '高客单价商品，晚间决策时段' },
    '珠宝': { time: '20:00-22:00', reason: '高价值商品，需要充足时间决策' },
    '虚拟商品': { time: '19:00-23:00', reason: '晚间游戏充值和会员购买高峰' },
    '游戏充值': { time: '20:00-23:00', reason: '晚间游戏时段，充值需求旺盛' },
    '宠物食品': { time: '19:00-22:00', reason: '晚间宠物主人休闲购物时段' },
    '宠物用品': { time: '19:00-22:00', reason: '晚间宠物主人浏览高峰' },
  }

  const audienceTimeSlots: { [key: string]: { time: string; reason: string } } = {
    '25-45岁女性': { time: '19:00-22:00', reason: '下班后和晚间家务后休闲时段' },
    '18-35岁年轻人': { time: '19:00-23:00', reason: '年轻人晚间活跃时段' },
    '中年人': { time: '19:00-21:00', reason: '晚饭后休闲时段' },
    '大众市场': { time: '19:00-22:00', reason: '晚间黄金时段，覆盖最广泛人群' },
    '学生': { time: '19:00-22:00', reason: '晚自习后休闲时段' },
    '上班族': { time: '19:00-22:00', reason: '下班后休闲购物时段' },
    '宝妈': { time: '10:00-12:00, 20:00-22:00', reason: '上午休息和晚间哄睡后时段' },
    '宠物主': { time: '19:00-22:00', reason: '晚间遛狗后休闲时段' },
  }

  const regionAdjustment: { [key: string]: { offset: string; note: string } } = {
    '曼谷': { offset: '(当地时间)', note: '泰国时区GMT+7' },
    '泰国': { offset: '(当地时间)', note: '泰国时区GMT+7' },
    'Thailand': { offset: '(local time)', note: 'Thailand GMT+7' },
  }

  let recommendedTime = ''
  let reason = ''
  let dataSource = ''

  for (const category of categories) {
    if (categoryTimeSlots[category]) {
      recommendedTime = categoryTimeSlots[category].time
      reason = categoryTimeSlots[category].reason
      dataSource = `基于「${category}」品类大盘数据`
      break
    }
  }

  if (!recommendedTime && targetAudience) {
    for (const key in audienceTimeSlots) {
      if (targetAudience.includes(key)) {
        recommendedTime = audienceTimeSlots[key].time
        reason = audienceTimeSlots[key].reason
        dataSource = `基于「${key}」受众画像`
        break
      }
    }
  }

  if (!recommendedTime) {
    recommendedTime = '19:00-22:00'
    reason = '晚间黄金时段，覆盖最广泛人群'
    dataSource = '基于全平台大盘数据'
  }

  let regionNote = ''
  if (region) {
    for (const key in regionAdjustment) {
      if (region.includes(key)) {
        regionNote = ` ${regionAdjustment[key].offset}`
        break
      }
    }
  }

  return `建议时间段：${recommendedTime}${regionNote}（${dataSource}：${reason}）`
}

/** 根据店铺平台返回数据来源文案（TikTok 店铺不显示抖音/快手） */
function getDataSourceByPlatform(platform?: string): string {
  const p = (platform || '').trim()
  if (p === 'TikTok') return 'TikTok平台2024-2025年Q4大盘数据'
  if (p === '抖音') return '抖音平台2024-2025年Q4大盘数据'
  if (p === '快手') return '快手平台2024-2025年Q4大盘数据'
  if (p === '淘宝' || p === '天猫') return '淘宝/天猫平台2024-2025年Q4大盘数据'
  if (p === '京东') return '京东平台2024-2025年Q4大盘数据'
  if (p) return `${p}平台2024-2025年Q4大盘数据`
  return '行业大盘数据'
}

/**
 * 基于品类和价格区间获取转化率行业基准
 */
function getConversionRateBenchmark(
  categories: string[],
  minPrice?: number,
  maxPrice?: number,
  platform?: string
): { rate: number; comparison: string } {
  const categoryBenchmarks: { [key: string]: number } = {
    '服饰鞋包': 3.5,
    '女装': 4.0,
    '男装': 3.2,
    '美妆个护': 5.0,
    '面部护肤': 5.5,
    '彩妆': 4.8,
    '食品健康': 4.5,
    '休闲零食': 6.0,
    '生鲜': 3.8,
    '亲子生活': 4.2,
    '母婴': 4.5,
    '童装': 3.8,
    '家居家电': 2.5,
    '家电': 2.2,
    '3C数码': 2.0,
    '手机': 1.8,
    '电脑': 1.5,
    '运动户外': 3.0,
    '珠宝文玩': 1.5,
    '珠宝': 1.2,
    '虚拟商品': 8.0,
    '游戏充值': 10.0,
    '宠物食品': 4.5,
    '宠物用品': 3.8,
  }

  const avgPrice = minPrice && maxPrice ? (minPrice + maxPrice) / 2 : null
  let priceAdjustment = 1.0
  let priceNote = ''

  if (avgPrice !== null) {
    if (avgPrice < 50) {
      priceAdjustment = 1.3
      priceNote = '，低价商品（<50元）基准上调30%'
    } else if (avgPrice < 200) {
      priceAdjustment = 1.0
      priceNote = '，中低价商品（50-200元）'
    } else if (avgPrice < 500) {
      priceAdjustment = 0.8
      priceNote = '，中高价商品（200-500元）基准下调20%'
    } else {
      priceAdjustment = 0.6
      priceNote = '，高价商品（>500元）基准下调40%'
    }
  }

  let baseBenchmark = 3.5
  let categoryName = '全平台'

  for (const category of categories) {
    if (categoryBenchmarks[category]) {
      baseBenchmark = categoryBenchmarks[category]
      categoryName = category
      break
    }
  }

  const finalBenchmark = parseFloat((baseBenchmark * priceAdjustment).toFixed(1))
  const dataSource = getDataSourceByPlatform(platform)
  const comparison = `低于「${categoryName}」品类基准 ${finalBenchmark}%${priceNote}（数据来源：${dataSource}）`

  return { rate: finalBenchmark, comparison }
}

/**
 * 获取品类客单价行业基准
 */
function getCategoryAOVBenchmark(categories: string[]): number {
  const categoryAOVBenchmarks: { [key: string]: number } = {
    '服饰鞋包': 180,
    '女装': 150,
    '男装': 200,
    '美妆个护': 220,
    '面部护肤': 280,
    '彩妆': 160,
    '食品健康': 80,
    '休闲零食': 50,
    '生鲜': 120,
    '亲子生活': 150,
    '母婴': 200,
    '童装': 120,
    '家居家电': 500,
    '家电': 800,
    '3C数码': 1200,
    '手机': 2500,
    '电脑': 4000,
    '运动户外': 300,
    '珠宝文玩': 1500,
    '珠宝': 3000,
    '虚拟商品': 50,
    '游戏充值': 30,
    '宠物食品': 150,
    '宠物用品': 120,
  }

  for (const category of categories) {
    if (categoryAOVBenchmarks[category]) {
      return categoryAOVBenchmarks[category]
    }
  }

  return 250
}

/**
 * 获取品类名称
 */
function getCategoryName(categories: string[]): string {
  return categories.length > 0 ? categories[0] : '全品类'
}

/**
 * 基于GMV推断店铺级别
 */
function getStoreTier(gmv: number): { name: string; targetViewers: number } {
  if (gmv < 10000) {
    return { name: '小型', targetViewers: 500 }
  } else if (gmv < 50000) {
    return { name: '中型', targetViewers: 1000 }
  } else if (gmv < 200000) {
    return { name: '大型', targetViewers: 2000 }
  } else {
    return { name: '超大型', targetViewers: 5000 }
  }
}

// ==================== 新增：店铺成长阶段分析 ====================

/**
 * 判断店铺成长阶段
 */
function getStoreStage(gmv: number, duration: number, sessions: number): {
  stage: string
  name: string
  focus: string[]
  kpi: string[]
  description: string
} {
  // 估算场次（如果没有直接提供）
  const estimatedSessions = sessions || Math.max(1, Math.floor(duration / 2))

  if (gmv < 10000 || estimatedSessions < 10) {
    return {
      stage: 'cold_start',
      name: '冷启动期',
      focus: ['流量获取', '数据积累', '店铺基础搭建'],
      kpi: ['观看人数', '直播场次', '粉丝增长'],
      description: '新店铺或低GMV店铺，重点是积累基础数据和粉丝',
    }
  } else if (gmv < 100000) {
    return {
      stage: 'growth',
      name: '成长期',
      focus: ['转化率提升', '客单价优化', '复购率培养'],
      kpi: ['转化率', '客单价', '回购率'],
      description: '已有一定数据基础，重点是优化运营效率',
    }
  } else {
    return {
      stage: 'mature',
      name: '成熟期',
      focus: ['品牌建设', '私域运营', '供应链优化'],
      kpi: ['品牌力', '会员数', '利润率'],
      description: '已建立稳定运营，重点是品牌价值提升',
    }
  }
}

// ==================== 新增：趋势分析 ====================

/**
 * 分析数据趋势
 */
function analyzeTrend(recentStats: any[]): {
  trend: 'rising' | 'declining' | 'stable' | 'insufficient_data'
  description: string
} {
  if (recentStats.length < 3) {
    return {
      trend: 'insufficient_data',
      description: '历史数据不足，需要至少3期数据才能分析趋势',
    }
  }

  const gmvTrend = recentStats.map(s => s.totalGMV || 0)

  // 检查是否连续下降
  const isDecreasing = gmvTrend.every((val, i) => i === 0 || val < gmvTrend[i - 1])
  // 检查是否连续上升
  const isIncreasing = gmvTrend.every((val, i) => i === 0 || val > gmvTrend[i - 1])

  if (isDecreasing) {
    const decline = ((gmvTrend[gmvTrend.length - 1] / gmvTrend[0] - 1) * 100).toFixed(1)
    return {
      trend: 'declining',
      description: `GMV连续下降，总下降${Math.abs(Number(decline))}%`,
    }
  }

  if (isIncreasing) {
    const growth = ((gmvTrend[gmvTrend.length - 1] / gmvTrend[0] - 1) * 100).toFixed(1)
    return {
      trend: 'rising',
      description: `GMV连续增长，总增长${growth}%`,
    }
  }

  // 计算波动率
  const avgGMV = gmvTrend.reduce((sum, val) => sum + val, 0) / gmvTrend.length
  const variance = gmvTrend.reduce((sum, val) => sum + Math.pow(val - avgGMV, 2), 0) / gmvTrend.length
  const stdDev = Math.sqrt(variance)
  const volatility = (stdDev / avgGMV) * 100

  if (volatility > 30) {
    return {
      trend: 'stable',
      description: `数据波动较大（波动率${volatility.toFixed(1)}%），建议稳定运营`,
    }
  }

  return {
    trend: 'stable',
    description: '数据整体稳定',
  }
}

// ==================== 新增：异常检测 ====================

interface Anomaly {
  type: string
  severity: 'critical' | 'high' | 'medium'
  metric: string
  currentValue: number
  expectedValue: number
  change: string
  description: string
  aiFeature?: string // 关联的AI助手功能
}

/**
 * 检测数据异常
 */
function detectAnomalies(
  currentStats: any,
  historicalStats: any,
  categories: string[]
): Anomaly[] {
  const anomalies: Anomaly[] = []

  // 1. GMV突变检测（下降超过50%）
  if (historicalStats.avgGMV > 0 && currentStats.totalGMV < historicalStats.avgGMV * 0.5) {
    const change = (((currentStats.totalGMV / historicalStats.avgGMV) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'gmv_drop',
      severity: 'critical',
      metric: 'GMV',
      currentValue: currentStats.totalGMV,
      expectedValue: historicalStats.avgGMV,
      change: `${change}%`,
      description: `GMV突然下降${Math.abs(Number(change))}%，可能是选品、定价或市场环境变化导致`,
      aiFeature: 'product_recommend', // 关联商品推荐功能
    })
  }

  // 2. 转化率突变检测（下降超过30%）
  const currentConversionRate = currentStats.totalViewers > 0 
    ? (currentStats.totalOrders / currentStats.totalViewers) * 100 
    : 0
  const historicalConversionRate = historicalStats.avgConversionRate || 0

  if (historicalConversionRate > 0 && currentConversionRate < historicalConversionRate * 0.7) {
    const change = (((currentConversionRate / historicalConversionRate) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'conversion_drop',
      severity: 'high',
      metric: '转化率',
      currentValue: currentConversionRate,
      expectedValue: historicalConversionRate,
      change: `${change}%`,
      description: `转化率突然下降${Math.abs(Number(change))}%，可能是话术、互动或商品展示问题`,
      aiFeature: 'script', // 关联话术生成功能
    })
  }

  // 3. 观看人数突变检测（下降超过40%）
  if (historicalStats.avgViewers > 0 && currentStats.totalViewers < historicalStats.avgViewers * 0.6) {
    const change = (((currentStats.totalViewers / historicalStats.avgViewers) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'viewers_drop',
      severity: 'high',
      metric: '观看人数',
      currentValue: currentStats.totalViewers,
      expectedValue: historicalStats.avgViewers,
      change: `${change}%`,
      description: `观看人数突然下降${Math.abs(Number(change))}%，可能是时段、标题或推流问题`,
      aiFeature: 'time_recommend', // 关联时段推荐功能
    })
  }

  // 4. 互动率突变检测（下降超过50%）
  const currentInteractionRate = currentStats.totalViewers > 0 
    ? (currentStats.totalInteractions / currentStats.totalViewers) * 100 
    : 0
  const historicalInteractionRate = historicalStats.avgInteractionRate || 0

  if (historicalInteractionRate > 0 && currentInteractionRate < historicalInteractionRate * 0.5) {
    const change = (((currentInteractionRate / historicalInteractionRate) - 1) * 100).toFixed(1)
    anomalies.push({
      type: 'interaction_drop',
      severity: 'medium',
      metric: '互动率',
      currentValue: currentInteractionRate,
      expectedValue: historicalInteractionRate,
      change: `${change}%`,
      description: `互动率突然下降${Math.abs(Number(change))}%，可能是缺少互动环节或活动吸引力不足`,
      aiFeature: 'engagement', // 关联互动策略功能
    })
  }

  // 5. 异常组合检测：观看人数正常但转化率暴跌
  if (
    currentStats.totalViewers >= historicalStats.avgViewers * 0.8 &&
    currentConversionRate < historicalConversionRate * 0.6
  ) {
    anomalies.push({
      type: 'conversion_viewers_mismatch',
      severity: 'high',
      metric: '转化率与观看人数',
      currentValue: currentConversionRate,
      expectedValue: historicalConversionRate,
      change: '-',
      description: '观看人数正常但转化率暴跌，可能是商品质量、价格或话术问题',
      aiFeature: 'script', // 关联话术生成功能
    })
  }

  // 6. 异常组合检测：GMV正常但订单数暴涨（客单价暴跌）
  const currentAOV = currentStats.totalOrders > 0 ? currentStats.totalGMV / currentStats.totalOrders : 0
  const historicalAOV = historicalStats.avgAOV || 0

  if (
    currentStats.totalGMV >= historicalStats.avgGMV * 0.9 &&
    currentStats.totalOrders > historicalStats.avgOrders * 1.5 &&
    currentAOV < historicalAOV * 0.7
  ) {
    anomalies.push({
      type: 'aov_drop',
      severity: 'medium',
      metric: '客单价',
      currentValue: currentAOV,
      expectedValue: historicalAOV,
      change: '-',
      description: 'GMV正常但客单价暴跌，可能是低价商品占比过高或促销力度过大',
      aiFeature: 'pricing', // 关联定价策略功能
    })
  }

  return anomalies
}

// ==================== 新增：动态阈值判断 ====================

/**
 * 计算动态阈值
 */
function getDynamicThresholds(
  historicalStats: any,
  categories: string[],
  minPrice?: number,
  maxPrice?: number,
  platform?: string
): {
  conversionRate: { min: number; target: number }
  gmvPerHour: { min: number; target: number }
  interactionRate: { min: number; target: number }
  avgOrderValue: { min: number; target: number }
  viewers: { min: number; target: number }
} {
  // 获取行业基准（数据来源按店铺平台显示，如 TikTok / 抖音 / 快手）
  const industryBenchmark = getConversionRateBenchmark(categories, minPrice, maxPrice, platform)
  const categoryAOV = getCategoryAOVBenchmark(categories)

  // 转化率阈值
  const conversionRateThreshold = {
    min: historicalStats.avgConversionRate > industryBenchmark.rate
      ? historicalStats.avgConversionRate * 0.9 // 如果历史高于行业基准，使用历史的90%
      : industryBenchmark.rate * 0.8, // 否则使用行业基准的80%
    target: Math.max(historicalStats.avgConversionRate * 1.1, industryBenchmark.rate),
  }

  // GMV/小时阈值
  const gmvPerHourThreshold = {
    min: historicalStats.avgGMVPerHour > 0 
      ? historicalStats.avgGMVPerHour * 0.8 
      : 3000, // 默认最低3000/小时
    target: historicalStats.avgGMVPerHour > 0 
      ? historicalStats.avgGMVPerHour * 1.2 
      : 5000,
  }

  // 互动率阈值（平台平均12%）
  const interactionRateThreshold = {
    min: historicalStats.avgInteractionRate > 0 
      ? historicalStats.avgInteractionRate * 0.8 
      : 10, // 默认最低10%
    target: Math.max(historicalStats.avgInteractionRate * 1.2, 15),
  }

  // 客单价阈值
  const avgOrderValueThreshold = {
    min: historicalStats.avgAOV > 0 
      ? historicalStats.avgAOV * 0.9 
      : categoryAOV * 0.8, // 行业基准的80%
    target: Math.max(historicalStats.avgAOV * 1.1, categoryAOV),
  }

  // 观看人数阈值（基于店铺GMV级别）
  const viewersThreshold = {
    min: historicalStats.avgViewers > 0 
      ? historicalStats.avgViewers * 0.8 
      : 300, // 默认最低300人
    target: historicalStats.avgViewers > 0 
      ? historicalStats.avgViewers * 1.2 
      : 500,
  }

  return {
    conversionRate: conversionRateThreshold,
    gmvPerHour: gmvPerHourThreshold,
    interactionRate: interactionRateThreshold,
    avgOrderValue: avgOrderValueThreshold,
    viewers: viewersThreshold,
  }
}

// ==================== 新增：节日/季节提醒 ====================

/** 计算当年或下一年 (month, day) 距 current 最近且未来的日期（用于固定公历节日/大促） */
function nextOccurrence(current: Date, month: number, day: number): Date {
  const thisYear = new Date(current.getFullYear(), month - 1, day)
  if (thisYear.getTime() > current.getTime()) return thisYear
  return new Date(current.getFullYear() + 1, month - 1, day)
}

type EventDef = {
  name: string
  prepDays: number
  recommendation: string
  date?: string
  month?: number
  day?: number
}

/**
 * 获取即将到来的节日/购物节（按店铺所在国家或区域）
 * 支持：中国(CN)、泰国、越南、印度尼西亚、马来西亚、新加坡、菲律宾 的当地大促节点与传统节日
 */
function getUpcomingEvents(region: string, currentDate: Date): Array<{
  name: string
  date: string
  daysUntil: number
  prepDays: number
  recommendation: string
}> {
  const regionNorm = (region || '').trim()
  const regionAlias: { [key: string]: string } = {
    '中国': 'CN',
    '中国香港': 'CN',
    '中国台湾': 'CN',
    'CN': 'CN',
    '泰国': 'TH',
    '越南': 'VN',
    '印度尼西亚': 'ID',
    '马来西亚': 'MY',
    '新加坡': 'SG',
    '菲律宾': 'PH',
    '缅甸': 'TH',
    '柬埔寨': 'TH',
    '老挝': 'TH',
    '文莱': 'MY',
  }
  const regionKey = regionAlias[regionNorm] || regionNorm

  const eventsByRegion: { [key: string]: EventDef[] } = {
    CN: [
      { name: '春节', month: 1, day: 29, prepDays: 20, recommendation: '准备年货、设计红包活动、春节主题直播' },
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/鲜花/美妆/珠宝等品类爆发期，设计情侣礼盒、表白主题直播、限时满减' },
      { name: '元宵节', month: 2, day: 12, prepDays: 10, recommendation: '元宵主题商品、猜灯谜互动、团圆主题直播' },
      { name: '三八妇女节/女神节', month: 3, day: 8, prepDays: 14, recommendation: '美妆/服饰/珠宝/健康品类大促，女性向礼盒、女神专场、关爱主题直播' },
      { name: '母亲节', month: 5, day: 10, prepDays: 14, recommendation: '礼品/健康/家居/服饰等孝心消费高峰，母亲节礼盒、感恩主题、满赠活动' },
      { name: '618', month: 6, day: 18, prepDays: 14, recommendation: '设计满减活动、准备爆款商品、优化直播话术' },
      { name: '父亲节', month: 6, day: 15, prepDays: 14, recommendation: '男装/数码/酒类/健康品类增长点，父亲节礼盒、品质好物专场' },
      { name: '七夕', month: 8, day: 1, prepDays: 14, recommendation: '情侣礼品/美妆/珠宝/鲜花爆发，七夕限定、浪漫主题直播、双人礼盒' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '服饰/美妆/零食/派对用品增长，搞怪主题、限定装扮、糖果/礼包组合' },
      { name: '双11', month: 11, day: 11, prepDays: 14, recommendation: '提前备货、设计促销活动、准备直播脚本' },
      { name: '感恩节/黑五', month: 11, day: 29, prepDays: 10, recommendation: '跨境/海淘氛围浓，大促预热、爆款清单、限时秒杀' },
      { name: '双12', month: 12, day: 12, prepDays: 10, recommendation: '清理库存、设计年终促销、准备跨年活动' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品/美妆/服饰/食品等节日消费高峰，圣诞主题、礼盒组合、节日直播' },
    ],
    TH: [
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆/鲜花品类增长，情侣礼盒、浪漫主题直播' },
      { name: '宋干节', month: 4, day: 13, prepDays: 14, recommendation: '准备节日商品、设计泼水节主题活动' },
      { name: '母亲节', month: 8, day: 12, prepDays: 14, recommendation: '泰国母亲节（王后诞辰）礼品与感恩主题、家庭装与礼盒' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食品类，搞怪主题、限定商品、直播互动' },
      { name: '水灯节', month: 11, day: 14, prepDays: 14, recommendation: '准备节日装饰、设计浪漫主题直播' },
      { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: 'TikTok/电商大促备货、促销脚本、爆款预热' },
      { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终大促、清仓与礼品组合、直播排期' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题商品与直播' },
    ],
    VN: [
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆增长期，情侣礼盒与浪漫主题' },
      { name: '妇女节', month: 3, day: 8, prepDays: 14, recommendation: '女性向美妆/服饰/礼品大促' },
      { name: '越南国庆', month: 9, day: 2, prepDays: 10, recommendation: '国庆主题促销、本土品牌活动' },
      { name: '9.9大促', month: 9, day: 9, prepDays: 14, recommendation: '电商大促备货、满减与秒杀脚本' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食品类，主题直播与限定商品' },
      { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播排期、促销话术' },
      { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终促销、库存清理、礼品季' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品与圣诞主题直播' },
    ],
    ID: [
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆品类、情侣主题与礼盒' },
      { name: '开斋节', month: 3, day: 30, prepDays: 14, recommendation: '斋月/开斋节主题商品、节日礼盒、尊重当地习俗' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、主题直播与促销' },
      { name: 'Harbolnas 12.12', month: 12, day: 12, prepDays: 14, recommendation: '印尼网购节备货、大促直播、本土化促销' },
      { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '电商大促、直播与短视频预热' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题与直播' },
    ],
    MY: [
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆、情侣主题与礼盒' },
      { name: '妇女节', month: 3, day: 8, prepDays: 14, recommendation: '女性向美妆/服饰大促' },
      { name: '开斋节', month: 4, day: 10, prepDays: 14, recommendation: '开斋节主题、礼品与家庭装、尊重当地习俗' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、主题直播' },
      { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播与满减活动' },
      { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终促销、跨年活动' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题直播' },
    ],
    SG: [
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆、情侣礼盒与主题直播' },
      { name: '妇女节', month: 3, day: 8, prepDays: 14, recommendation: '女性向品类大促' },
      { name: '新加坡国庆', month: 8, day: 9, prepDays: 10, recommendation: '国庆主题促销、本地化直播' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、主题促销' },
      { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播促销' },
      { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终大促、圣诞季预热' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题直播' },
    ],
    PH: [
      { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆/鲜花、情侣主题与礼盒' },
      { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、搞怪主题与限定' },
      { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播与促销' },
      { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终促销、圣诞前冲刺' },
      { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '圣诞主题商品、礼品组合、节日直播' },
    ],
  }

  const regionEvents = eventsByRegion[regionKey] || eventsByRegion['CN']

  const upcomingEvents = regionEvents
    .map((event): { name: string; date: string; daysUntil: number; prepDays: number; recommendation: string } | null => {
      let eventDate: Date
      if (event.date) {
        eventDate = new Date(event.date)
      } else if (event.month != null && event.day != null) {
        eventDate = nextOccurrence(currentDate, event.month, event.day)
      } else {
        return null
      }
      const daysUntil = Math.ceil((eventDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntil <= 0 || daysUntil > event.prepDays) return null
      return {
        name: event.name,
        date: eventDate.toISOString().slice(0, 10),
        daysUntil,
        prepDays: event.prepDays,
        recommendation: event.recommendation,
      }
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  return upcomingEvents
}

/**
 * 获取时间维度上下文（季节、月份、气温等自然因素），用于提示词与任务描述
 * 气温带按区域与月份近似：温带(CN等)随季节变化；热带(东南亚)区分雨季/旱季及体感热度
 */
function getTimeContext(region?: string): {
  currentSeason: 'winter' | 'spring' | 'summer' | 'autumn'
  currentMonth: number
  seasonLabel: string
  /** 气温/体感带：用于品类与场景建议 */
  temperatureBand: '炎热' | '温暖' | '凉爽' | '寒冷' | '热带雨季' | '热带旱季'
  /** 自然因素一句话提示，供 LLM 与规则结合品类使用 */
  weatherHint: string
} {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  let currentSeason: 'winter' | 'spring' | 'summer' | 'autumn' = 'spring'
  let seasonLabel = '春季'
  if ([12, 1, 2].includes(currentMonth)) {
    currentSeason = 'winter'
    seasonLabel = '冬季'
  } else if ([3, 4, 5].includes(currentMonth)) {
    currentSeason = 'spring'
    seasonLabel = '春季'
  } else if ([6, 7, 8].includes(currentMonth)) {
    currentSeason = 'summer'
    seasonLabel = '夏季'
  } else if ([9, 10, 11].includes(currentMonth)) {
    currentSeason = 'autumn'
    seasonLabel = '秋季'
  }

  const regionNorm = (region || 'CN').trim()
  const tropicalRegions = ['TH', 'VN', 'ID', 'MY', 'SG', 'PH', '泰国', '越南', '印度尼西亚', '马来西亚', '新加坡', '菲律宾']
  const isTropical = tropicalRegions.some((r) => regionNorm.toUpperCase().includes(r) || regionNorm.includes(r))

  let temperatureBand: '炎热' | '温暖' | '凉爽' | '寒冷' | '热带雨季' | '热带旱季' = '温暖'
  let weatherHint: string

  if (isTropical) {
    // 东南亚：雨季约 5–10 月，旱季 11–4 月；体感 3–5 月最热，12–2 月相对凉爽
    const isRainySeason = currentMonth >= 5 && currentMonth <= 10
    const isPeakHot = currentMonth >= 3 && currentMonth <= 5
    if (isRainySeason && isPeakHot) {
      temperatureBand = '热带雨季'
      weatherHint = '当前为热带雨季且体感偏热，防暑降温、雨具、室内/宅家场景相关品类需求上升'
    } else if (isRainySeason) {
      temperatureBand = '热带雨季'
      weatherHint = '当前为热带雨季，雨具、除湿、室内娱乐、防霉等场景需求上升'
    } else if (currentMonth >= 12 || currentMonth <= 2) {
      temperatureBand = '热带旱季'
      weatherHint = '当前为旱季且相对凉爽，户外与旅游、防晒、补水、轻便服饰等需求上升'
    } else {
      temperatureBand = '热带旱季'
      weatherHint = '当前为旱季，防晒、补水、户外活动相关品类需求较好'
    }
  } else {
    // 温带（中国等）：按月份给气温带与提示
    if ([12, 1, 2].includes(currentMonth)) {
      temperatureBand = '寒冷'
      weatherHint = '当前气温偏寒，保暖、热饮、室内场景、冬季护肤等需求上升'
    } else if ([3, 4, 5].includes(currentMonth)) {
      temperatureBand = '温暖'
      weatherHint = '当前气温回暖，换季服饰、户外、春游、过敏防护等需求上升'
    } else if ([6, 7, 8].includes(currentMonth)) {
      temperatureBand = '炎热'
      weatherHint = '当前气温偏高，防暑降温、冷饮、防晒、夏季服饰与空调相关需求上升'
    } else {
      temperatureBand = '凉爽'
      weatherHint = '当前气温转凉，秋装、润燥、换季护肤、室内保暖等需求上升'
    }
  }

  return { currentSeason, currentMonth, seasonLabel, temperatureBand, weatherHint }
}

/** 传给 Coze 的气温维度说明：仅提供国家+气温待办维度，具体分析逻辑由 Coze 内置 */
const TEMPERATURE_INPUT_FOR_LLM = '【气温待办维度】结合上述国家/区域与当前气温带，按 Coze 内置逻辑生成相关待办。'

// ==================== 同比环比数据查询 ====================

/**
 * 获取去年同期数据（Year over Year）
 * 例如当前区间为 2025-12-01~2025-12-30，则查询 2024-12-01~2024-12-30
 */
async function getYearOverYearStats(
  storeId: string,
  currentDateFrom: string,
  currentDateTo: string
): Promise<{ totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null> {
  const currentFrom = new Date(currentDateFrom)
  const currentTo = new Date(currentDateTo)
  const lastYearFrom = new Date(currentFrom)
  lastYearFrom.setFullYear(lastYearFrom.getFullYear() - 1)
  const lastYearTo = new Date(currentTo)
  lastYearTo.setFullYear(lastYearTo.getFullYear() - 1)
  const yoyFrom = toStr(lastYearFrom)
  const yoyTo = toStr(lastYearTo)
  return await aggregateStatsForRange(storeId, yoyFrom, yoyTo)
}

/**
 * 获取上月同期数据（Month over Month），按自然日区间对比
 * 
 * 对比规则：同一月内的自然日期区间
 * - 当前 2025-02-01 ~ 2025-02-10（10天） → 上月 2025-01-01 ~ 2025-01-10（同样10天，同样的自然日）
 * - 当前 2025-02-15 ~ 2025-02-20（6天） → 上月 2025-01-15 ~ 2025-01-20（同样6天，同样的自然日）
 * - 当前 2025-01-01 ~ 2025-01-15 → 上月 2024-12-01 ~ 2024-12-15（自动处理跨年）
 * - 当前 2025-03-01 ~ 2025-03-31 → 上月 2025-02-01 ~ 2025-03-03（自动处理月份天数差异，3月31日对应2月的最后一天）
 * 
 * 注意：不按周对比，而是按自然日（日历日期）对比，确保对比的是相同的日期区间（如月初、月中、月末）。
 */
async function getMonthOverMonthStats(
  storeId: string,
  currentDateFrom: string,
  currentDateTo: string
): Promise<{ totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null> {
  const currentFrom = new Date(currentDateFrom + 'T00:00:00')
  const currentTo = new Date(currentDateTo + 'T00:00:00')
  const lastMonthFrom = new Date(currentFrom)
  lastMonthFrom.setMonth(lastMonthFrom.getMonth() - 1)
  const lastMonthTo = new Date(currentTo)
  lastMonthTo.setMonth(lastMonthTo.getMonth() - 1)
  const momFrom = toStr(lastMonthFrom)
  const momTo = toStr(lastMonthTo)
  return await aggregateStatsForRange(storeId, momFrom, momTo)
}

/**
 * 基于同比环比生成待办（规则生成，不调用 LLM）
 */
function generateComparisonTasks(
  currentStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number },
  yoyStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null,
  momStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null,
  storeInfo: any
): Array<{ title: string; description: string; priority: string; source: string }> {
  const tasks: Array<{ title: string; description: string; priority: string; source: string }> = []
  const currencySymbol = storeInfo?.currencySymbol ?? '¥'
  const region = storeInfo?.region || 'CN'
  const currencyName = region === '泰国' || region === 'TH' ? '泰铢' : region === '越南' || region === 'VN' ? '越南盾' : region === '印度尼西亚' || region === 'ID' ? '印尼盾' : region === '马来西亚' || region === 'MY' ? '马币' : region === '新加坡' || region === 'SG' ? '新币' : region === '菲律宾' || region === 'PH' ? '比索' : '人民币'

  // 同比分析（Year over Year）
  if (yoyStats && yoyStats.totalGMV > 0) {
    const gmvChange = ((currentStats.totalGMV - yoyStats.totalGMV) / yoyStats.totalGMV) * 100
    const ordersChange = yoyStats.totalOrders > 0 ? ((currentStats.totalOrders - yoyStats.totalOrders) / yoyStats.totalOrders) * 100 : null
    const viewersChange = yoyStats.totalViewers > 0 ? ((currentStats.totalViewers - yoyStats.totalViewers) / yoyStats.totalViewers) * 100 : null
    
    if (gmvChange < -15) {
      // GMV 同比下降超过 15%
      tasks.push({
        title: `GMV 同比下降 ${Math.abs(gmvChange).toFixed(1)}%，需紧急优化`,
        description: `当前 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，去年同期 ${yoyStats.totalGMV.toFixed(0)} ${currencyName}，同比下降 ${Math.abs(gmvChange).toFixed(1)}%。建议：分析去年同期成功因素，对比当前直播内容、选品、价格策略差异，制定改进计划。`,
        priority: 'urgent',
        source: 'yoy_comparison',
      })
    } else if (gmvChange > 20) {
      // GMV 同比增长超过 20%
      tasks.push({
        title: `GMV 同比增长 ${gmvChange.toFixed(1)}%，巩固优势`,
        description: `当前 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，去年同期 ${yoyStats.totalGMV.toFixed(0)} ${currencyName}，同比增长 ${gmvChange.toFixed(1)}%。建议：总结本期成功经验，形成可复制的标准流程，在下月继续扩大优势。`,
        priority: 'normal',
        source: 'yoy_comparison',
      })
    }

    if (ordersChange !== null && ordersChange < -10) {
      // 订单数同比下降超过 10%
      tasks.push({
        title: `订单数同比下降 ${Math.abs(ordersChange).toFixed(1)}%，需分析转化路径`,
        description: `当前订单 ${currentStats.totalOrders} 笔，去年同期 ${yoyStats.totalOrders} 笔，同比下降 ${Math.abs(ordersChange).toFixed(1)}%。建议：检查直播间商品链接、优惠力度、主播话术转化环节，对比去年同期策略差异。`,
        priority: 'urgent',
        source: 'yoy_comparison',
      })
    }

    if (viewersChange !== null && viewersChange < -20) {
      // 观看数同比下降超过 20%
      tasks.push({
        title: `观看数同比下降 ${Math.abs(viewersChange).toFixed(1)}%，需加强引流`,
        description: `当前观看 ${currentStats.totalViewers} 人，去年同期 ${yoyStats.totalViewers} 人，同比下降 ${Math.abs(viewersChange).toFixed(1)}%。建议：增加短视频引流、优化直播预告、检查推流策略，对比去年同期流量来源。`,
        priority: 'urgent',
        source: 'yoy_comparison',
      })
    }
  }

  // 月同比分析（Month over Month）- 按自然日区间对比（如 2月1-10日 vs 1月1-10日）
  if (momStats && momStats.totalGMV > 0) {
    const gmvChange = ((currentStats.totalGMV - momStats.totalGMV) / momStats.totalGMV) * 100
    const ordersChange = momStats.totalOrders > 0 ? ((currentStats.totalOrders - momStats.totalOrders) / momStats.totalOrders) * 100 : null
    const viewersChange = momStats.totalViewers > 0 ? ((currentStats.totalViewers - momStats.totalViewers) / momStats.totalViewers) * 100 : null
    const durationChange = momStats.totalDuration > 0 ? ((currentStats.totalDuration - momStats.totalDuration) / momStats.totalDuration) * 100 : null
    const convCurrent = currentStats.totalViewers > 0 ? (currentStats.totalOrders / currentStats.totalViewers) * 100 : 0
    const convLast = momStats.totalViewers > 0 ? (momStats.totalOrders / momStats.totalViewers) * 100 : 0
    const convChange = convLast > 0 ? convCurrent - convLast : null
    const gmvPerHourCurrent = currentStats.totalDuration > 0 ? currentStats.totalGMV / currentStats.totalDuration : 0
    const gmvPerHourLast = momStats.totalDuration > 0 ? momStats.totalGMV / momStats.totalDuration : 0
    const gmvPerHourChange = gmvPerHourLast > 0 ? ((gmvPerHourCurrent - gmvPerHourLast) / gmvPerHourLast) * 100 : null

    if (gmvChange < -10) {
      // GMV 月同比下降超过 10%
      tasks.push({
        title: `GMV 月同比下降 ${Math.abs(gmvChange).toFixed(1)}%，需快速止损`,
        description: `当前同期 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，上月同期 ${momStats.totalGMV.toFixed(0)} ${currencyName}，按自然日对比下降 ${Math.abs(gmvChange).toFixed(1)}%。建议：立即复盘上月同期成功场次，对比本月差异点（选品、价格、时段、话术），3 天内调整回正常水平。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    } else if (gmvChange > 15) {
      // GMV 月同比增长超过 15%
      tasks.push({
        title: `GMV 月同比增长 ${gmvChange.toFixed(1)}%，保持增长势头`,
        description: `当前同期 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，上月同期 ${momStats.totalGMV.toFixed(0)} ${currencyName}，按自然日对比增长 ${gmvChange.toFixed(1)}%。建议：及时总结本月增长经验，固化为标准操作流程，确保下月继续增长。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }

    if (convChange !== null && convChange < -0.5) {
      // 转化率月同比下降超过 0.5 个百分点
      tasks.push({
        title: `转化率月同比下降 ${Math.abs(convChange).toFixed(1)} 个百分点`,
        description: `当前同期转化率 ${convCurrent.toFixed(2)}%，上月同期 ${convLast.toFixed(2)}%，按自然日对比下降 ${Math.abs(convChange).toFixed(1)} 个百分点。建议：检查直播间商品价格竞争力、优惠活动力度、主播促单话术，对比上月同期高转化场次找差距。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    } else if (convChange !== null && convChange > 1.0) {
      // 转化率月同比提升超过 1 个百分点
      tasks.push({
        title: `转化率月同比提升 ${convChange.toFixed(1)} 个百分点，巩固优势`,
        description: `当前同期转化率 ${convCurrent.toFixed(2)}%，上月同期 ${convLast.toFixed(2)}%，按自然日对比提升 ${convChange.toFixed(1)} 个百分点。建议：总结本月转化提升的关键因素（话术、商品、促销），形成可复制的转化率优化方案。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }

    if (ordersChange !== null && ordersChange < -15) {
      // 订单数月同比下降超过 15%
      tasks.push({
        title: `订单数月同比下降 ${Math.abs(ordersChange).toFixed(1)}%`,
        description: `当前同期订单 ${currentStats.totalOrders} 笔，上月同期 ${momStats.totalOrders} 笔，按自然日对比下降 ${Math.abs(ordersChange).toFixed(1)}%。建议：2 天内分析订单下降原因（流量/转化/客单价），参考上月同期成功经验，调整选品与促销策略。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    }

    if (viewersChange !== null && viewersChange < -20) {
      // 观看数月同比下降超过 20%
      tasks.push({
        title: `观看数月同比下降 ${Math.abs(viewersChange).toFixed(1)}%，需加强引流`,
        description: `当前同期观看 ${currentStats.totalViewers} 人，上月同期 ${momStats.totalViewers} 人，按自然日对比下降 ${Math.abs(viewersChange).toFixed(1)}%。建议：增加短视频引流、优化直播预告、检查推流策略，对比上月同期流量来源。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    } else if (viewersChange !== null && viewersChange > 30) {
      // 观看数月同比增长超过 30%
      tasks.push({
        title: `观看数月同比增长 ${viewersChange.toFixed(1)}%，流量策略见效`,
        description: `当前同期观看 ${currentStats.totalViewers} 人，上月同期 ${momStats.totalViewers} 人，按自然日对比增长 ${viewersChange.toFixed(1)}%。建议：总结本月引流成功经验（短视频、预告、推流），扩大投入确保下月继续增长。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }

    if (gmvPerHourChange !== null && gmvPerHourChange < -15) {
      // 时均 GMV 月同比下降超过 15%
      tasks.push({
        title: `时均 GMV 月同比下降 ${Math.abs(gmvPerHourChange).toFixed(1)}%`,
        description: `当前同期时均 GMV ${gmvPerHourCurrent.toFixed(0)} ${currencyName}/小时，上月同期 ${gmvPerHourLast.toFixed(0)} ${currencyName}/小时，按自然日对比下降 ${Math.abs(gmvPerHourChange).toFixed(1)}%。建议：优化直播节奏与商品排期，在高峰时段集中推爆款，提升单位时间产出效率。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    }

    if (durationChange !== null && durationChange < -20) {
      // 直播时长月同比下降超过 20%
      tasks.push({
        title: `直播时长月同比减少 ${Math.abs(durationChange).toFixed(1)}%`,
        description: `当前同期直播 ${currentStats.totalDuration.toFixed(1)} 小时，上月同期 ${momStats.totalDuration.toFixed(1)} 小时，按自然日对比减少 ${Math.abs(durationChange).toFixed(1)}%。建议：检查是否因人员、场地等原因导致开播减少，若是主动缩减则需提升单场产出效率。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }
  }

  return tasks
}

// ==================== 新增：生成基于阶段的任务 ====================

/**
 * 生成基于店铺成长阶段的任务
 * @param statsRecordCount 该店铺在 stats 表中的总记录数；用于判断是否「已有直播数据」，避免对已有多期数据的店铺误推「首月10场」
 */
const STAGE_LLM_HINT = ' 建议配置话术 LLM 后点击「智能生成」获取个性化待办。'

function generateStageBasedTasks(
  stage: ReturnType<typeof getStoreStage>,
  storeInfo: any,
  currentStats: any,
  statsRecordCount: number = 99
): Array<{ title: string; description: string; priority: string; aiFeature?: string }> {
  const tasks = []

  if (stage.stage === 'cold_start') {
    const sessions = Math.max(1, Math.floor((currentStats.totalDuration || 0) / 2))
    const hasLittleHistory = statsRecordCount <= 2
    if (hasLittleHistory && sessions < 10) {
      tasks.push({
        title: '完成首月10场直播',
        description: `冷启动期，当前约 ${sessions} 场。目标首月 10 场。${STAGE_LLM_HINT}`,
        priority: 'urgent',
        aiFeature: 'schedule',
      })
    }
    if (hasLittleHistory && currentStats.totalViewers < 100) {
      tasks.push({
        title: '积累首批100个观众',
        description: `当前观众 ${currentStats.totalViewers}，目标 100。${STAGE_LLM_HINT}`,
        priority: 'urgent',
        aiFeature: 'content',
      })
    }
    const hasAudience = !!storeInfo?.targetAudience?.trim()
    const hasPositioning = !!storeInfo?.brandPositioning?.trim()
    const hasPriceRange = storeInfo?.minPrice != null || storeInfo?.maxPrice != null
    if (!hasAudience && !hasPositioning && !hasPriceRange) {
      tasks.push({
        title: '完善店铺定位和目标人群',
        description: `店铺定位信息未填。${STAGE_LLM_HINT}`,
        priority: 'normal',
        aiFeature: 'positioning',
      })
    }
  } else if (stage.stage === 'growth') {
    tasks.push({
      title: '建立数据分析周报制度',
      description: `成长期。${STAGE_LLM_HINT}`,
      priority: 'normal',
      aiFeature: 'report',
    })
    if (currentStats.totalOrders > 50) {
      tasks.push({
        title: '启动复购率提升计划',
        description: `已有订单 ${currentStats.totalOrders} 笔。${STAGE_LLM_HINT}`,
        priority: 'normal',
        aiFeature: 'crm',
      })
    }
  } else if (stage.stage === 'mature') {
    tasks.push({
      title: '建立品牌内容矩阵',
      description: `成熟期。${STAGE_LLM_HINT}`,
      priority: 'normal',
      aiFeature: 'brand',
    })
    tasks.push({
      title: '优化供应链和利润率',
      description: `成熟期，稳定运营。${STAGE_LLM_HINT}`,
      priority: 'normal',
      aiFeature: 'supply_chain',
    })
  }

  return tasks
}

// ==================== LLM 异常分析（复用话术 LLM 配置） ====================

/** LLM 返回的待办条目标题+描述+优先级 */
type LLMAnomalyTask = { title: string; description: string; priority: string }

/**
 * 使用 LLM 对已检测到的数据异常做更深入分析，生成 1～3 条可执行待办。
 * 复用话术 LLM 配置；未配置或调用失败时返回空数组。
 */
async function analyzeAnomaliesWithLLM(
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

  const systemPrompt = `【回复语言与地区】locale=${locale}，countryCode=${countryCode}。任务标题与描述使用该语言。
你是直播电商运营助手。根据系统检测到的数据异常，输出 1～3 条可执行的待办任务建议。
输出格式：JSON，形如 {"tasks":[{"title":"任务标题","description":"任务描述","priority":"urgent 或 normal"}]}。`

  const userMessage = `【用户界面语言/地区】locale=${locale}，countryCode=${countryCode}
店铺：${storeName}${storePlatform ? `（${storePlatform}）` : ''}${categories ? `，类目：${categories}` : ''}
${statsLine}

系统检测到的异常：
${anomalyLines}

请基于以上异常，输出 1～3 条待办任务（JSON 格式）。`

  const raw = await callLLMOnce({
    systemPrompt,
    userMessage,
    temperature: 0.4,
    taskType: 'todo',
    config: llmConfig,
  })
  if (!raw || !raw.trim()) return []

  // 尝试解析 JSON（可能被 markdown 代码块包裹）
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

  // 兜底：按行解析 "标题|描述" 或 "标题：描述"
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

/**
 * 从文本中提取 JSON 对象（含 tasks 数组）。
 * 支持：纯 JSON、Markdown ```json ... ``` 包裹、多种键名格式。
 */
function extractTasksJsonFromText(text: string): string | null {
  // 先尝试去掉 Markdown 代码块（Coze 有时会返回 ```json\n{...}\n```），避免第一次解析失败
  let work = text
  const codeBlockMatch = work.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    const inner = codeBlockMatch[1].trim()
    if (inner.startsWith('{') || inner.startsWith('[')) work = inner
  }

  // 策略 1：查找 {"tasks": [...]} 或 {"tasks":[...]}
  let start = work.indexOf('{"tasks"')
  if (start < 0) start = work.indexOf('{"tasks":')
  if (start < 0) start = work.indexOf('{tasks:')
  if (start < 0) start = work.indexOf('{ tasks:')
  if (start < 0) start = work.indexOf('{ "tasks"')

  // 策略 2：查找包含 "tasks" 字段的对象
  if (start < 0) {
    const idx = work.indexOf('"tasks"')
    if (idx >= 0) start = work.lastIndexOf('{', idx)
  }

  // 策略 3：直接数组 [{"title":...}]
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

/** 修复 Coze 常出的 JSON 小问题（尾部逗号、key 与 value 未用冒号分隔等），便于一次解析失败后重试 */
function sanitizeTasksJson(jsonStr: string): string {
  let s = jsonStr
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/\r\n/g, '\n')
    .trim()
  // Coze 有时把 "title" 与值连在一起写成 "titleXXX"，补回冒号与引号： "titleXXX","description" -> "title":"XXX","description"
  s = s.replace(/"title([^"]+)",\s*"(description|priority)"/g, (_m, val, key) => `"title":"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}","${key}"`)
  // 同理 "priority" 与值合并： "prioritynormal" 或 "priorityurgent" -> "priority":"normal" / "priority":"urgent"
  s = s.replace(/"priority(urgent|normal)"(\s*[,}\]])/g, '"priority":"$1"$2')
  return s
}

/**
 * 从 start 位置开始提取平衡的括号对（支持嵌套）
 */
function extractBalancedBracket(text: string, start: number, openChar: string, closeChar: string): string | null {
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

/** 智能待办生成 LLM 返回的单条任务 */
type IntelligentTodoItem = { 
  title: string
  description: string
  priority: string
  aiFeature?: string
  assignedRole?: string
}

/** LLM 待办生成结果：任务列表 + 若为空则带原因（便于前端/日志排查 Coze 返回空） */
export type IntelligentTodosLLMResult = { tasks: IntelligentTodoItem[]; llmEmptyReason?: string }

/** 从 locale 推导国家/地区代码（供 LLM 入参） */
function localeToCountryCode(locale: string | undefined): string {
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

/**
 * 基于多维度上下文（店铺、时间、历史、阶段、节日、趋势、异常摘要）调用 LLM 生成智能待办；条数由 Coze 内置规则控制。
 * 入参 locale/countryCode 用于要求 LLM 按指定语言与地区回复。复用话术 LLM 配置；未配置或调用失败时返回空数组。
 */
async function generateIntelligentTodosWithLLM(params: {
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
  /** 用户界面语言/地区，供 LLM 按语言回复（如 zh-CN、en-US、th-TH） */
  locale?: string
  /** 国家/地区代码（如 CN、US、TH），与 locale 一致供 LLM 参考 */
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
  const systemPrompt = `【语言】locale=${locale}，countryCode=${countryCode}。标题与描述用该语言。

你是直播电商待办助手。根据下方店铺与数据生成待办；有按日明细时请基于明细分析趋势，结论以你分析为准。

【范围】聚焦直播运营：内容、话术、节奏、转化、时段、商品、互动。产出 6～10 条可落地待办。

【输出】仅返回一个 JSON：{"tasks":[{"title":"标题","description":"描述","priority":"urgent或normal"},...]}。每条必须严格用英文双引号与冒号，例如 "title":"优化直播场次" 不能写成 "title优化直播场次"。无 markdown、无前缀，直接在回复中流式输出。`

  // 【store_data】/【store_attributes】/【raw_daily_table】为消息内数据块，Bot 在回复中直接输出 JSON 即可（见《Coze对接说明》）
  const days = 30
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
    total_likes: Number(currentStats?.totalLikes ?? 0) || 0,
    total_comments: Number(currentStats?.totalComments ?? 0) || 0,
    total_shares: Number(currentStats?.totalShares ?? 0) || 0,
    total_follows: Number(currentStats?.totalFollows ?? 0) || 0,
    total_product_views: Number(currentStats?.totalProductViews ?? 0) || 0,
    total_product_clicks: Number(currentStats?.totalProductClicks ?? 0) || 0,
    completed_orders: Number(currentStats?.totalCompletedOrders ?? 0) || 0,
  }
  const storeDataJson = JSON.stringify(storeDataObj)
  const storeAttributesStr = attrs.length > 0 ? attrs.join(' | ') : ''
  const rawDailyTableStr = rawDailyStatsText?.trim() ?? ''

  const userMessage = `【store_data】${storeDataJson}
【store_attributes】${storeAttributesStr}
【raw_daily_table】
${rawDailyTableStr}

【用户界面语言/地区】locale=${locale}，countryCode=${countryCode}
【店铺基本信息】
- 店铺名称：${storeName}
- 平台：${storePlatform || '未填'}
- 国家/区域：${region}
- 类目：${categories}${storeAttrsBlock.trim() ? `\n- 其他属性：${attrs.join(' | ')}` : ''}

【核心销售指标（最近30天）】
- 总订单数：${orders} 单（完成订单：${Number(currentStats?.totalCompletedOrders ?? 0) || 0} 单）
- 总观看数：${viewers} 人
- 总互动数：${interactions}（点赞 ${Number(currentStats?.totalLikes ?? 0) || 0}、评论 ${Number(currentStats?.totalComments ?? 0) || 0}、分享 ${Number(currentStats?.totalShares ?? 0) || 0}、关注 ${Number(currentStats?.totalFollows ?? 0) || 0}）
- 互动率：${interactionRate.toFixed(2)}%
- 商品曝光：${Number(currentStats?.totalProductViews ?? 0) || 0}，商品点击：${Number(currentStats?.totalProductClicks ?? 0) || 0}
- 总收入（GMV）：${gmv.toFixed(2)} ${currencyName}
- 转化率：${conversionRate.toFixed(2)}%
- 直播总时长：${duration.toFixed(1)} 小时
- 时均 GMV：${gmvPerHour.toFixed(0)} ${currencyName}

【历史对比】
${historicalBlock}${rawDataBlock}
【业务上下文】${existingTaskTitles.length > 0 ? `\n- 已有待办（避免重复）：${existingTaskTitles.slice(0, 10).join('；')}${existingTaskTitles.length > 10 ? '…' : ''}` : ''}${additionalUserPrompt?.trim() ? `\n- 用户补充：${additionalUserPrompt.trim().slice(0, 300)}` : ''}`

  // 调用 LLM，若首次返回空则自动重试（Coze 冷启动时第一次常返回空，第二次通常成功）
  const maxRetries = 2
  let raw = ''
  let lastAttemptReason = ''
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`[待办生成] 第 ${attempt + 1} 次重试调用 LLM（前次返回空）`)
      appendGenerateTasksLog(`[待办生成] 第 ${attempt + 1} 次重试调用 LLM`)
      await new Promise(resolve => setTimeout(resolve, 1500)) // 重试前等待 1.5 秒
    }
    // 待办与话术相同，走 Coze 流式接口；callLLMOnce 内部聚合全部 stream chunk 后返回完整文本，再解析 JSON
    const todoStreamTimeoutMs = Number(process.env.COZE_TODO_TIMEOUT_MS) || 300000 // 默认 5 分钟，Coze 推理或工具较慢时可设更大
    raw = await callLLMOnce({
    systemPrompt,
    userMessage,
      temperature: existingTaskTitles.length > 0 ? 0.75 : 0.6,
      maxTokens: 3000,
    taskType: 'todo',
      timeoutMs: todoStreamTimeoutMs,
      config: llmConfig,
  })
    if (raw && raw.trim()) break // 有内容则成功，跳出重试循环
    if (attempt === 0) {
      console.warn('[待办生成] 第 1 次调用返回空：Coze 流式未产出正文，请查看 backend/coze-debug.log 中 empty_stream_payloads；流式须在 answer/delta 中输出正文，见 docs/Coze对接说明-待办与话术入参出参.md')
      appendGenerateTasksLog('[待办生成] 第 1 次返回空，见 coze-debug.log 与《Coze对接说明》流式要求')
    }
    lastAttemptReason = `第 ${attempt + 1} 次调用返回空`
  }
  if (!raw || !raw.trim()) {
    const reason = `Coze/LLM ${maxRetries} 次调用均返回空（可能超时、流式未产出或未配置）`
    console.warn('[待办生成]', reason, '，将走规则兜底。排查见 docs/待办生成返回空-排查说明.md')
    appendGenerateTasksLog(`[待办生成] ${reason}，将走规则兜底`)
    return { tasks: [], llmEmptyReason: reason }
  }
  if (lastAttemptReason) {
    console.log(`[待办生成] 重试后成功获得 LLM 响应（${raw.length} 字符）`)
    appendGenerateTasksLog(`[待办生成] 重试后成功获得 LLM 响应`)
  }

  let text = raw.trim()
  const jsonStr = extractTasksJsonFromText(text)
  if (!jsonStr) {
    const preview = text.slice(0, 200).replace(/\n/g, ' ')
    const reason = `Coze 返回了约 ${text.length} 字，但未包含合法 JSON 对象。返回前 200 字: ${preview}`
    console.warn('[待办生成]', reason)
    appendGenerateTasksLog(`[待办生成] LLM 未返回合法 JSON。返回前80字: ${text.slice(0, 80).replace(/\n/g, ' ')}`)
    return { tasks: [], llmEmptyReason: reason }
  }
  const parsePayload = (str: string) => {
    return JSON.parse(str) as {
      tasks?: Array<{
        title?: string
        description?: string
        priority?: string
        task?: string
        expected_outcome?: string
        action_steps?: string[]
        name?: string
        content?: string
        level?: string
        importance?: string
      }>
    }
  }
  try {
    let parsed: ReturnType<typeof parsePayload>
    try {
      parsed = parsePayload(jsonStr)
    } catch {
      parsed = parsePayload(sanitizeTasksJson(jsonStr))
    }
    const list = parsed?.tasks
    if (!Array.isArray(list) || list.length === 0) {
      const reason = 'Coze 返回的 JSON 中 tasks 为空或非数组'
      console.warn('[待办生成]', reason, '，将走规则兜底')
      appendGenerateTasksLog('[待办生成] LLM 返回 tasks 为空或非数组，将走规则兜底')
      return { tasks: [], llmEmptyReason: reason }
    }
    const seenTitles = new Set<string>()
    const tasks = list
      .filter((t) => {
        if (!t) return false
        const titleRaw = (t.title ?? t.task ?? t.name ?? t.content ?? t.description ?? '').trim()
        if (!titleRaw) return false
        const title = titleRaw.slice(0, 50)
        const key = title.slice(0, 25)
        if (seenTitles.has(key)) return false
        seenTitles.add(key)
        return true
      })
      .map((t) => {
        const titleStr = String(t.title ?? t.task ?? t.name ?? t.content ?? '智能建议任务').trim().slice(0, 100)
        const descParts: string[] = []
        if (t.description && String(t.description).trim()) descParts.push(String(t.description).trim())
        if (t.expected_outcome && String(t.expected_outcome).trim()) descParts.push(String(t.expected_outcome).trim())
        if (t.content && t.content !== titleStr && String(t.content).trim()) descParts.push(String(t.content).trim())
        if (Array.isArray(t.action_steps) && t.action_steps.length > 0) {
          descParts.push(t.action_steps.map((s) => String(s).trim()).filter(Boolean).join('；'))
        }
        let description = descParts.length > 0 ? descParts.join('\n').trim().slice(0, 2000) : ''
        description = stripToolsSectionFromDescription(description)
        const priorityRaw = (t.priority ?? t.level ?? t.importance ?? '').toString().toLowerCase()
        const priority =
          priorityRaw === 'urgent' || priorityRaw === 'high' || priorityRaw === 'critical' ? 'urgent' : 'normal'
        const tags = autoTagTaskRoleAndTool(titleStr, description)
        return {
          title: titleStr,
          description,
          priority,
          assignedRole: tags.assignedRole,
          aiFeature: tags.aiFeature
        }
      })
    return { tasks }
  } catch (e) {
    const errMsg = (e as Error)?.message ?? ''
    const reason = `Coze 返回的 JSON 解析失败: ${errMsg}`
    console.warn('[待办生成]', reason, '，将走规则兜底')
    appendGenerateTasksLog(`[待办生成] LLM JSON 解析失败: ${errMsg}`)
    if (jsonStr.length > 0 && errMsg.includes('position')) {
      const pos = parseInt(String(errMsg.match(/position (\d+)/)?.[1] ?? '0'), 10)
      const snippet = jsonStr.slice(Math.max(0, pos - 40), pos + 60).replace(/\n/g, ' ')
      console.warn('[待办生成] 出错位置附近片段:', snippet)
    }
    return { tasks: [], llmEmptyReason: reason }
  }
}

/** 从描述中移除【工具】段落，仅保留目标/步骤/预期等正文；工具类信息由快速跳转体现 */
function stripToolsSectionFromDescription(desc: string): string {
  if (!desc || !desc.includes('【工具】')) return desc
  return desc
    .replace(/\n*【工具】[^\n]*(?:\n(?!【)[^\n]*)*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 判断 LLM 生成的任务列表中是否已覆盖节日类 */
function llmTasksCoverEvent(titles: string[]): boolean {
  const eventKeywords = /节日|倒计时|备货|大促|春节|618|双11|双12|宋干|水灯/
  return titles.some((t) => eventKeywords.test(t))
}

/**
 * 根据任务标题和描述自动识别负责岗位和执行工具
 * 返回：{ assignedRole: 'operator' | 'anchor' | 'both' | undefined, aiFeature: string | undefined }
 */
function autoTagTaskRoleAndTool(title: string, description: string): { assignedRole: string | undefined; aiFeature: string | undefined } {
  const text = (title + ' ' + description).toLowerCase()
  
  // 岗位识别规则
  let assignedRole: string | undefined = undefined
  
  // 主播专属任务：话术、互动、现场应变、声音语调、节奏控制等
  const anchorKeywords = /话术|逼单|宠粉|互动话术|主播.*技巧|主播.*培训|语调|声音|现场.*应变|直播.*节奏|开场.*话术|收尾.*话术|带货.*话术|促单/
  if (anchorKeywords.test(text)) {
    assignedRole = 'anchor'
  }
  
  // 运营专属任务：数据分析、策略制定、复盘、选品、时段、商品布局、活动策划等
  const operatorKeywords = /复盘|数据.*分析|策略|选品|时段.*选择|时段.*优化|商品.*布局|活动.*策划|投放|A\/B.*测试|测试.*方案|测试.*效果|测试.*新品|复制.*策略|优化.*策略|分析.*原因|分析.*问题|建立.*机制|制定.*计划|数据.*复盘|日.*复盘/
  if (!assignedRole && operatorKeywords.test(text)) {
    assignedRole = 'operator'
  }
  
  // 两者协同任务：需要运营制定策略 + 主播执行的任务
  const bothKeywords = /直播.*内容.*优化|直播.*流程|场次.*安排|商品.*推荐.*直播|直播.*商品|短视频.*引流.*直播|直播间.*优化|直播.*时长.*优化/
  if (bothKeywords.test(text)) {
    assignedRole = 'both'
  }
  
  // 执行工具识别规则（基于已有的 aiFeature 类型）
  let aiFeature: string | undefined = undefined
  
  if (/节日|大促|备货|情人节|圣诞|宋干|水灯|倒计时/.test(text)) {
    aiFeature = 'event' // 节日提醒
  } else if (/对比|同比|环比|店铺对比|时期对比/.test(text)) {
    aiFeature = 'comparison' // 店铺/时期对比
  } else if (/定位|店铺定位|完善店铺|目标人群|品牌定位|价格区间/.test(text)) {
    aiFeature = 'positioning' // 店铺定位
  } else if (/品牌|品牌形象|品牌建设/.test(text)) {
    aiFeature = 'brand' // 品牌
  } else if (/供应链|供货|采购/.test(text)) {
    aiFeature = 'supply_chain' // 供应链
  } else if (/粉丝运营|客户维护|客户运营|crm|私域/.test(text)) {
    aiFeature = 'crm' // 粉丝/客户运营
  } else if (/主图|图片分析|主图优化|商品图|商品卡主图|直播场景.*(图|分析)/.test(text)) {
    aiFeature = 'image_analysis' // 图片分析：商品卡主图、直播场景
  } else if (/直播场景|场景打分|场景布置|直播间布置|录屏|视频分析/.test(text)) {
    aiFeature = 'scene_scoring' // 直播场景打分、录屏分析
  } else if (/话术|逼单|宠粉|开场.*话术|收尾.*话术|促单|话术考核|话术评估|话术打分/.test(text)) {
    aiFeature = 'script' // 话术生成（含话术考核）
  } else if (/选品|商品.*推荐|商品.*布局|商品.*组合|爆品|竞争力|竞品|竞争分析/.test(text)) {
    aiFeature = 'product_recommend' // 商品推荐（含产品竞争力分析）
  } else if (/时段|时间.*选择|黄金.*时段|流量.*高峰/.test(text)) {
    aiFeature = 'time_recommend' // 时段推荐
  } else if (/互动|评论|私信|粉丝|关注|留存/.test(text)) {
    aiFeature = 'engagement' // 互动策略
  } else if (/内容|选题|脚本|剧本|短视频/.test(text)) {
    aiFeature = 'content' // 内容策划
  } else if (/定价|价格|客单价|利润/.test(text)) {
    aiFeature = 'pricing' // 定价策略
  } else if (/数据|统计|指标|报表|分析/.test(text)) {
    aiFeature = 'stats' // 数据分析
  } else if (/复盘|总结|回顾/.test(text)) {
    aiFeature = 'report' // 复盘报告
  } else if (/流量|引流|推广|投放/.test(text)) {
    aiFeature = 'marketing' // 流量营销
  } else if (/排期|日程|计划|安排/.test(text)) {
    aiFeature = 'schedule' // 排期计划
  }
  
  return { assignedRole, aiFeature }
}

/** 判断 LLM 生成的任务列表中是否已覆盖短视频/引流类 */
function llmTasksCoverShortVideo(titles: string[]): boolean {
  return titles.some((t) => /短视频|引流|发布.*视频|视频.*引流/.test(t))
}

/**
 * 按店铺 ID 生成待办建议（仅返回列表，不写库）。
 * 供系统内「智能生成待办」使用，与 LLM 调用方式（Coze Agent / OpenAI）一致。
 */
export async function generateSuggestedTodosForStore(
  storeId: string,
  options?: {
    metricsOverride?: Record<string, unknown>
    /** 按日明细 TSV（表头：日期\\tGMV\\t直播时长(h)\\t观看\\t订单\\t…），可来自 Excel 解析；有则优先于 DB 拉取 */
    rawDailyOverride?: string
    /** 用户补充提示词，会追加到发给 LLM 的 userMessage */
    additionalUserPrompt?: string
    /** 多套 AI 工具：指定使用的配置，不传则用全局单套配置 */
    llmConfig?: { url: string; apiKey: string; model?: string }
    /** 当前店铺无运营数据时，用该店铺的 stats 生成待办（任务仍归属 storeId），用于测试/同样本店铺 */
    useStatsFromStoreId?: string
    /** 用户界面语言（如 zh-CN、en-US、th-TH），传给 LLM 以便按语言回复 */
    locale?: string
    /** 国家/地区代码（如 CN、US、TH），与 locale 一致供 LLM 参考 */
    countryCode?: string
  }
): Promise<{ tasks: Array<{ title: string; description: string; priority: string; source?: string; aiFeature?: string; assignedRole?: string }>; llmEmptyReason?: string }> {
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
  const TITLE_PREFIX_LEN = 6
  const existingTitleSet = new Set(existingTaskTitles)
  const existingPrefixSet = new Set(existingTaskTitles.map((t) => t.trim().slice(0, TITLE_PREFIX_LEN)))
  type ResultItem = { title: string; description: string; priority: string; source?: string; aiFeature?: string; assignedRole?: string }
  let result: ResultItem[] = []

  const dedup = (list: ResultItem[]) => {
    const seen = new Set<string>()
    return list.filter((t) => {
      const title = (t.title || '').trim()
      if (existingTitleSet.has(title)) return false
      const prefix = title.slice(0, TITLE_PREFIX_LEN)
      if (prefix.length >= TITLE_PREFIX_LEN && (existingPrefixSet.has(prefix) || seen.has(prefix))) return false
      seen.add(prefix)
      return true
    }).map((t) => {
      // 为每个任务自动打标岗位和工具（如果尚未标记）
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

  // 1）先检查「点击当天往前 30 天」是否有数据；有则用该区间生成待办
  const strictRange = getPeriodDateRange(0)
  const strictAgg = await aggregateStatsForRange(storeId, strictRange.dateFrom, strictRange.dateTo)
  const hasDataInStrict30 =
    !!strictAgg &&
    (strictAgg.totalViewers > 0 || strictAgg.totalGMV > 0 || strictAgg.totalOrders > 0 || strictAgg.totalDuration > 0)

  if (hasDataInStrict30) {
    const currentRange = strictRange
    const prevRange = getPeriodDateRange(1)
    const rawFromDb = await getRawDailyStatsForLLM(storeId, currentRange.dateFrom, currentRange.dateTo)
    const rawRaw = options?.rawDailyOverride ?? rawFromDb
    const rawDailyStatsText = rawRaw && String(rawRaw).trim() ? String(rawRaw) : undefined
    const currentAgg = strictAgg
    const prevAgg = await aggregateStatsForRange(storeId, prevRange.dateFrom, prevRange.dateTo)
    const metrics = options?.metricsOverride || {}
    const cur = currentAgg || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 }
    const prev = prevAgg || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 }
    const currentStats = {
      totalGMV: Number(metrics.total_revenue) || cur.totalGMV,
      totalDuration: cur.totalDuration || 1,
      totalViewers: Number(metrics.total_viewers) || cur.totalViewers,
      totalOrders: Number(metrics.total_orders) || cur.totalOrders,
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
    const timeContext = getTimeContext(region)
    const upcomingEvents = getUpcomingEvents(region, new Date())
    const storeStage = getStoreStage(
      currentStats.totalGMV,
      currentStats.totalDuration,
      Math.max(1, Math.floor(currentStats.totalOrders / 10))
    )
    const llmResult1 = await generateIntelligentTodosWithLLM({
      storeInfo,
      storeCategories,
      currentStats,
      historicalStats,
      timeContext,
      upcomingEvents,
      storeStage,
      trendAnalysis: null,
      anomaliesSummary: '',
      existingTaskTitles,
        rawDailyStatsText,
        additionalUserPrompt: options?.additionalUserPrompt,
        llmConfig: options?.llmConfig,
        locale: options?.locale,
        countryCode: options?.countryCode,
      })
    let tasks = llmResult1.tasks
    if (tasks.length === 0) llmEmptyReason = llmResult1.llmEmptyReason
    if (tasks.length === 0) {
      const statsCountRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM stats WHERE storeId = ?', [storeId])
      const statsRecordCount = statsCountRow?.c ?? 0
      const stageTasks = generateStageBasedTasks(storeStage, storeInfo, currentStats, statsRecordCount)
      tasks = stageTasks.map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        source: 'stage',
        aiFeature: t.aiFeature,
      })) as Array<{ title: string; description: string; priority: string; source?: string; aiFeature?: string }>
    } else {
      // LLM 返回了待办，标记为 llm_intelligent
      tasks = tasks.map((t) => ({
        ...t,
        source: 'llm_intelligent',
      })) as Array<{ title: string; description: string; priority: string; source?: string; aiFeature?: string }>
    }
    
    // 增加月同比/年同比待办（规则生成，不调用 LLM）
    const yoyStats = await getYearOverYearStats(storeId, currentRange.dateFrom, currentRange.dateTo)
    const momStats = await getMonthOverMonthStats(storeId, currentRange.dateFrom, currentRange.dateTo)
    const comparisonTasks = generateComparisonTasks(currentStats, yoyStats, momStats, storeInfo)
    if (comparisonTasks.length > 0) {
      tasks.push(...comparisonTasks.map((t) => ({
        ...t,
        aiFeature: 'comparison' as const,
      })))
    }
    
    result = dedup(tasks.map((t) => {
      const item = t as ResultItem
      return { title: t.title, description: t.description, priority: t.priority, source: item.source, aiFeature: item.aiFeature }
    }))
  } else {
    // 2a）无 DB 数据但入参带了「按日明细 + 汇总」：仅用入参走 LLM（Excel + 提示词场景）
    const rawOverride = options?.rawDailyOverride?.trim()
    const metrics = options?.metricsOverride && typeof options.metricsOverride === 'object' ? options.metricsOverride : {}
    const hasOverride = rawOverride && (Number(metrics.total_revenue) > 0 || Number(metrics.total_viewers) > 0 || Number(metrics.total_orders) > 0)
    if (hasOverride) {
      const currentStats = {
        totalGMV: Number(metrics.total_revenue) || 0,
        totalDuration: Number(metrics.total_duration) || 1,
        totalViewers: Number(metrics.total_viewers) || 0,
        totalOrders: Number(metrics.total_orders) || 0,
        totalInteractions: Number(metrics.total_interactions) || 0,
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
      const timeContext = getTimeContext(region)
      const upcomingEvents = getUpcomingEvents(region, new Date())
      const storeStage = getStoreStage(
        currentStats.totalGMV,
        currentStats.totalDuration,
        Math.max(1, Math.floor(currentStats.totalOrders / 10))
      )
      const llmResultOverride = await generateIntelligentTodosWithLLM({
        storeInfo,
        storeCategories,
        currentStats,
        historicalStats,
        timeContext,
        upcomingEvents,
        storeStage,
        trendAnalysis: null,
        anomaliesSummary: '',
        existingTaskTitles,
        rawDailyStatsText: rawOverride,
        additionalUserPrompt: options?.additionalUserPrompt,
        llmConfig: options?.llmConfig,
        locale: options?.locale,
        countryCode: options?.countryCode,
      })
      if (llmResultOverride.tasks.length > 0) {
        result = dedup(llmResultOverride.tasks.map((t) => ({
          title: t.title,
          description: t.description,
          priority: t.priority,
          source: 'llm_intelligent',
          aiFeature: (t as ResultItem).aiFeature,
        })) as ResultItem[])
        return { tasks: result, llmEmptyReason: llmResultOverride.llmEmptyReason }
      }
      if (llmResultOverride.llmEmptyReason) llmEmptyReason = llmResultOverride.llmEmptyReason
    }

    // 2）「当天往前 30 天」无数据：用系统里现有的最近 30 天（以最新有数据日为终点）生成待办
    let latestDate = await getStoreLatestStatsDate(storeId)
    if (!latestDate) {
      const prevYear = new Date().getFullYear() - 1
      const yearRange = { dateFrom: `${prevYear}-01-01`, dateTo: `${prevYear}-12-31` }
      const yearAgg = await aggregateStatsForRange(storeId, yearRange.dateFrom, yearRange.dateTo)
      const hasYearData =
        !!yearAgg &&
        (yearAgg.totalViewers > 0 || yearAgg.totalGMV > 0 || yearAgg.totalOrders > 0 || yearAgg.totalDuration > 0)
      if (hasYearData) latestDate = yearRange.dateTo
    }
    if (latestDate) {
      const existingRange = getPeriodDateRangeFromEnd(latestDate, 0)
      const existingAgg = await aggregateStatsForRange(storeId, existingRange.dateFrom, existingRange.dateTo)
      const hasExistingData =
        !!existingAgg &&
        (existingAgg.totalViewers > 0 || existingAgg.totalGMV > 0 || existingAgg.totalOrders > 0 || existingAgg.totalDuration > 0)
      if (hasExistingData) {
        const prevRange = getPeriodDateRangeFromEnd(latestDate, 1)
        const prevAgg = await aggregateStatsForRange(storeId, prevRange.dateFrom, prevRange.dateTo)
        const prev = prevAgg || { totalGMV: 0, totalDuration: 0, totalViewers: 0, totalOrders: 0, totalInteractions: 0 }
        const currentStats = {
          totalGMV: existingAgg.totalGMV,
          totalDuration: existingAgg.totalDuration || 1,
          totalViewers: existingAgg.totalViewers,
          totalOrders: existingAgg.totalOrders,
          totalInteractions: existingAgg.totalInteractions || 0,
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
        const rawFromDb = await getRawDailyStatsForLLM(storeId, existingRange.dateFrom, existingRange.dateTo)
        const rawRaw = options?.rawDailyOverride ?? rawFromDb
        const rawDailyStatsText = rawRaw && String(rawRaw).trim() ? String(rawRaw) : undefined
        const timeContext = getTimeContext(region)
        const upcomingEvents = getUpcomingEvents(region, new Date())
        const storeStage = getStoreStage(
          currentStats.totalGMV,
          currentStats.totalDuration,
          Math.max(1, Math.floor(currentStats.totalOrders / 10))
        )
        const llmResult2 = await generateIntelligentTodosWithLLM({
          storeInfo,
          storeCategories,
          currentStats,
          historicalStats,
          timeContext,
          upcomingEvents,
          storeStage,
          trendAnalysis: null,
          anomaliesSummary: '',
          existingTaskTitles,
          rawDailyStatsText,
          additionalUserPrompt: options?.additionalUserPrompt,
          llmConfig: options?.llmConfig,
          locale: options?.locale,
          countryCode: options?.countryCode,
        })
        let tasks = llmResult2.tasks
        if (tasks.length === 0) llmEmptyReason = llmResult2.llmEmptyReason
        if (tasks.length === 0) {
          const statsCountRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM stats WHERE storeId = ?', [storeId])
          const statsRecordCount = statsCountRow?.c ?? 0
          const stageTasks = generateStageBasedTasks(storeStage, storeInfo, currentStats, statsRecordCount)
          tasks = stageTasks.map((t) => ({
            title: t.title,
            description: t.description,
            priority: t.priority,
            source: 'stage',
            aiFeature: t.aiFeature,
          })) as ResultItem[]
        } else {
          // LLM 返回了待办，标记为 llm_intelligent
          tasks = tasks.map((t) => ({
            ...t,
            source: 'llm_intelligent',
          })) as ResultItem[]
        }
        
        // 增加月同比/年同比待办（规则生成，不调用 LLM）
        const yoyStats = await getYearOverYearStats(storeId, existingRange.dateFrom, existingRange.dateTo)
        const momStats = await getMonthOverMonthStats(storeId, existingRange.dateFrom, existingRange.dateTo)
        const comparisonTasks = generateComparisonTasks(currentStats, yoyStats, momStats, storeInfo)
        if (comparisonTasks.length > 0) {
          tasks.push(...comparisonTasks.map((t) => ({
            ...t,
            aiFeature: 'comparison' as const,
          })))
        }
        
        result = dedup(tasks as ResultItem[])
      }
    }

    // 2.5）当前店铺无任何 stats 时：若指定了 useStatsFromStoreId，用该店铺的数据生成（任务仍归属当前 storeId）
    if (result.length === 0 && options?.useStatsFromStoreId) {
      const dataStoreId = options.useStatsFromStoreId
      const dataStore = await dbGet<{ id: string }>('SELECT id FROM stores WHERE id = ?', [dataStoreId])
      if (dataStore) {
        const strictAggData = await aggregateStatsForRange(dataStoreId, strictRange.dateFrom, strictRange.dateTo)
        const hasDataInDataStore =
          !!strictAggData &&
          (strictAggData.totalViewers > 0 ||
            strictAggData.totalGMV > 0 ||
            strictAggData.totalOrders > 0 ||
            strictAggData.totalDuration > 0)
        if (hasDataInDataStore) {
          const prevRange = getPeriodDateRange(1)
          const prevAggData = await aggregateStatsForRange(dataStoreId, prevRange.dateFrom, prevRange.dateTo)
          const prev = prevAggData || {
            totalGMV: 0,
            totalDuration: 0,
            totalViewers: 0,
            totalOrders: 0,
            totalInteractions: 0,
          }
          const currentStats = {
            totalGMV: strictAggData.totalGMV,
            totalDuration: strictAggData.totalDuration || 1,
            totalViewers: strictAggData.totalViewers,
            totalOrders: strictAggData.totalOrders,
            totalInteractions: strictAggData.totalInteractions || 0,
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
          const rawFromDb = await getRawDailyStatsForLLM(dataStoreId, strictRange.dateFrom, strictRange.dateTo)
          const rawDailyStatsText = rawFromDb && String(rawFromDb).trim() ? String(rawFromDb) : undefined
          const timeContext = getTimeContext(region)
          const upcomingEvents = getUpcomingEvents(region, new Date())
          const storeStage = getStoreStage(
            currentStats.totalGMV,
            currentStats.totalDuration,
            Math.max(1, Math.floor(currentStats.totalOrders / 10))
          )
          const llmResult3 = await generateIntelligentTodosWithLLM({
            storeInfo,
            storeCategories,
            currentStats,
            historicalStats,
            timeContext,
            upcomingEvents,
            storeStage,
            trendAnalysis: null,
            anomaliesSummary: '',
            existingTaskTitles,
            rawDailyStatsText,
            additionalUserPrompt: options?.additionalUserPrompt,
            llmConfig: options?.llmConfig,
            locale: options?.locale,
            countryCode: options?.countryCode,
          })
          let tasks = llmResult3.tasks
          if (tasks.length === 0) llmEmptyReason = llmResult3.llmEmptyReason
          if (tasks.length === 0) {
            const statsCountRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM stats WHERE storeId = ?', [storeId])
            const statsRecordCount = statsCountRow?.c ?? 0
            const stageTasks = generateStageBasedTasks(storeStage, storeInfo, currentStats, statsRecordCount)
            tasks = stageTasks.map((t) => ({
              title: t.title,
              description: t.description,
              priority: t.priority,
              source: 'stage',
              aiFeature: t.aiFeature,
            })) as ResultItem[]
          } else {
            // LLM 返回了待办，标记为 llm_intelligent
            tasks = tasks.map((t) => ({
              ...t,
              source: 'llm_intelligent',
            })) as ResultItem[]
          }
          result = dedup(tasks as ResultItem[])
          console.log(`[待办生成] 当前店铺无数据，已使用 useStatsFromStoreId=${dataStoreId} 的数据为 storeId=${storeId} 生成待办`)
        } else {
          const latestDataDate = await getStoreLatestStatsDate(dataStoreId)
          if (latestDataDate) {
            const existingRange = getPeriodDateRangeFromEnd(latestDataDate, 0)
            const existingAgg = await aggregateStatsForRange(dataStoreId, existingRange.dateFrom, existingRange.dateTo)
            const hasExistingData =
              !!existingAgg &&
              (existingAgg.totalViewers > 0 ||
                existingAgg.totalGMV > 0 ||
                existingAgg.totalOrders > 0 ||
                existingAgg.totalDuration > 0)
            if (hasExistingData) {
              const prevRange = getPeriodDateRangeFromEnd(latestDataDate, 1)
              const prevAgg = await aggregateStatsForRange(dataStoreId, prevRange.dateFrom, prevRange.dateTo)
              const prev = prevAgg || {
                totalGMV: 0,
                totalDuration: 0,
                totalViewers: 0,
                totalOrders: 0,
                totalInteractions: 0,
              }
              const currentStats = {
                totalGMV: existingAgg!.totalGMV,
                totalDuration: existingAgg!.totalDuration || 1,
                totalViewers: existingAgg!.totalViewers,
                totalOrders: existingAgg!.totalOrders,
                totalInteractions: existingAgg!.totalInteractions || 0,
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
              const rawFromDb = await getRawDailyStatsForLLM(dataStoreId, existingRange.dateFrom, existingRange.dateTo)
              const rawDailyStatsText = rawFromDb && String(rawFromDb).trim() ? String(rawFromDb) : undefined
              const timeContext = getTimeContext(region)
              const upcomingEvents = getUpcomingEvents(region, new Date())
              const storeStage = getStoreStage(
                currentStats.totalGMV,
                currentStats.totalDuration,
                Math.max(1, Math.floor(currentStats.totalOrders / 10))
              )
              const llmResult4 = await generateIntelligentTodosWithLLM({
                storeInfo,
                storeCategories,
                currentStats,
                historicalStats,
                timeContext,
                upcomingEvents,
                storeStage,
                trendAnalysis: null,
                anomaliesSummary: '',
                existingTaskTitles,
                rawDailyStatsText,
                additionalUserPrompt: options?.additionalUserPrompt,
                llmConfig: options?.llmConfig,
                locale: options?.locale,
                countryCode: options?.countryCode,
              })
              let tasks = llmResult4.tasks
              if (tasks.length === 0) llmEmptyReason = llmResult4.llmEmptyReason
              if (tasks.length === 0) {
                const statsCountRow = await dbGet<{ c: number }>('SELECT COUNT(*) as c FROM stats WHERE storeId = ?', [storeId])
                const statsRecordCount = statsCountRow?.c ?? 0
                const stageTasks = generateStageBasedTasks(storeStage, storeInfo, currentStats, statsRecordCount)
                tasks = stageTasks.map((t) => ({
                  title: t.title,
                  description: t.description,
                  priority: t.priority,
                  source: 'stage',
                  aiFeature: t.aiFeature,
                })) as ResultItem[]
              } else {
                // LLM 返回了待办，标记为 llm_intelligent
                tasks = tasks.map((t) => ({
                  ...t,
                  source: 'llm_intelligent',
                })) as ResultItem[]
              }
              result = dedup(tasks as ResultItem[])
              console.log(`[待办生成] 当前店铺无数据，已使用 useStatsFromStoreId=${dataStoreId} 的系统最近30天数据为 storeId=${storeId} 生成待办`)
            }
          }
        }
      }
    }
  }

  // 3）系统侧日期判定（不给 LLM）：仅当「最近一条数据的日期」距生成当天超过 15 天时，由系统补充一条「请上传最近30天的运营数据」
  const latestDataDate = await getStoreLatestStatsDate(storeId)
  const daysSince = (dateStr: string) =>
    Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000))
  if (!latestDataDate || daysSince(latestDataDate) > 15) {
    if (!result.some((t) => (t.title || '').trim() === uploadTask.title.trim())) {
      // 若本批已有基于数据的待办，说明已用「最近有数据的 30 天」做了分析，仅提醒可补传更新数据
      const desc =
        result.length > 0
          ? '当前已基于店铺最近有数据的 30 天做了分析；若已有更新数据可上传以便获得更贴合当下的建议。'
          : uploadTask.description
      result.push({ ...uploadTask, description: desc, source: 'stage' })
    }
  }
  // 兜底：任意分支导致 result 仍为空时，至少返回一条上传提示，避免「突然 0 条」
  if (result.length === 0) {
    console.warn(`[generateSuggestedTodosForStore] storeId=${storeId} 各分支未产出任何待办，兜底追加「请上传最近30天的运营数据」`)
    result.push({ ...uploadTask, source: 'stage' })
  }
  return { tasks: result, llmEmptyReason }
}

// ==================== 核心路由：智能生成任务（全面重构） ====================

router.post('/generate-tasks', async (req: AuthRequest, res) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  try {
    const { storeId, useStatsFromStoreId, rawDailyTable, metricsOverride, userPrompt, locale: bodyLocale, countryCode: bodyCountryCode } = req.body
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

    // 0. 先清空该店铺下「归属用户」的未完成待办，再生成（管理员为他人店铺时清空店铺主的待办）
    if (storeId) {
      await dbRun(
        'DELETE FROM tasks WHERE status = ? AND userId = ? AND (storeId = ? OR (storeId IS NULL AND ? IS NULL))',
        ['pending', taskOwnerId, storeId, storeId]
      )
      console.log('[智能生成] 已清空该店铺下未完成待办，再生成（确保基于现有数据抓取）')
      appendGenerateTasksLog('[智能生成] 已清空未完成待办，再生成')
    }

    // 1. 调用与智能生成共用同一套逻辑：generateSuggestedTodosForStore → LLM 或规则兜底
    let tasks: Array<{ title: string; description: string; priority: string; source?: string; aiFeature?: string; assignedRole?: string }> = []
    let useAgentMethodResult = false
    /** 本次生成是否/为何未使用 LLM，供前端展示配置提示 */
    let llmStatus: 'used' | 'not_configured' | 'skipped_env' | 'returned_empty' | 'call_failed' | 'no_data' = 'not_configured'
    /** 本次使用的数据区间（null=该店无 stats），便于确认 12 月等是否被用上 */
    let statsDateRangeUsed: { dateFrom: string; dateTo: string } | null = null
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
      })
      const suggested = suggestedResult.tasks
      const llmEmptyReasonFromStore = suggestedResult.llmEmptyReason
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
      const latest = await getStoreLatestStatsDate(storeId)
      if (latest) {
        const range = getPeriodDateRangeFromEnd(latest, 0)
        statsDateRangeUsed = { dateFrom: range.dateFrom, dateTo: range.dateTo }
      }
      // 若「当天往前30天」有数据，实际用的是该区间，覆盖为 strict 区间便于展示
      const strictR = getPeriodDateRange(0)
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
    const createdTasks: Array<{ id: string; title: string; description: string; priority: string; source: string; status: string; userId: string; storeId: string | null; createdAt: string; aiFeature?: string; assignedRole?: string }> = []
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
      try {
        await dbRun(
          'INSERT INTO tasks (id, title, description, priority, status, userId, storeId, createdAt, aiFeature, source, assignedRole) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, titleToUse, desc, pri, 'pending', taskOwnerId, storeId || null, createdAt, task.aiFeature ?? null, taskSource, task.assignedRole ?? null]
        )
      } catch (insertErr: any) {
        if (insertErr?.message?.includes('assignedRole') || insertErr?.message?.includes('no such column')) {
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
