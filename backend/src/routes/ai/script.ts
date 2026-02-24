/**
 * 话术相关路由：LLM 配置、话术生成（同步/流式）
 * 挂载于 /api/ai/script，路径：/config、/、/stream
 */

import express from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { dbGet, dbAll } from '../../db'
import { AuthRequest, requireAdmin } from '../../middleware/auth'
import crypto from 'crypto'
import { runScriptResearch, buildLLMSystemPrompt, buildLLMUserMessage } from '../../rules/scriptResearch'
import { buildCozeScriptPrompts, buildScriptToolCallMessage } from '../../rules/scriptLLMInput'
import { synthesizeScript } from '../../rules/scriptSynthesis'
import {
  injectVisualSuggestionsIntoContent,
  segmentForVisual,
  getVisualLegend,
  type VisualActionContext,
} from '../../rules/scriptVisualRules'
import { isScriptLLMConfigured, streamScriptFromLLM } from '../../services/scriptLLM'
import {
  setScriptLLMConfigInDB,
  loadScriptLLMConfigCache,
  getScriptLLMAllowedUserIds,
  getScriptLLMAllowedUserIdsSync,
  getScriptLLMConfigSync,
  getLLMModesSync,
} from '../../services/scriptLLMConfig'
import { getEffectiveToolConfigForUser, getDefaultToolId, setDefaultToolId, updateLlmTool, createLlmTool, listLlmTools } from '../../services/llmTools'
import { logRequest } from '../../utils/requestLog'
import { translateLongText, TranslateQuotaError, TRANSLATE_QUOTA_MESSAGE } from '../../utils/translate'
import type { ScriptType } from '../../rules/scriptGeneration'
import type { ScriptResearchResult, StoreContext, ScriptUserInput } from '../../rules/scriptResearch'

/** 话术生成依赖 LLM，未配置时返回给前端的统一说明 */
export const SCRIPT_LLM_REQUIRED_MESSAGE =
  '话术生成需要配置 LLM。管理员可在「管理员」-「LLM 配置」中填写 API 地址与密钥，配置后选定用户可用；或由部署人员在环境变量中配置后重启服务。'

/** 话术生成仅对选定用户开放时的无权限提示 */
const SCRIPT_LLM_ACCESS_DENIED_MESSAGE = '您暂无话术生成权限，请联系管理员开通'

/** 最近一次话术生成时 LLM（如 Coze）的原始输出，仅供管理员调试查看 */
let lastScriptLLMRawOutput: { content: string; at: string; mode: string } | null = null

function isLikelyOffTopicCozeOutput(content: string): boolean {
  const t = (content || '').toLowerCase()
  if (!t) return false
  const suspiciousPatterns = [
    '```mermaid',
    'radarchart',
    'flowchart',
    'gantt',
    '决策仪表盘',
    '政策对比',
    '平台政策核心差异对比表',
  ]
  return suspiciousPatterns.some((p) => t.includes(p))
}

const router = express.Router()

type StoreRow = {
  name?: string
  platform?: string
  region?: string
  targetAudience?: string
  minPrice?: number | null
  maxPrice?: number | null
  brandPositioning?: string | null
  brandStrategy?: string | null
} | null
type StatsRow = { totalGMV?: number; totalViewers?: number; totalOrders?: number; totalDuration?: number } | null

