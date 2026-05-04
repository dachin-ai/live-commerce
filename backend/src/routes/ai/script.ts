/**
 * 话术相关路由：LLM 配置、话术生成（同步/流式）
 * 挂载于 /api/ai/script，路径：/config、/、/stream
 */

import express from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { dbGet, dbAll } from '../../db'
import { authenticate, AuthRequest, requireAdmin } from '../../middleware/auth'
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
  setScriptLLMPermissionsOnlyInDB,
  loadScriptLLMConfigCache,
  getScriptLLMAllowedUserIds,
  getScriptLLMAllowedUserIdsSync,
  getScriptLLMEnabledFeatures,
  getScriptLLMEnabledFeaturesSync,
  getScriptLLMConfigSync,
  getLLMModesSync,
} from '../../services/scriptLLMConfig'
import { getEffectiveToolConfigForUser, getLLMConfigForFeature, getDefaultToolId, setDefaultToolId, updateLlmTool, createLlmTool, listLlmTools } from '../../services/llmTools'
import { logRequest } from '../../utils/requestLog'
import { translateLongText, TranslateQuotaError, TRANSLATE_QUOTA_MESSAGE } from '../../utils/translate'
import type { ScriptType } from '../../rules/scriptGeneration'
import type { ScriptResearchResult, StoreContext, ScriptUserInput } from '../../rules/scriptResearch'

/** 话术生成依赖 LLM，未配置时返回给前端的统一说明 */
export const SCRIPT_LLM_REQUIRED_MESSAGE =
  '话术生成需要配置 LLM。管理员可在「管理员」-「LLM 配置」中填写 API 地址与密钥，配置后选定用户可用；或由部署人员在环境变量中配置后重启服务。'

/** 话术生成仅对选定用户开放时的无权限提示 */
const SCRIPT_LLM_ACCESS_DENIED_MESSAGE = '您暂无话术生成权限，请联系管理员开通'

/** 与前端「产品特点」一致，防止超长入参撑爆请求体或 Coze 消息 */
const SCRIPT_FEATURES_MAX_CHARS = 4000

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
// S3: 全局认证 — 所有话术路由必须登录
router.use(authenticate)

/**
 * C1: 统一权限检查 — 同步/流式/所有话术生成路由共用
 * 检查：1) LLM 是否配置  2) 用户是否在允许列表  3) script 功能是否启用
 * 管理员始终允许（isAdmin 豁免）
 */
function checkScriptAccess(req: AuthRequest): { allowed: true } | { allowed: false; status: number; error: string; code: string } {
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'manager'
  if (isAdmin) return { allowed: true }

  const allowedUsers = getScriptLLMAllowedUserIdsSync()
  if (allowedUsers !== null && (!req.user || !allowedUsers.includes(req.user.userId))) {
    return { allowed: false, status: 403, error: SCRIPT_LLM_ACCESS_DENIED_MESSAGE, code: 'SCRIPT_LLM_ACCESS_DENIED' }
  }

  const enabledFeatures = getScriptLLMEnabledFeaturesSync()
  if (enabledFeatures !== null && !enabledFeatures.includes('script')) {
    return { allowed: false, status: 403, error: '当前未开放话术生成功能，请联系管理员在「权限配置」中勾选「话术生成」。', code: 'SCRIPT_LLM_FEATURE_DISABLED' }
  }

  return { allowed: true }
}

/**
 * U1: 内存级 per-user Rate Limiter（无需外部依赖）
 * 管理员豁免；普通用户 WINDOW_MS 内最多 MAX_CALLS 次。
 * 每个 Map 条目在窗口结束后自动清理，不会持续增长。
 */
const RATE_WINDOW_MS = Number(process.env.SCRIPT_RATE_WINDOW_MS) || 60_000 // 默认 1 分钟
const RATE_MAX_CALLS = Number(process.env.SCRIPT_RATE_MAX_CALLS) || 10    // 默认 10 次

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkScriptRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  let entry = rateLimitMap.get(userId)
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS }
    rateLimitMap.set(userId, entry)
  }
  entry.count++
  if (entry.count > RATE_MAX_CALLS) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { ok: true }
}

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