async function parseScriptRequestBody(body: Record<string, unknown>): Promise<{
  userInput: ScriptUserInput
  storeContext: StoreContext
  effectiveProduct: string
  topic?: string
  storeId?: string
  promotionInfo?: string
  countryCode?: string
}> {
  const {
    productName: rawProductName,
    productSku: rawProductSku,
    price,
    features,
    targetAudience,
    scriptType: rawScriptType = 'full-sales',
    language = 'zh-CN',
    promoCopy,
    promotionInfo: rawPromotionInfo,
    promotion_info: rawPromotionInfo2,
    country: rawCountry,
    countryCode: rawCountryCode,
    storeId,
    topic,
    duration,
    style,
    custom_requirements: rawCustomReq,
    customRequirements: rawCustomReq2,
  } = body
  // 支持 Coze 风格 script_type（下划线）映射到系统内部类型（短横线）
  const scriptTypeStr = String(rawScriptType)
  const cozeToInternalType: Record<string, string> = {
    full_process: 'full-sales',
    segment_audience: 'segment-audience',
    segment_product: 'segment-product',
    segment_concerns: 'segment-concerns',
    segment_benefits: 'segment-benefits',
    segment_after_sales: 'segment-after-sales',
    segment_closing: 'segment-closing',
  }
  const scriptType = cozeToInternalType[scriptTypeStr] || scriptTypeStr

  const hasProductName = rawProductName != null && String(rawProductName).trim() !== ''
  const explicitScriptType = [
    'full-sales',
    'full_process',
    'segment-audience',
    'segment-product',
    'segment-concerns',
    'segment-benefits',
    'segment-after-sales',
    'segment-closing',
    'segment_audience',
    'segment_product',
    'segment_concerns',
    'segment_benefits',
    'segment_after_sales',
    'segment_closing',
  ].includes(scriptType as string)
  const effectiveProduct = hasProductName
    ? String(rawProductName).trim()
    : explicitScriptType
      ? '主推商品'
      : ''
  
  // promotionInfo: 优先用 promotion_info（Coze 命名），其次 promotionInfo，最后 promoCopy（向后兼容）
  const promotionInfo = (rawPromotionInfo2 || rawPromotionInfo || promoCopy) as string | undefined
  
  // countryCode: 优先用前端传的 countryCode，其次 country（国家名，需映射），用于明确指定国家（解决英语等多国语言歧义）
  let countryCode: string | undefined
  if (rawCountryCode && typeof rawCountryCode === 'string') {
    countryCode = String(rawCountryCode).trim().toUpperCase()
  } else if (rawCountry && typeof rawCountry === 'string') {
    // 从国家名映射到代码
    const countryName = String(rawCountry).trim()
    const nameToCode: Record<string, string> = {
      '中国': 'CN', 'China': 'CN', '泰国': 'TH', 'Thailand': 'TH', '越南': 'VN', 'Vietnam': 'VN',
      '美国': 'US', 'USA': 'US', 'United States': 'US', '菲律宾': 'PH', 'Philippines': 'PH',
      '新加坡': 'SG', 'Singapore': 'SG', '马来西亚': 'MY', 'Malaysia': 'MY',
      '印尼': 'ID', 'Indonesia': 'ID', '英国': 'GB', 'UK': 'GB', 'Britain': 'GB',
    }
    countryCode = nameToCode[countryName] || countryName.slice(0, 2).toUpperCase()
  }
  let storeInfo: StoreRow = null
  let storeCategories: string[] = []
  let storeStats: StatsRow = null
  if (storeId) {
    try {
      const row = await dbGet(
        'SELECT name, platform, region, targetAudience, minPrice, maxPrice, brandPositioning, brandStrategy FROM stores WHERE id = ?',
        [storeId]
      )
      storeInfo = row as StoreRow
      const cats = await dbAll(
        `SELECT c.name FROM categories c INNER JOIN store_categories sc ON c.id = sc.categoryId WHERE sc.storeId = ?`,
        [storeId]
      )
      storeCategories = (cats || []).map((r: { name: string }) => r.name)
      const statsRows = await dbAll(
        'SELECT totalGMV, totalViewers, totalOrders, totalDuration FROM stats WHERE storeId = ? ORDER BY createdAt DESC LIMIT 1',
        [storeId]
      )
      if (statsRows && statsRows.length > 0) storeStats = statsRows[0] as StatsRow
    } catch (e) {
      console.warn('获取店铺/统计失败:', e)
    }
  }
  const audienceFromStore = storeInfo?.targetAudience ?? undefined
  const storeContext: StoreContext = {
    storeName: storeInfo?.name ?? undefined,
    platform: storeInfo?.platform ?? undefined,
    region: storeInfo?.region ?? undefined,
    targetAudience: audienceFromStore,
    categories: storeCategories.length > 0 ? storeCategories : undefined,
    minPrice: storeInfo?.minPrice != null ? Number(storeInfo.minPrice) : undefined,
    maxPrice: storeInfo?.maxPrice != null ? Number(storeInfo.maxPrice) : undefined,
    brandPositioning: storeInfo?.brandPositioning != null ? String(storeInfo.brandPositioning) : undefined,
    brandStrategy: storeInfo?.brandStrategy != null ? String(storeInfo.brandStrategy) : undefined,
    latestStats:
      storeStats != null
        ? {
            totalGMV: storeStats.totalGMV,
            totalViewers: storeStats.totalViewers,
            totalOrders: storeStats.totalOrders,
            totalDuration: storeStats.totalDuration,
          }
        : undefined,
  }
  const targetAudienceStr =
    (typeof targetAudience === 'string' && targetAudience.trim() ? targetAudience.trim() : undefined) ||
    (typeof audienceFromStore === 'string' && audienceFromStore.trim() ? audienceFromStore.trim() : undefined)
  const productSku =
    rawProductSku != null && typeof rawProductSku === 'string' && String(rawProductSku).trim() !== ''
      ? String(rawProductSku).trim()
      : undefined
  const customRequirements =
    (rawCustomReq != null && typeof rawCustomReq === 'string' && String(rawCustomReq).trim() ? String(rawCustomReq).trim() : undefined) ||
    (rawCustomReq2 != null && typeof rawCustomReq2 === 'string' && String(rawCustomReq2).trim() ? String(rawCustomReq2).trim() : undefined)
  const userInput = {
    productName: effectiveProduct || '主推商品',
    productSku,
    price: price != null ? String(price).trim() : undefined,
    features: features != null ? String(features).trim() : undefined,
    targetAudience: targetAudienceStr,
    scriptType: (explicitScriptType ? scriptType : 'full-sales') as ScriptType,
    language: ['zh-CN', 'en-US', 'th-TH'].includes(language as string) ? (language as 'zh-CN' | 'en-US' | 'th-TH') : 'zh-CN',
    promoCopy: promotionInfo != null && String(promotionInfo).trim() ? String(promotionInfo).trim() : undefined,
    topic: topic as string | undefined,
    duration: duration as number | undefined,
    style: style as string | undefined,
    customRequirements,
  }
  return { 
    userInput, 
    storeContext, 
    effectiveProduct, 
    topic: topic as string | undefined, 
    storeId: storeId as string | undefined,
    promotionInfo: promotionInfo != null && String(promotionInfo).trim() ? String(promotionInfo).trim() : undefined,
    countryCode
  }
}