function pickFirstNonEmptyString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (v == null) continue
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return undefined
}

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
    coreFeatures,
    secondaryFeatures,
    targetAudience,
    isBundle,
    bundleName,
    bundleTotalPrice,
    bundleFeatures,
    bundleItems,
    scriptType: rawScriptType,
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
    afterSalesInfo,
    competitorLink: rawCompetitorLink,
    price_level: rawPriceLevel,
    priceLevel: rawPriceLevelAlt,
    product_role: rawProductRole,
    productRole: rawProductRoleAlt,
  } = body

  const b = body
  const rawProductNameEff = pickFirstNonEmptyString(rawProductName, b.product_name)
  const rawProductSkuEff = pickFirstNonEmptyString(rawProductSku, b.sku_info)
  const targetAudienceEff = pickFirstNonEmptyString(targetAudience, b.target_audience)
  const rawScriptTypeEff = pickFirstNonEmptyString(rawScriptType, b.script_type, b.scriptType) || 'full-sales'
  const isComboFromBody = b.is_combo === true || b.is_combo === 'true'
  const isBundleBool =
    isBundle === true || isBundle === 'true' || isComboFromBody || b.isBundle === true || b.isBundle === 'true'
  const bundleNameEff = pickFirstNonEmptyString(bundleName, b.bundle_name)
  const bundleTotalEff = pickFirstNonEmptyString(bundleTotalPrice, b.combo_total_price)
  const comboOriginalEff = pickFirstNonEmptyString(b.combo_original_price)
  const comboDiscountEff = pickFirstNonEmptyString(b.combo_discount_amount)
  const itemsSource = Array.isArray(bundleItems) ? bundleItems : Array.isArray(b.products) ? b.products : []
  // 支持 Coze 风格 script_type（下划线）映射到系统内部类型（短横线）
  const scriptTypeStr = String(rawScriptTypeEff)
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

  const hasProductName = Boolean(rawProductNameEff)
  const explicitScriptType = [
    'full-sales',
    'full_process',
    'segment-audience',
    'segment-product',
    'segment-concerns',
    'segment-benefits',
    'segment-after-sales',
    'segment-closing',
    'framework-weak-product',
    'framework-strong-product',
    'segment_audience',
    'segment_product',
    'segment_concerns',
    'segment_benefits',
    'segment_after_sales',
    'segment_closing',
  ].includes(scriptType as string)
  const bundleNameStr = bundleNameEff ?? ''
  const effectiveProduct = hasProductName
    ? rawProductNameEff!
    : isBundleBool && bundleNameStr
      ? bundleNameStr
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
    targetAudienceEff ||
    (typeof audienceFromStore === 'string' && audienceFromStore.trim() ? audienceFromStore.trim() : undefined)
  const productSku = rawProductSkuEff
  const customRequirements =
    (rawCustomReq != null && typeof rawCustomReq === 'string' && String(rawCustomReq).trim() ? String(rawCustomReq).trim() : undefined) ||
    (rawCustomReq2 != null && typeof rawCustomReq2 === 'string' && String(rawCustomReq2).trim() ? String(rawCustomReq2).trim() : undefined)

  // 单品：核心/次要卖点 -> 合并为 features，保证不改动后续 research 与提示词字段名
  const coreStr = typeof coreFeatures === 'string' ? coreFeatures.trim() : ''
  const secondaryStr = typeof secondaryFeatures === 'string' ? secondaryFeatures.trim() : ''
  const featuresStr = typeof features === 'string' ? String(features).trim() : ''
  const combinedFeatures =
    [coreStr ? `核心卖点：${coreStr}` : '', secondaryStr ? `次要卖点：${secondaryStr}` : '', featuresStr]
      .filter(Boolean)
      .join('\n')
      .trim()

  const bundleTotalPriceStr = bundleTotalEff ?? ''
  const bundleFeaturesLines =
    isBundleBool && Array.isArray(bundleFeatures)
      ? (bundleFeatures as unknown[]).filter((x) => typeof x === 'string').map((x) => String(x).trim()).filter(Boolean).slice(0, 50)
      : []
  const bundleFeaturesNarrative =
    bundleFeaturesLines.length > 0 ? bundleFeaturesLines.join('\n').slice(0, SCRIPT_FEATURES_MAX_CHARS) : undefined
  const cleanedItems: Array<{ name: string; price?: string; sku?: string; features?: string; quantity?: number; role?: 'core' | 'tool' }> = []
  for (const it of itemsSource.slice(0, 30)) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) continue
    const role =
      o.is_main === true || o.is_main === 'true'
        ? 'core'
        : typeof o.role === 'string' && o.role === 'core'
          ? 'core'
          : 'tool'
    const itemPrice = typeof o.price === 'string' && o.price.trim() ? o.price.trim() : undefined
    const sku = typeof o.sku === 'string' && o.sku.trim() ? o.sku.trim() : undefined
    const itemFeatures = typeof o.features === 'string' && o.features.trim() ? o.features.trim() : undefined
    const quantity = typeof o.quantity === 'number' && Number.isFinite(o.quantity) && o.quantity > 0 ? Math.floor(o.quantity) : undefined
    cleanedItems.push({ name, role, price: itemPrice, sku, features: itemFeatures, quantity })
  }
  const comboProductsPayload = cleanedItems.map((x, idx) => ({
    id: idx + 1,
    name: x.name,
    price: x.price ?? '',
    is_main: x.role === 'core',
    features: x.features ?? '',
    ...(x.sku ? { sku: x.sku } : {}),
    ...(x.quantity != null && x.quantity > 1 ? { quantity: x.quantity } : {}),
  }))
  const comboProductsJson = isBundleBool ? JSON.stringify(comboProductsPayload) : undefined
  // 仅合并用户显式传入的 custom_requirements；组套/单品范式已由 buildScriptToolCallMessage 的括号字段表达，避免与 【is_combo】【products】等重复灌进 custom_requirements
  const customRequirementsMerged =
    customRequirements && String(customRequirements).trim() ? String(customRequirements).trim() : undefined
  const afterSalesTrimmed =
    typeof afterSalesInfo === 'string' && afterSalesInfo.trim() ? afterSalesInfo.trim() : undefined
  const competitorLinkMerged = pickFirstNonEmptyString(
    rawCompetitorLink,
    b.competitor_link,
    b.competitor_urls,
    b.competitor_reference
  )
  const competitorLinkTrimmed = competitorLinkMerged
    ? competitorLinkMerged.slice(0, SCRIPT_FEATURES_MAX_CHARS)
    : undefined
  // price_level / product_role：用于弱塑品/强塑品话术模式区分
  const validPriceLevels = ['低', '中', '高'] as const
  const validProductRoles = ['引流款', '爆单款', '利润款', '战略款', '普通款'] as const
  const priceLevelRaw = pickFirstNonEmptyString(rawPriceLevel as string | undefined, rawPriceLevelAlt as string | undefined, b.price_level as string | undefined)
  const productRoleRaw = pickFirstNonEmptyString(rawProductRole as string | undefined, rawProductRoleAlt as string | undefined, b.product_role as string | undefined)
  const priceLevel = priceLevelRaw && (validPriceLevels as readonly string[]).includes(priceLevelRaw) ? priceLevelRaw as '低' | '中' | '高' : undefined
  const productRole = productRoleRaw && (validProductRoles as readonly string[]).includes(productRoleRaw) ? productRoleRaw as '引流款' | '爆单款' | '利润款' | '战略款' | '普通款' : undefined
  const userInput = {
    productName: effectiveProduct || '主推商品',
    productSku,
    price: isBundleBool ? undefined : price != null ? String(price).trim() : undefined,
    features: isBundleBool
      ? undefined
      : (combinedFeatures
          ? combinedFeatures.slice(0, SCRIPT_FEATURES_MAX_CHARS)
          : (features != null ? String(features).trim().slice(0, SCRIPT_FEATURES_MAX_CHARS) : '')
        ) || undefined,
    targetAudience: targetAudienceStr,
    scriptType: (explicitScriptType ? scriptType : 'full-sales') as ScriptType,
    language: ['zh-CN', 'en-US', 'th-TH', 'id-ID'].includes(language as string)
      ? (language as 'zh-CN' | 'en-US' | 'th-TH' | 'id-ID')
      : 'zh-CN',
    promoCopy: promotionInfo != null && String(promotionInfo).trim() ? String(promotionInfo).trim() : undefined,
    topic: topic as string | undefined,
    duration: duration as number | undefined,
    style: style as string | undefined,
    customRequirements: customRequirementsMerged,
    afterSalesInfo: afterSalesTrimmed,
    isCombo: isBundleBool,
    comboTotalPrice: isBundleBool ? bundleTotalPriceStr || undefined : undefined,
    comboOriginalPrice: isBundleBool ? comboOriginalEff : undefined,
    comboDiscountAmount: isBundleBool ? comboDiscountEff : undefined,
    comboProductsJson,
    bundleFeaturesNarrative: isBundleBool ? bundleFeaturesNarrative : undefined,
    competitorLink: competitorLinkTrimmed,
    priceLevel,
    productRole,
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

  if (scriptType === 'framework-weak-product') {
    return `【弱塑品强营销 · 快节奏循环话术】

❗痛点闪击（15s）
家人们，用了${p}之后最大的感受是——${f}。这个问题你是不是也有？

✅ 核心卖点（30-45s）
这款${p}${skuHint}解决的就是这一件事：${f}。别的不多说，就这一点，你用过就知道。

💰 利益点（15s）
今天直播间专属价${price ? price : '限时特价'}${promoCopy ? `，${promoCopy}` : ''}，划算拿走。

🛒 下单CTA（15s）
喜欢的家人直接点下方小黄车，选好就拍，手慢无！

（循环播出，每轮约2分钟）`
  }

  if (scriptType === 'framework-strong-product') {
    return `【强塑品理性说服 · 完整流程话术】

【圈人群共鸣 60s】
家人们，尤其是平时${t}的朋友——你们是不是有过这样的经历：用了好多同类产品，效果总是不稳定，花了钱还解决不了问题？今天这款${p}就是专门为你们准备的。

【深度塑品 Before/After 90-120s】
Before：${f}这类问题，以前大家只能将就。
After：这款${p}${skuHint}，让你明显感受到——${f}。背后的核心是这几个关键点，一个个给你讲明白。

【算账法说服 60s】
算一笔账：${price ? `到手价${price}` : '今天专属价'}，折算下来每次使用成本极低，比同类竞品还划算，而且效果差距显著。

【顾虑打消 60s】
最常见的顾虑我先答：适合哪些人？会不会踩坑？不满意怎么办？一个个说清楚。

【售后背书 30s】
收到不满意支持退换，运费我们承担，售后有保障，下单完全放心。

【理性逼单 60s】
家人们，今天这个价格窗口有限${promoCopy ? `，${promoCopy}` : ''}。理性判断一下：你需要解决的问题，这款的方案够不够好？够好就现在下单，别让价格窗口关了再后悔。`
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
      const enabledFeatures = await getScriptLLMEnabledFeatures()
      res.json({ configured, allowedUserIds: allowedUserIds ?? null, enabledFeatures: enabledFeatures ?? null })
    } else {
      // 非管理员：从 DB 直接读，与 generate-tasks 一致，避免多实例下缓存不同步导致「配置了仍 403」
      const allowed = await getScriptLLMAllowedUserIds()
      const enabledFeatures = await getScriptLLMEnabledFeatures()
      const hasAccess = allowed === null || (Array.isArray(allowed) && req.user && allowed.includes(req.user.userId))
      const tasksEnabled = enabledFeatures === null || enabledFeatures.includes('tasks')
      res.json({ configured, hasAccess, hasAccessForTasks: hasAccess && tasksEnabled })
    }
  } catch (e) {
    res.status(500).json({ error: '查询失败' })
  }
})