function buildScriptContentByType(params: {
  productName: string
  productSku?: string
  price?: string
  features?: string
  targetAudience?: string
  scriptType: string
  language: string
  promoCopy?: string
  storeName?: string
  storePlatform?: string
}): string {
  const { productName, productSku, price, features, targetAudience, scriptType, promoCopy, storeName, storePlatform } = params
  const p = productName || '本品'
  const skuHint = productSku ? `（SKU：${productSku}）` : ''
  const f = features || '核心卖点'
  const t = targetAudience || '目标人群'
  const priceStr = price ? `今日价 ${price}` : '（填写价格后生成利益点）'
  const promoStr = promoCopy ? promoCopy : '（填写营销方案后生成利益点/逼单）'

  if (scriptType === 'full-sales') {
    return `【基于店铺】${storeName ? `${storeName}${storePlatform ? `（${storePlatform}）` : ''}` : '未选店铺'}
【数据参考】${storeName ? `店铺：${storeName}；` : ''}话术可结合店铺品类与近期数据做卖点与节奏参考。

【完整销售流程话术 · 5-10分钟】

※ 以下每一步标题下方整段即为成品话术稿，无小标题、无分条，可直接照念。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第一步：圈人群 + 塑品（建议 20-30 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${t}的家人们，你们是不是也有这样的需求？想给主子更好的、或者担心现在用的不够安全好用？今天这款${p}${skuHint}就是冲着这些来的——专门为养宠家庭设计，咱们一块儿看看为什么说它值得。好，说完了谁需要、解决啥问题，接下来直接上干货——这款到底好在哪里！

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第二步：卖点提炼（建议 25-35 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

好，这款到底好在哪里？${f}，一个用好几年——省心又省钱；而且不藏污纳垢，洗起来方便，卫生有保障；颜值还在线，拍照发朋友圈都好看。养宠的家人真的可以闭眼入。说了这么多，大家肯定有疑问对不对？公屏打出来，咱们一个个答！

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第三步：打消顾虑（建议 20-30 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

家人们，刚才说了这么多卖点，大家肯定有疑问——现在来回答几个最关心的！公屏上有疑问的赶紧打出来，我一个个答！材质安全吗、有没有异味？放心给主子用！尺寸怎么选？规格表打公屏上了，你们看！好，问清楚了！接下来大家最关心的——今天什么价、送啥、省多少！

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第四步：利益点（建议 20-30 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

对，就是价和福利！${promoStr}

你们听好了——${priceStr}！家人们，这价你在外边真找不到！价说完了，很多人还会想——买回去不合适咋办？咱们说清楚售后！

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第五步：售后保障（建议 10-15 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

对，就说这个！收到不满意，7天无理由退，运费我们出！有质量问题？立刻换新，来回运费我们出！正品保证！今天下单明天发货，包邮！有问题扫售后小卡片上的二维码，一对一客服随时在。好，售后都说明白了！最后再给你们过一遍——就现在这价、这赠品，手慢真无！

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第六步：逼单（建议 15-20 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

好，家人们，最后再给你们过一遍——${f}，就你们最需要的！${priceStr}！${promoStr}！活动马上结束！7天无理由、质量问题包换、正品、发货！库存不多了！我数三个数——就现在这价、这赠品！3！小黄车点开没？2！1！下单！

━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 使用建议
━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 以上每步均为成品稿，可直接照念或稍作口语化调整。
2. 各步之间已内置承上启下过渡，可按顺序一气呵成。
3. 可循环播放：塑品-打消顾虑-营销-售后-逼单
4. 第二步卖点可做成手卡或KT板展示；第三步需实时回复公屏。
5. 第四步、第六步的赠品与价格请按实际活动修改。
6. 整个流程约5-10分钟，可拆分使用各环节。`
  }

  if (scriptType === 'segment-audience') {
    return `【圈人群部分话术】

${t}的家人们，你们是不是正好在找这种${p}${skuHint}？如果你也在意${f}，或者最近正被这类问题困扰，先别划走，今天这段就是专门给你准备的。先把你们最关心的问题打在公屏上，我按你们的场景一个个讲清楚。`
  }

  if (scriptType === 'segment-product') {
    return `【塑品部分话术】

家人们我们直接看重点，这款${p}${skuHint}不是“能用”，而是“好用省心”。核心就是：${f}。你用的时候会明显感觉到它和普通款不一样——更顺手、更稳定、更省事。你们先记住这几个关键词，等下我再结合你们的真实场景详细展开。`
  }

  if (scriptType === 'segment-concerns') {
    return `【打消顾虑部分话术】

家人们最常问的我先统一回答：能不能放心买、适不适合自己、买回去不合适怎么办。你们关心的点我都懂，别急，一个个说清楚。先把你们最担心的问题打在公屏上，我按你们的使用场景逐个回复，确保你下单前心里有底。`
  }

  if (scriptType === 'segment-benefits') {
    return `【利益点部分话术】

好，直接说大家最关心的：价格和福利。今天这款${p}${skuHint}${price ? `到手价 ${price}` : ''}${promoCopy ? `，本场活动是：${promoCopy}` : ''}。这套权益不是天天有，今天在直播间拿到手最划算。你把平时预算和今天福利一对比，就知道现在下单是省钱又省心。`
  }

  if (scriptType === 'segment-after-sales') {
    return `【售后部分话术】

再把售后给你们讲透：收到后不合适、使用中有问题、需要咨询客服，流程都很清晰。你们下单不用担心“买了没人管”，我们这边有完整售后支持。先把规则讲明白，你再决定下不下单，买得放心最重要。`
  }

  if (scriptType === 'segment-closing') {
    return `【逼单部分话术】

家人们最后一轮提醒：${f}${price ? `，今天到手 ${price}` : ''}${promoCopy ? `，再加上${promoCopy}` : ''}。这波价格和福利过了就恢复日常，想要的现在就点小黄车。别等库存和活动结束再来问，真的会错过。现在，直接下单。`
  }

  return `【开场白】
欢迎来到直播间！今天为大家带来${p}。

【主要内容】
1. 产品介绍（${f}）
2. 优惠活动（${priceStr}${promoStr ? `；${promoStr}` : ''}）
3. 互动环节

【结束语】
感谢大家的观看，记得关注我们！`
}