/** GET /api/ai/script/permission-check?userId=xxx 管理员诊断：指定用户能否使用智能生成待办（从 DB 读配置，便于排查「配置了仍 403」） */
router.get('/permission-check', requireAdmin, async (req: AuthRequest, res: express.Response) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : req.user?.userId
    if (!userId) {
      return res.status(400).json({ error: '请提供 query 参数 userId（要检查的用户 ID），或使用当前登录用户' })
    }
    const allowed = await getScriptLLMAllowedUserIds()
    const enabledFeatures = await getScriptLLMEnabledFeatures()
    const userInList = allowed === null || allowed.includes(userId)
    const tasksEnabled = enabledFeatures === null || enabledFeatures.includes('tasks')
    const canGenerateTasks = userInList && tasksEnabled
    res.json({
      userId,
      allowedFromDB: allowed === null ? 'all' : allowed,
      allowedCount: allowed === null ? null : allowed.length,
      enabledFeatures: enabledFeatures ?? null,
      userInList,
      tasksEnabled,
      canGenerateTasks,
      message: canGenerateTasks
        ? '该用户可正常使用智能生成待办'
        : !userInList
          ? '该用户不在「可使用 LLM 的用户」列表中，请在权限配置中勾选并保存'
          : !tasksEnabled
            ? '「智能生成待办」功能未勾选，请在权限配置中勾选并保存'
            : '未知原因',
    })
  } catch (e) {
    console.error('[permission-check]', e)
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

/** POST /api/ai/script/config/permissions 仅保存权限（允许用户、已启用功能），不要求 API 地址/密钥。用于管理员只改权限时保存 */
router.post('/config/permissions', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { allowedUserIds: rawAllowed, enabledFeatures: rawFeatures } = req.body ?? {}
    const allowedUserIds = rawAllowed === undefined ? undefined : Array.isArray(rawAllowed) ? rawAllowed.map((id: unknown) => String(id).trim()).filter(Boolean) : null
    const enabledFeatures = rawFeatures === undefined ? undefined : (Array.isArray(rawFeatures) ? rawFeatures.map((id: unknown) => String(id).trim()).filter(Boolean) : null)
    await setScriptLLMPermissionsOnlyInDB(allowedUserIds, enabledFeatures)
    await loadScriptLLMConfigCache()
    res.json({ success: true, message: '权限已保存' })
  } catch (e) {
    console.error('保存权限失败:', e)
    res.status(500).json({ error: '保存失败' })
  }
})