router.get('/config', async (req: AuthRequest, res) => {
  try {
    const tools = await listLlmTools()
    const configured = isScriptLLMConfigured() || tools.length > 0
    const isAdmin = req.user?.role === 'admin'
    if (isAdmin) {
      const allowedUserIds = await getScriptLLMAllowedUserIds()
      res.json({ configured, allowedUserIds: allowedUserIds ?? null })
    } else {
      const allowed = getScriptLLMAllowedUserIdsSync()
      const hasAccess = allowed === null || (Array.isArray(allowed) && req.user && allowed.includes(req.user.userId))
      res.json({ configured, hasAccess })
    }
  } catch (e) {
    res.status(500).json({ error: '查询失败' })
  }
})

/** GET /api/ai/script/last-raw：管理员查看最近一次话术生成时 Coze/LLM 的原始输出（未做兜底、合规等处理） */
router.get('/last-raw', requireAdmin, (_req: express.Request, res: express.Response) => {
  if (!lastScriptLLMRawOutput) {
    return res.status(404).json({ error: '暂无最近一次 LLM 原始输出，请先执行一次话术生成（且为 Coze 模式）' })
  }
  res.json({
    content: lastScriptLLMRawOutput.content,
    at: lastScriptLLMRawOutput.at,
    mode: lastScriptLLMRawOutput.mode,
  })
})

router.post('/config', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { url, apiKey, model, allowedUserIds: rawAllowed } = req.body ?? {}
    const u = typeof url === 'string' ? url.trim() : ''
    const k = typeof apiKey === 'string' ? apiKey.trim() : ''
    const m = typeof model === 'string' ? model.trim() : undefined
    const allowedUserIds = Array.isArray(rawAllowed) ? rawAllowed.map((id: unknown) => String(id).trim()).filter(Boolean) : undefined
    if (!u || !k) {
      return res.status(400).json({ error: '请填写 API 地址与 API 密钥' })
    }
    await setScriptLLMConfigInDB(u, k, m, allowedUserIds)
    await loadScriptLLMConfigCache()
    const defaultId = await getDefaultToolId()
    if (defaultId) {
      await updateLlmTool(defaultId, { url: u, api_key: k, model: m, name: '默认 LLM' })
    } else {
      const created = await createLlmTool({ name: '默认 LLM', url: u, api_key: k, model: m, sort_order: 0 })
      await setDefaultToolId(created.id)
    }
    res.json({ success: true, message: '配置已保存，选定用户可使用话术生成功能' })
  } catch (e) {
    console.error('保存话术 LLM 配置失败:', e)
    res.status(500).json({ error: '保存失败' })
  }
})

router.post('/', async (req, res) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  const authReq = req as AuthRequest
  try {
    if (isScriptLLMConfigured()) {
      const allowed = getScriptLLMAllowedUserIdsSync()
      if (allowed !== null && (!authReq.user || !allowed.includes(authReq.user.userId))) {
        return res.status(403).json({ error: SCRIPT_LLM_ACCESS_DENIED_MESSAGE, code: 'SCRIPT_LLM_ACCESS_DENIED' })
      }
    }
    const { userInput, storeContext, effectiveProduct, topic, storeId } = await parseScriptRequestBody(req.body)

    if (!isScriptLLMConfigured()) {
      return res.status(503).json({
        error: SCRIPT_LLM_REQUIRED_MESSAGE,
        code: 'SCRIPT_LLM_NOT_CONFIGURED',
      })
    }

    const research = runScriptResearch(userInput, storeContext)
    const synthesis = synthesizeScript(research)
    let content = synthesis.content

    const safeScriptType = userInput.scriptType
    const visualContext: VisualActionContext = {
      productName: userInput.productName,
      features: userInput.features,
      promoCopy: userInput.promoCopy,
      targetAudience: userInput.targetAudience,
    }
    content = injectVisualSuggestionsIntoContent(content, safeScriptType, visualContext)
    let translationSkipped = false
    let translationSkippedMessage: string | undefined
    if (userInput.language && userInput.language !== 'zh-CN') {
      try {
        console.log('[script] 开始将话术翻译为', userInput.language, '长度', content.length)
        content = await translateLongText(content, userInput.language, 'zh-CN')
        console.log('[script] 话术翻译完成')
      } catch (e) {
        translationSkipped = true
        translationSkippedMessage = e instanceof TranslateQuotaError || (e as any)?.code === 'QUOTA_EXCEEDED' ? TRANSLATE_QUOTA_MESSAGE : undefined
        console.warn('[script] 话术翻译失败，保留原文', e instanceof Error ? e.message : e)
      }
    }
    const visualParts = segmentForVisual(content, safeScriptType, visualContext)
    const visualLegend = getVisualLegend(safeScriptType, visualContext)

    const script = {
      id: crypto.randomUUID(),
      title: topic || (effectiveProduct ? `${effectiveProduct} · 话术` : '直播脚本'),
      content,
      duration: userInput.duration ?? (safeScriptType === 'full-sales' ? 120 : 30),
      style: userInput.style || '专业',
      storeId: storeId || null,
      createdAt: new Date().toISOString(),
      visualParts: visualParts.length > 0 ? visualParts : undefined,
      visualLegend: visualLegend.length > 0 ? visualLegend : undefined,
      dataSource: 'template',
      ...(translationSkipped ? { translationSkipped: true, ...(translationSkippedMessage ? { translationSkippedMessage } : {}) } : {}),
    }

    logRequest({
      event: 'script',
      requestId,
      userId: authReq.user?.userId,
      storeId: storeId || undefined,
      durationMs: Date.now() - startTime,
    })
    res.json(script)
  } catch (error) {
    logRequest({
      event: 'script',
      requestId,
      userId: authReq.user?.userId,
      storeId: undefined,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : '生成脚本失败',
    })
    console.error('生成脚本失败:', error)
    res.status(500).json({ error: '生成脚本失败' })
  }
})