router.post('/config', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { url, apiKey, model, allowedUserIds: rawAllowed, enabledFeatures: rawFeatures } = req.body ?? {}
    const u = typeof url === 'string' ? url.trim() : ''
    const k = typeof apiKey === 'string' ? apiKey.trim() : ''
    const m = typeof model === 'string' ? model.trim() : undefined
    const allowedUserIds = Array.isArray(rawAllowed) ? rawAllowed.map((id: unknown) => String(id).trim()).filter(Boolean) : undefined
    const enabledFeatures = Array.isArray(rawFeatures) ? rawFeatures.map((id: unknown) => String(id).trim()).filter(Boolean) : undefined
    if (!u || !k) {
      return res.status(400).json({ error: '请填写 API 地址与 API 密钥' })
    }
    await setScriptLLMConfigInDB(u, k, m, allowedUserIds, enabledFeatures)
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
    // C1: 统一权限检查
    if (isScriptLLMConfigured()) {
      const access = checkScriptAccess(authReq)
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error, code: access.code })
      }
    }
    // U1: per-user 频率限制（管理员豁免）
    const isAdmin = authReq.user?.role === 'admin' || authReq.user?.role === 'manager'
    if (!isAdmin && authReq.user?.userId) {
      const rl = checkScriptRateLimit(authReq.user.userId)
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec))
        return res.status(429).json({ error: `请求过于频繁，请 ${rl.retryAfterSec} 秒后重试。`, code: 'SCRIPT_RATE_LIMITED' })
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
    if (!llmConfig) llmConfig = await getLLMConfigForFeature('script')
    const configured = Boolean(llmConfig)
    // C1: 统一权限检查（与同步路由一致）
    if (configured) {
      const access = checkScriptAccess(authReq)
      if (!access.allowed) {
        res.status(access.status).json({ error: access.error, code: access.code })
        return
      }
    }
    // U1: per-user 频率限制（管理员豁免）
    const isAdmin = authReq.user?.role === 'admin' || authReq.user?.role === 'manager'
    if (!isAdmin && authReq.user?.userId) {
      const rl = checkScriptRateLimit(authReq.user.userId)
      if (!rl.ok) {
        res.set('Retry-After', String(rl.retryAfterSec))
        res.status(429).json({ error: `请求过于频繁，请 ${rl.retryAfterSec} 秒后重试。`, code: 'SCRIPT_RATE_LIMITED' })
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