router.post('/stream', async (req: express.Request, res: express.Response) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  const authReq = req as AuthRequest
  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    let llmConfig = authReq.user?.userId
      ? await getEffectiveToolConfigForUser(authReq.user.userId, (req.body as any)?.toolId)
      : null
    if (!llmConfig) llmConfig = getScriptLLMConfigSync()
    const configured = Boolean(llmConfig)
    if (configured) {
      const allowed = getScriptLLMAllowedUserIdsSync()
      const isAdmin = authReq.user?.role === 'admin'
      if (!isAdmin && allowed !== null && (!authReq.user || !allowed.includes(authReq.user.userId))) {
        res.status(403).json({ error: SCRIPT_LLM_ACCESS_DENIED_MESSAGE, code: 'SCRIPT_LLM_ACCESS_DENIED' })
        return
      }
    }
    const { userInput, storeContext, effectiveProduct, topic, storeId, promotionInfo, countryCode } = await parseScriptRequestBody(req.body)
    if (userInput.language && userInput.language !== 'zh-CN') {
      console.log('[script/stream] 收到 language=', userInput.language, '将生成后翻译话术')
    }
    // 走 LLM（尤其 Coze）时不先跑市调，节省耗时；仅在使用 OpenAI 长提示词或模板兜底时再跑市调
    let research: ScriptResearchResult | undefined
    const safeScriptType = userInput.scriptType
    const visualContext: VisualActionContext = {
      productName: userInput.productName,
      features: userInput.features,
      promoCopy: userInput.promoCopy,
      targetAudience: userInput.targetAudience,
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    // 未配置 LLM 时也走兜底规则：仍返回模板话术，不报错（流程图：话术模块 → 兜底规则 → 生成内容处理 → 前端展示）
    let llmContent = ''
    const useCozePrompts = Boolean(promotionInfo) || safeScriptType === 'full-sales'
    const scriptMode = getLLMModesSync().script
    const isCozeAgent = scriptMode === 'coze_agent'
    console.log('[script/stream] configured=%s scriptMode=%s', configured, scriptMode)
    if (configured) {
      // 方案1（Coze）：走 Coze Agent 时仅发短用户消息（不跑市调）；OpenAI 模式用自建提示词
      let systemPrompt: string
      let userMessage: string
      let toolCallOnly = false
      if (isCozeAgent) {
        // Coze 模式：仅发 userInput+storeContext 拼成的单条消息，请 Bot 在 answer 中直接输出话术
        userMessage = buildScriptToolCallMessage(userInput, storeContext, promotionInfo ?? undefined, countryCode)
        systemPrompt = ''
        toolCallOnly = true
        console.log('[script/stream] scriptMode=coze_agent 仅发短消息（未跑市调）productName=%s countryCode=%s storeId=%s', userInput.productName, countryCode || storeContext.region || '—', storeId || '—')
      } else {
        research = runScriptResearch(userInput, storeContext)
        if (useCozePrompts) {
          const cozePrompts = buildCozeScriptPrompts(research, promotionInfo ?? undefined, countryCode)
          systemPrompt = cozePrompts.systemPrompt
          userMessage = cozePrompts.userPrompt
          console.log('[script/stream] scriptMode=openai 使用 buildCozeScriptPrompts')
        } else {
          systemPrompt = buildLLMSystemPrompt(research)
          userMessage = buildLLMUserMessage(research)
        }
      }
      const streamOnce = async (): Promise<void> => {
        for await (const chunk of streamScriptFromLLM({
          systemPrompt,
          userMessage,
          temperature: 0.7,
          config: llmConfig ?? undefined,
          toolCallOnly,
        })) {
          llmContent += chunk
          send({ content: chunk })
        }
      }
      try {
        await streamOnce()
      } catch (llmErr) {
        const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr)
        console.warn('[script/stream] LLM 调用失败，走模板兜底。错误:', errMsg)
        llmContent = ''
      }
      // 首次无内容时自动重试一次，提高第一次点击即成功的概率（如 Coze 冷启动）
      if (!llmContent.trim() && configured) {
        console.log('[script/stream] LLM 首次无输出，自动重试一次')
        llmContent = ''
        try {
          await streamOnce()
        } catch (retryErr) {
          console.warn('[script/stream] LLM 重试仍失败', (retryErr instanceof Error ? retryErr.message : retryErr))
        }
      }
      // Coze 有时在极短时间内只返回 message_start+message_end、无 answer，导致 0 yield；延迟后再试一次
      if (!llmContent.trim() && configured && isCozeAgent) {
        console.log('[script/stream] Coze 两次均无输出，2.5s 后第三次重试')
        llmContent = ''
        await new Promise((r) => setTimeout(r, 2500))
        try {
          await streamOnce()
        } catch (retry2Err) {
          console.warn('[script/stream] Coze 第三次重试仍失败', (retry2Err instanceof Error ? retry2Err.message : retry2Err))
        }
      }
      // 保存最近一次 LLM 原始输出，便于管理员查看 Coze 实际返回内容（仅 Coze 且非空时）
      if (isCozeAgent && !llmContent.trim()) {
        console.log('[script/stream] Coze 模式但本次无 LLM 原文（可能超时/兜底），未写入 last-script-raw.txt')
      }
      if (isCozeAgent && llmContent.trim()) {
        const raw = llmContent.trim()
        lastScriptLLMRawOutput = {
          content: raw,
          at: new Date().toISOString(),
          mode: 'coze_agent',
        }
        try {
          // 固定写入 backend 目录：从 dist 运行时需 4 层到 backend，从 src 运行时 3 层
          const isDist = __dirname.includes(path.sep + 'dist' + path.sep) || __dirname.endsWith(path.sep + 'dist')
          const backendDir = path.resolve(__dirname, ...(isDist ? ['..', '..', '..', '..'] : ['..', '..', '..']))
          const filePath = path.join(backendDir, 'last-script-raw.txt')
          fs.writeFileSync(filePath, `# 最近一次话术生成 LLM 原始输出\n# at: ${lastScriptLLMRawOutput.at}\n# mode: ${lastScriptLLMRawOutput.mode}\n\n${raw}`, 'utf8')
          console.log('[script/stream] 最近一次 LLM 原文已写入:', filePath)
        } catch (e) {
          console.warn('[script/stream] 写入 last-script-raw.txt 失败', e)
        }
      }
    }
    // 直接使用 LLM 原始输出展示，不对正文做任何修改（仅空时用模板、超长时仅截断不追加文字）
    let content = llmContent.trim()
    if (isCozeAgent && content && isLikelyOffTopicCozeOutput(content)) {
      console.warn('[script/stream] 检测到 Coze 跑题输出（图表/政策分析），改走模板兜底')
      llmContent = ''
      content = ''
    }
    const SCRIPT_MAX_LENGTH = 100000
    if (content.length > SCRIPT_MAX_LENGTH) {
      content = content.slice(0, SCRIPT_MAX_LENGTH)
    }
    let usedTemplateFallback = false
    let relevanceWarning: string | undefined
    if (!content) {
      if (!research) research = runScriptResearch(userInput, storeContext)
      content = synthesizeScript(research).content
      usedTemplateFallback = true
      relevanceWarning = undefined
      console.log('[script/stream] LLM 无输出，使用模板（已按需跑市调）')
    }
    let translationSkipped = false
    let translationSkippedMessage: string | undefined
    if (userInput.language && userInput.language !== 'zh-CN') {
      try {
        console.log('[script/stream] 开始将话术翻译为', userInput.language, '长度', content.length)
        content = await translateLongText(content, userInput.language, 'zh-CN')
        console.log('[script/stream] 话术翻译完成')
      } catch (e) {
        translationSkipped = true
        translationSkippedMessage = e instanceof TranslateQuotaError || (e as any)?.code === 'QUOTA_EXCEEDED' ? TRANSLATE_QUOTA_MESSAGE : undefined
        console.warn('[script/stream] 话术翻译失败，保留原文', e instanceof Error ? e.message : e)
      }
    }
    // 在首行嵌入由什么生成的说明，便于用户区分 LLM/Coze/模板
    const sourceLabel = usedTemplateFallback ? '【由模板话术生成】' : (isCozeAgent ? '【由 Coze 生成】' : '【由 LLM 生成】')
    const contentWithSource = sourceLabel + '\n\n' + content
    const visualParts = segmentForVisual(contentWithSource, safeScriptType, visualContext)
    const visualLegend = getVisualLegend(safeScriptType, visualContext)
    
    // Coze 风格元信息（可选，仅当使用 Coze 提示词时才添加）
    const typicalLengthMap: Record<string, string> = {
      'full-sales': '5-10分钟',
      'segment-audience': '60-90秒',
      'segment-product': '90-120秒',
      'segment-concerns': '60-90秒',
      'segment-benefits': '90-120秒',
      'segment-after-sales': '60-90秒',
      'segment-closing': '60-90秒',
    }
    const hasCTA = ['full-sales', 'segment-benefits', 'segment-closing'].includes(safeScriptType)
    const usePromotionInfo = ['full-sales', 'segment-benefits', 'segment-closing'].includes(safeScriptType)
    const internalToCozeType: Record<string, string> = {
      'full-sales': 'full_process',
      'segment-audience': 'segment_audience',
      'segment-product': 'segment_product',
      'segment-concerns': 'segment_concerns',
      'segment-benefits': 'segment_benefits',
      'segment-after-sales': 'segment_after_sales',
      'segment-closing': 'segment_closing',
    }
    
    const script = {
      id: crypto.randomUUID(),
      title: topic || (effectiveProduct ? `${effectiveProduct} · 话术` : '直播脚本'),
      content: contentWithSource,
      duration: userInput.duration ?? (safeScriptType === 'full-sales' ? 120 : 30),
      style: userInput.style || '专业',
      storeId: storeId || null,
      createdAt: new Date().toISOString(),
      visualParts: visualParts.length > 0 ? visualParts : undefined,
      visualLegend: visualLegend.length > 0 ? visualLegend : undefined,
      dataSource: usedTemplateFallback ? 'template' : 'llm',
      relevanceWarning: relevanceWarning || undefined,
      ...(translationSkipped ? { translationSkipped: true, ...(translationSkippedMessage ? { translationSkippedMessage } : {}) } : {}),
      // Coze 兼容字段（可选，不影响现有 UI）
      language: userInput.language,
      script_type: internalToCozeType[safeScriptType] || safeScriptType,
      product_name: userInput.productName,
      meta: useCozePrompts ? {
        length: contentWithSource.length,
        estimated_duration: typicalLengthMap[safeScriptType] || '未知',
        has_cta: hasCTA,
        use_promotion_info: usePromotionInfo,
        localized: true,
      } : undefined,
    }
    logRequest({
      event: 'script/stream',
      requestId,
      userId: authReq.user?.userId,
      storeId: storeId || undefined,
      durationMs: Date.now() - startTime,
    })
    send({
      done: true,
      script,
      ...(usedTemplateFallback && !llmContent.trim()
        ? { fallbackReason: configured ? 'llm_timeout_or_empty' : 'llm_not_configured' }
        : {}),
    })
    res.end()
  } catch (error) {
    logRequest({
      event: 'script/stream',
      requestId,
      userId: authReq.user?.userId,
      storeId: undefined,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : '生成话术流式失败',
    })
    console.error('生成脚本流式失败:', error)
    send({ error: '生成话术时发生错误' })
    res.end()
  }
})

export default router
