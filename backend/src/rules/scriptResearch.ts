/**
 * 话术市调层：先市调再交互 LLM，最后综合产出
 * 整合：用户提供的信息 + 店铺数据 + 平台合规 + 品类最佳实践
 * 输出：结构化市调结果，供 LLM 提示词与综合产出使用
 *
 * 各话术类型对应的提示词与规则文档见：docs/话术生成规则/
 * - 人群互动话术.md / 场景化塑品话术.md / 促销活动话术.md / 逼单技巧话术.md / 完整销售流程话术.md
 */

import { getPlatformCompliance } from './platformCompliance'
import { analyzeTargetAudience } from './scriptAudienceAnalysis'
import { loadCategoryPractices } from './loadScriptRulesConfig'
import { SCRIPT_TYPE_META, type ScriptType } from './scriptGeneration'
import type { AnalyzedAudience } from './scriptAudienceAnalysis'
import type { PlatformComplianceRule } from './platformCompliance'

export interface ScriptUserInput {
  productName: string
  /** 产品 SKU（可选），用于话术中对规格/款式的明确引用 */
  productSku?: string
  price?: string
  features?: string
  targetAudience?: string
  scriptType: ScriptType
  language: string
  promoCopy?: string
  topic?: string
  duration?: number
  style?: string
  /** 与 Coze 入参 custom_requirements 对齐；优先于 topic+style */
  customRequirements?: string
}

export interface StoreContext {
  storeName?: string
  platform?: string
  region?: string
  categories?: string[]
  targetAudience?: string
  minPrice?: number | null
  maxPrice?: number | null
  brandPositioning?: string
  brandStrategy?: string
  latestStats?: {
    totalGMV?: number
    totalViewers?: number
    totalOrders?: number
    totalDuration?: number
  }
}

export interface ScriptResearchResult {
  userInput: ScriptUserInput
  storeContext: StoreContext
  analyzedAudience: AnalyzedAudience
  platformRule: PlatformComplianceRule
  categoryPractices: string
  summaryForLLM: string
  dataHint: string
}

const BUILTIN_CATEGORY_PRACTICES: Record<string, string> = {
  '美妆个护':
    '美妆话术：强调成分与备案、使用场景与体验，避免医疗化表述；前30秒可突出「很多用户反馈」而非「绝对有效」；互动可引导「适合什么肤质」而非「包治」。',
  '面部护肤':
    '护肤话术：建立场景（熬夜、换季、敏感），再给解决方案；卖点需与详情页/备案一致；慎用「美白」「祛斑」等词，可改为「提亮」「均匀肤色」等。',
  彩妆: '彩妆话术：强调显色度、持妆、适用场合；可对比上妆前后，避免「最好」「第一」；互动可问「你们平时用什么色号」。',
  食品健康: '食品话术：强调口味、配料、食用场景；禁止治病、疗效表述；可强调「0添加」「短保新鲜」等有据可查的卖点。',
  休闲零食: '零食话术：突出口味与性价比，场景化（办公室、追剧、出游）；避免「减肥」「保健」等无依据表述。',
  母婴: '母婴话术：安全与资质优先；禁止替代母乳、治病等表述；可强调检测报告、品牌背书、用户口碑。',
  童装: '童装话术：面料、舒适度、款式场景；避免成人化或绝对化用语。',
  家居家电: '家电话术：功能参数需真实，可对比同价位竞品；强调售后与质保；避免「最好」「第一」。',
  '3C数码': '数码话术：参数与体验结合，可做简短演示；价格对比需真实；避免「全网最低」等无依据说法。',
  服饰鞋包: '服饰话术：面料、版型、穿搭场景；尺码与试穿建议；避免「最好」「必买」等绝对化。',
  宠物: '宠物话术：安全与材质（如食品级、无毒）；使用场景（喂食、清洁、健康）；避免人用医疗化表述。',
  珠宝: '珠宝话术：材质、工艺、证书；避免「保值」「升值」等投资承诺；可强调设计、场合。',
  default:
    '通用话术：从用户需求出发（美好生活 or 现实不满）；卖点需可验证；价格与活动需真实；互动自然，避免模板化诱导。',
}

function getCategoryPracticesMap(): Record<string, string> {
  const loaded = loadCategoryPractices()
  if (loaded && Object.keys(loaded).length > 0) return loaded
  return BUILTIN_CATEGORY_PRACTICES
}

function getCategoryPractices(categories: string[]): string {
  const map = getCategoryPracticesMap()
  for (const c of categories) {
    if (map[c]) return map[c]
    for (const key of Object.keys(map)) {
      if (key !== 'default' && c.includes(key)) return map[key]
    }
  }
  return map['default'] ?? BUILTIN_CATEGORY_PRACTICES['default']
}

/**
 * 市调：整合用户输入 + 店铺数据 + 平台合规 + 品类实践，产出结构化上下文
 * 由路由层调用，传入已拉取的 storeContext，规则层不直接访问 DB
 */
export function runScriptResearch(
  userInput: ScriptUserInput,
  storeContext: StoreContext
): ScriptResearchResult {
  const platform = storeContext.platform || '直播'
  const firstCategory = storeContext.categories?.[0] || ''
  const platformRule = getPlatformCompliance(platform, firstCategory)
  const categoryPractices = getCategoryPractices(storeContext.categories || [])

  const analyzedAudience = analyzeTargetAudience(userInput.targetAudience, {
    productName: userInput.productName,
    features: userInput.features,
  })

  const dataParts: string[] = []
  if (storeContext.storeName) dataParts.push(`店铺：${storeContext.storeName}`)
  if (platform) dataParts.push(`平台：${platform}`)
  if (storeContext.categories?.length) {
    dataParts.push(`品类：${storeContext.categories.slice(0, 3).join('、')}`)
  }
  if (storeContext.latestStats) {
    const s = storeContext.latestStats
    if (s.totalGMV != null) dataParts.push(`近期GMV约${Math.round(Number(s.totalGMV)).toLocaleString()}元`)
    if (s.totalViewers != null) dataParts.push(`观看约${Math.round(Number(s.totalViewers)).toLocaleString()}人次`)
    if (s.totalOrders != null && s.totalViewers != null && Number(s.totalViewers) > 0) {
      const rate = ((Number(s.totalOrders) / Number(s.totalViewers)) * 100).toFixed(1)
      dataParts.push(`转化率约${rate}%`)
    }
  }
  const dataHint = dataParts.length > 0 ? `数据:${dataParts.join('；')}` : ''

  const summaryForLLM = buildSummaryForLLM(
    userInput,
    storeContext,
    analyzedAudience,
    platformRule,
    categoryPractices,
    dataHint
  )

  return {
    userInput,
    storeContext,
    analyzedAudience,
    platformRule,
    categoryPractices,
    summaryForLLM,
    dataHint,
  }
}

function buildSummaryForLLM(
  userInput: ScriptUserInput,
  storeContext: StoreContext,
  analyzedAudience: AnalyzedAudience,
  platformRule: PlatformComplianceRule,
  categoryPractices: string,
  dataHint: string
): string {
  const parts: string[] = []

  parts.push('[输入]')
  parts.push(`产品:${userInput.productName}`)
  if (userInput.productSku) parts.push(`SKU:${userInput.productSku}`)
  if (userInput.price) parts.push(`价:${userInput.price}`)
  if (userInput.features) parts.push(`卖点:${userInput.features}`)
  if (userInput.targetAudience) parts.push(`人群:${userInput.targetAudience}`)
  parts.push(`称呼:${analyzedAudience.addressTerm} 痛点:${analyzedAudience.painPointsHint}`)
  parts.push(`类型:${userInput.scriptType} 语种:${userInput.language}`)
  if (userInput.duration) parts.push(`时长:约${userInput.duration}分钟`)

  parts.push('')
  parts.push('[店铺]')
  if (storeContext.storeName) parts.push(storeContext.storeName)
  if (storeContext.platform) parts.push(storeContext.platform)
  if (storeContext.region) parts.push(storeContext.region)
  if (storeContext.categories?.length) parts.push(`品类:${storeContext.categories.slice(0, 3).join('、')}`)
  if (storeContext.minPrice != null || storeContext.maxPrice != null) {
    const lo = storeContext.minPrice != null ? String(storeContext.minPrice) : ''
    const hi = storeContext.maxPrice != null ? String(storeContext.maxPrice) : ''
    parts.push(`价格带:${lo}-${hi}`)
  }
  if (storeContext.brandPositioning) parts.push(`品牌定位:${storeContext.brandPositioning}`)
  if (storeContext.brandStrategy) parts.push(`品牌策略:${storeContext.brandStrategy.slice(0, 200)}${storeContext.brandStrategy.length > 200 ? '…' : ''}`)
  if (dataHint) parts.push(dataHint)

  parts.push('')
  parts.push('[合规]')
  parts.push(`禁:${platformRule.bannedWords.slice(0, 12).join('、')}${platformRule.bannedWords.length > 12 ? '等' : ''}`)
  parts.push(`慎:${platformRule.cautionWords.slice(0, 6).join('、')}${platformRule.cautionWords.length > 6 ? '等' : ''}`)
  parts.push(`违:${platformRule.violationTypes.slice(0, 3).join(';')}`)

  parts.push('')
  parts.push('[品类]')
  parts.push(categoryPractices)

  parts.push('')
  parts.push('[要求]')
  parts.push('依输入与店铺数据;禁词禁用慎词有据;数字泛化(库存不多/已售不少/大量好评);结构:圈人群-塑品-打消顾虑-利益点-售后-逼单;自然口语有过渡;紧扣产品与品类卖点主次分明;用场景/痛点/故事/画面带出卖点忌罗列;可标【环节】与「此处可停顿」「举起来展示」.')

  const frameworkBlock = buildCategoryFrameworkAndPolishBlock(userInput, storeContext)
  if (frameworkBlock) {
    parts.push('', '[框架]', frameworkBlock)
  }
  return parts.join('\n')
}

/** 根据店铺区域/语言推断「店铺所在国家」用于润色话术 */
function getStoreCountry(storeContext: StoreContext, language: string): string {
  const r = (storeContext.region || '').trim()
  // 优先从 region 精确匹配国家名
  if (/泰国|Thailand|กรุงเทพ|曼谷|Bangkok|th|TH/i.test(r)) return '泰国'
  if (/越南|Vietnam|河内|胡志明|Hanoi|vn|VN/i.test(r)) return '越南'
  if (/印尼|Indonesia|雅加达|Jakarta|id|ID/i.test(r)) return '印尼'
  if (/马来西亚|Malaysia|吉隆坡|Kuala Lumpur|my|MY/i.test(r)) return '马来西亚'
  if (/新加坡|Singapore|sg|SG/i.test(r)) return '新加坡'
  if (/菲律宾|Philippines|马尼拉|Manila|ph|PH/i.test(r)) return '菲律宾'
  if (/美国|USA|United States|us|US/i.test(r)) return '美国'
  if (/英国|UK|Britain|uk|GB/i.test(r)) return '英国'
  if (/中国|China|北京|上海|广州|深圳|cn|CN/i.test(r)) return '中国'
  
  // region 匹配不到时才从 language 推导（注意：英语有歧义，默认美国）
  if (language === 'th-TH') return '泰国'
  if (language === 'zh-CN') return '中国'
  if (language === 'en-US') return '美国' // 英语默认美国，但建议店铺明确填写 region
  return '当地'
}

/**
 * 构建「品类话术框架 + 润色为可念稿」的提示块（有店铺品类时注入）
 * 要求：先设计 1～6 策略模块、适配 5～15 分钟循环，再润色为主播在店铺所在国家直播间能直接念的话术稿
 */
function buildCategoryFrameworkAndPolishBlock(userInput: ScriptUserInput, storeContext: StoreContext): string | null {
  const categories = storeContext.categories?.filter(Boolean)
  if (!categories?.length) return null

  const categoryLabel = categories.slice(0, 3).join('、')
  const country = getStoreCountry(storeContext, userInput.language)
  const userParams: string[] = [userInput.productName]
  if (userInput.price) userParams.push(`价格 ${userInput.price}`)
  if (userInput.features) userParams.push(`卖点/特点 ${userInput.features}`)
  if (userInput.targetAudience) userParams.push(`目标人群 ${userInput.targetAudience}`)
  const userParamsStr = userParams.join('；')

  return `1)设计${categoryLabel}话术框架(1～6模块,5～15分钟循环)，产品:${userParamsStr} 2)润色为${country}直播间可念稿，自然可照念，符合规与品类实践。`
}

/** 根据话术类型返回提示词配置（目标、场景、要素），用于定制系统提示与用户消息 */
function getPromptConfigForScriptType(scriptType: ScriptType): {
  typeLabel: string
  goal: string
  scenario: string
  elements: string[]
} {
  const meta = SCRIPT_TYPE_META[scriptType]
  if (meta) {
    return {
      typeLabel: meta.nameCN,
      goal: meta.goal,
      scenario: meta.scenario,
      elements: [...meta.elements],
    }
  }
  return {
    typeLabel: scriptType,
    goal: '生成可念话术',
    scenario: '直播话术',
    elements: ['开场', '卖点', '行动召唤'],
  }
}

/** 
 * 从 region + language 推导国家/地区代码（供 LLM 入参）
 * 优先级：region 精确匹配 > language 推导
 * 注意：英语（en-US）有歧义（美国/菲律宾/新加坡等），优先从 region 推导
 */
function deriveCountryCode(region: string | undefined, lang: string): string {
  const r = (region || '').trim()
  // 优先从 region 精确匹配
  if (/泰国|Thailand|กรุงเทพ|曼谷|Bangkok|th|TH/i.test(r)) return 'TH'
  if (/越南|Vietnam|河内|胡志明|Hanoi|vn|VN/i.test(r)) return 'VN'
  if (/印尼|Indonesia|雅加达|Jakarta|id|ID/i.test(r)) return 'ID'
  if (/马来西亚|Malaysia|吉隆坡|Kuala Lumpur|my|MY/i.test(r)) return 'MY'
  if (/新加坡|Singapore|sg|SG/i.test(r)) return 'SG'
  if (/菲律宾|Philippines|马尼拉|Manila|ph|PH/i.test(r)) return 'PH'
  if (/美国|USA|United States|us|US/i.test(r)) return 'US'
  if (/英国|UK|Britain|uk|GB/i.test(r)) return 'GB'
  if (/中国|China|北京|上海|广州|深圳|cn|CN/i.test(r)) return 'CN'
  
  // region 匹配不到时才从 language 推导（英语默认 US，但建议前端明确传 countryCode）
  const l = (lang || '').toLowerCase()
  if (l.startsWith('zh')) return 'CN'
  if (l.startsWith('th')) return 'TH'
  if (l.startsWith('vi')) return 'VN'
  if (l.startsWith('id')) return 'ID'
  if (l.startsWith('ms') || l.startsWith('my')) return 'MY'
  if (l.startsWith('tl') || l.startsWith('ph')) return 'PH' // 菲律宾语 Tagalog
  if (l.startsWith('en')) return 'US' // 英语默认美国（歧义，建议店铺填写 region 或前端传 countryCode）
  return l.slice(0, 2).toUpperCase() || 'CN'
}

/** 
 * 从 language 推导国家/地区代码（旧函数，保留向后兼容）
 * 建议使用 deriveCountryCode(region, lang) 以避免英语等语言的歧义
 */
function languageToCountryCode(lang: string): string {
  return deriveCountryCode(undefined, lang)
}

/** 构建 LLM 系统提示词（根据用户请求的话术类型配置相应提示） */
export function buildLLMSystemPrompt(research: ScriptResearchResult): string {
  const { userInput } = research
  const config = getPromptConfigForScriptType(userInput.scriptType)
  const typeBlock = `当前生成「${config.typeLabel}」。目标：${config.goal}。场景：${config.scenario}。须包含要素：${config.elements.join('、')}。`
  const hasFramework = research.summaryForLLM.includes('[框架]')
  const frameworkRule = hasFramework
    ? '有[框架]时先出1～6模块框架(5～15分钟循环)，再润色为可念稿。'
    : ''
  const locale = userInput.language || 'zh-CN'
  const countryCode = languageToCountryCode(locale)
  return `【回复语言与地区】请使用以下语言输出话术正文：locale=${locale}，国家/地区代码（countryCode）=${countryCode}。zh-CN=简体中文，en-US=English，th-TH=ไทย。话术正文必须使用该语言。
你是直播话术策划。
${typeBlock}
通用规则:1)依摘要输入/店铺/合规/品类 2)禁词禁用慎词有据 3)语种与摘要一致 4)数字泛化 5)自然口语 6)紧扣产品与品类卖点 7)场景/痛点/故事带出卖点 ${frameworkRule}`
}

/** 构建 LLM 用户消息（根据话术类型与市调摘要配置用户侧任务描述） */
export function buildLLMUserMessage(research: ScriptResearchResult): string {
  const { userInput } = research
  const config = getPromptConfigForScriptType(userInput.scriptType)
  const locale = userInput.language || 'zh-CN'
  const countryCode = languageToCountryCode(locale)
  const taskLine = `【任务】仅生成「${config.typeLabel}」，产品：${userInput.productName}。目标：${config.goal}。请按要素（${config.elements.join('、')}）组织内容。`
  const tail = research.summaryForLLM.includes('[框架]')
    ? '请先出框架再出可念稿。'
    : '请依上生成。'
  return `【用户界面语言/地区】locale=${locale}，countryCode=${countryCode}\n\n` + taskLine + '\n\n' + research.summaryForLLM + '\n\n' + tail
}

/** 话术类型配置（Coze 风格） */
interface CozeScriptTypeConfig {
  script_type_name: string
  script_type: string
  script_type_description: string
  script_type_key_elements: string
  typical_length: string
  cta_requirement: string
  use_promotion_info: boolean
}

const COZE_SCRIPT_TYPE_MAPPING: Record<ScriptType, CozeScriptTypeConfig> = {
  'full-sales': {
    script_type_name: '完整销售流程话术',
    script_type: 'full_process',
    script_type_description: '完整的直播销售流程（圈人群、塑品、打消顾虑、利益点、售后、逼单）',
    script_type_key_elements: '1) 圈人群 2) 塑品 3) 打消顾虑 4) 利益点 5) 售后 6) 逼单',
    typical_length: '5-10分钟',
    cta_requirement: '每个环节都要有明确的引导，最后环节必须包含强力CTA',
    use_promotion_info: true,
  },
  'segment-audience': {
    script_type_name: '圈人群部分话术',
    script_type: 'segment_audience',
    script_type_description: '聚焦识别目标人群并建立痛点共鸣',
    script_type_key_elements: '1) 目标人群识别 2) 痛点共鸣 3) 场景代入 4) 承接到产品',
    typical_length: '60-90秒',
    cta_requirement: '可含轻量互动引导，重点是完成圈人群与承接',
    use_promotion_info: false,
  },
  'segment-product': {
    script_type_name: '塑品部分话术',
    script_type: 'segment_product',
    script_type_description: '聚焦产品价值塑造与卖点展开',
    script_type_key_elements: '1) 核心卖点 2) 使用场景 3) 差异化价值 4) 过渡到答疑',
    typical_length: '90-120秒',
    cta_requirement: '行动召唤可选，重点是塑造价值',
    use_promotion_info: false,
  },
  'segment-concerns': {
    script_type_name: '打消顾虑部分话术',
    script_type: 'segment_concerns',
    script_type_description: '聚焦回答疑虑并降低决策阻力',
    script_type_key_elements: '1) 高频疑问 2) 风险消除 3) 信任背书 4) 过渡到利益点',
    typical_length: '60-90秒',
    cta_requirement: '可含轻量引导，重点是答疑解虑',
    use_promotion_info: false,
  },
  'segment-benefits': {
    script_type_name: '利益点部分话术',
    script_type: 'segment_benefits',
    script_type_description: '聚焦价格价值与福利展示',
    script_type_key_elements: '1) 价格价值 2) 促销福利 3) 对比感知 4) 过渡到售后',
    typical_length: '90-120秒',
    cta_requirement: '建议包含明确行动引导',
    use_promotion_info: true,
  },
  'segment-after-sales': {
    script_type_name: '售后部分话术',
    script_type: 'segment_after_sales',
    script_type_description: '聚焦售后政策与保障承诺',
    script_type_key_elements: '1) 退换政策 2) 发货时效 3) 客服支持 4) 承接逼单',
    typical_length: '60-90秒',
    cta_requirement: '以建立信任为主，CTA 可选',
    use_promotion_info: false,
  },
  'segment-closing': {
    script_type_name: '逼单部分话术',
    script_type: 'segment_closing',
    script_type_description: '聚焦紧迫感与最终成交动作',
    script_type_key_elements: '1) 限时限量 2) 最终价值 3) 强行动召唤 4) 倒计时催单',
    typical_length: '60-90秒',
    cta_requirement: '必须包含强行动召唤与紧迫感',
    use_promotion_info: true,
  },
}

/** 国家/地区代码 → 中文国家名（请求体传了 countryCode 时，提示词中的「国家」用此表，与用户选择一致） */
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  CN: '中国', TH: '泰国', VN: '越南', US: '美国', MY: '马来西亚', SG: '新加坡', ID: '印尼', PH: '菲律宾', GB: '英国',
}

/** 国家/地区代码 → 货币信息映射（供 Coze 明确货币符号与表达习惯） */
const COUNTRY_CURRENCY_MAP: Record<string, { currency: string; symbol: string; name: string; culturalNote: string }> = {
  CN: { 
    currency: 'CNY', 
    symbol: '¥', 
    name: '人民币',
    culturalNote: '使用「元」作单位，价格可用「X元X角」或「XX块」等口语化表达；强调性价比、品质、实用性'
  },
  TH: { 
    currency: 'THB', 
    symbol: '฿', 
    name: '泰铢',
    culturalNote: '使用「บาท」（泰铢）作单位，价格用「X บาท」表达；泰国文化重视礼貌、微笑、sanuk（快乐）氛围'
  },
  VN: { 
    currency: 'VND', 
    symbol: '₫', 
    name: '越南盾',
    culturalNote: '使用「đồng」作单位，价格通常为大数字（如 299,000₫）；越南文化重视家庭、实用、性价比'
  },
  US: { 
    currency: 'USD', 
    symbol: '$', 
    name: '美元',
    culturalNote: '使用「dollar」或「buck」，价格用「$X.XX」表达；美国文化偏好直接、热情、高效的销售风格'
  },
  MY: { 
    currency: 'MYR', 
    symbol: 'RM', 
    name: '马来西亚令吉',
    culturalNote: '使用「ringgit」，价格用「RM X」表达；马来西亚多元文化，需兼顾不同族群习惯'
  },
  SG: { 
    currency: 'SGD', 
    symbol: 'S$', 
    name: '新加坡元',
    culturalNote: '使用「Singapore dollar」，价格用「S$X」表达；新加坡文化重视效率、品质、实用'
  },
  ID: { 
    currency: 'IDR', 
    symbol: 'Rp', 
    name: '印尼盾',
    culturalNote: '使用「rupiah」，价格通常为大数字（如 Rp 299,000）；印尼文化重视礼貌、尊重、社区'
  },
  PH: { 
    currency: 'PHP', 
    symbol: '₱', 
    name: '菲律宾比索',
    culturalNote: '使用「piso」，价格用「₱X」表达；菲律宾文化热情、友好、重视家庭'
  },
}

/**
 * 方案1：仅构建单条消息，不维护长提示词。
 * 供 Coze Agent 模式使用：直接请求生成话术，入参为 userInput + storeContext；Bot 在回复中直接输出话术即可。
 * @param explicitCountryCode 前端明确传入的国家代码（优先级最高）
 */
export function buildScriptToolCallMessage(
  userInput: ScriptUserInput,
  storeContext: StoreContext,
  promotionInfo?: string,
  explicitCountryCode?: string
): string {
  const countryCode = explicitCountryCode || deriveCountryCode(storeContext.region, userInput.language)
  const countryName =
    (explicitCountryCode && COUNTRY_CODE_TO_NAME[explicitCountryCode])
      ? COUNTRY_CODE_TO_NAME[explicitCountryCode]
      : getStoreCountry(storeContext, userInput.language)
  const scriptTypeConfig = COZE_SCRIPT_TYPE_MAPPING[userInput.scriptType] || COZE_SCRIPT_TYPE_MAPPING['full-sales']
  const parts: string[] = [
    `请根据以下信息生成一款${userInput.productName}的${scriptTypeConfig.script_type_name}。`,
    `产品名称：${userInput.productName}`,
    `国家：${countryName}`,
    `话术类型：${scriptTypeConfig.script_type}`,
    '输出语言：仅中文',
  ]
  if (userInput.price) parts.push(`价格：${userInput.price}`)
  if (userInput.features) parts.push(`产品特点：${userInput.features}`)
  if (userInput.targetAudience) parts.push(`目标人群：${userInput.targetAudience}`)
  if (promotionInfo && scriptTypeConfig.use_promotion_info) parts.push(`促销活动：${promotionInfo}`)
  if (userInput.productSku) parts.push(`SKU信息：${userInput.productSku}`)
  return parts.join('，')
}

/**
 * 构建 Coze 风格的话术生成提示词（system + user）
 * 与项目现有 LLM 完全解耦，专用于 Coze 智能体或其他需要此格式的 LLM
 * @param explicitCountryCode 前端明确传入的国家代码（优先级最高），解决英语等多国语言歧义
 */
export function buildCozeScriptPrompts(
  research: ScriptResearchResult, 
  promotionInfo?: string,
  explicitCountryCode?: string
): {
  systemPrompt: string
  userPrompt: string
} {
  const { userInput, storeContext } = research
  const languageNameMap: Record<string, string> = {
    'th-TH': '泰语',
    'zh-CN': '中文',
    'en-US': '英语',
  }
  const languageName = languageNameMap[userInput.language] || userInput.language
  
  // 国家代码推导优先级：前端明确传入 > store.region 精确匹配 > language 推导
  const countryCode = explicitCountryCode || deriveCountryCode(storeContext.region, userInput.language)
  const currencyInfo = COUNTRY_CURRENCY_MAP[countryCode] || COUNTRY_CURRENCY_MAP['CN']
  // 请求体传了国家/代码时，提示词中的国家名与用户选择一致；否则从店铺/语言推导
  const countryName =
    (explicitCountryCode && COUNTRY_CODE_TO_NAME[explicitCountryCode])
      ? COUNTRY_CODE_TO_NAME[explicitCountryCode]
      : getStoreCountry(storeContext, userInput.language)

  // 仅保留与用户入参相关的信息，不注入环节/格式/输出要求等规则，由 Coze 内置逻辑生成
  const systemPrompt = '你是TikTok直播电商话术专家。'

  // User Prompt: 产品信息、话术类型、要求
  const scriptTypeConfig = COZE_SCRIPT_TYPE_MAPPING[userInput.scriptType] || COZE_SCRIPT_TYPE_MAPPING['full-sales']
  
  // 与话术入参约定对齐：product_name, price, features, target_audience, sku_info
  const productSection = `## 产品信息（入参）
- 产品名称（product_name）：${userInput.productName}
${userInput.productSku ? `- SKU信息（sku_info）：${userInput.productSku}\n  （格式参考：S码(尺寸,适用场景);M码(...)）` : ''}
${userInput.price ? `- 价格（price）：${userInput.price}` : ''}
${userInput.features ? `- 产品特点（features）：${userInput.features}` : ''}
${userInput.targetAudience ? `- 目标人群（target_audience）：${userInput.targetAudience}` : ''}`

  const countrySection = `## 国家/地区（country 必填）
- 国家（country）：${countryName}
- 国家代码：${countryCode}
- 货币：${currencyInfo.name} (${currencyInfo.currency})
- 货币符号：${currencyInfo.symbol}
- 文化表达：${currencyInfo.culturalNote}`

  const promotionSection = promotionInfo && scriptTypeConfig.use_promotion_info
    ? `

## 促销活动（promotion_info）
${promotionInfo}`
    : ''

  // 与 Coze 入参 custom_requirements 对齐：优先使用 customRequirements，否则由 topic、style 合并
  let customRequirementsSection = ''
  if (userInput.customRequirements && String(userInput.customRequirements).trim()) {
    customRequirementsSection = `

## 自定义要求（custom_requirements）
${String(userInput.customRequirements).trim()}`
  } else {
    const customParts: string[] = []
    if (userInput.topic && String(userInput.topic).trim()) customParts.push(String(userInput.topic).trim())
    if (userInput.style && String(userInput.style).trim()) customParts.push(`风格：${userInput.style.trim()}`)
    if (customParts.length > 0) {
      customRequirementsSection = `

## 自定义要求（custom_requirements）
${customParts.join('\n')}`
    }
  }

  const storeSection = research.dataHint 
    ? `

## 店铺数据参考
${research.dataHint}
${research.storeContext.storeName ? `店铺：${research.storeContext.storeName}` : ''}`
    : ''

  // 首句为请求摘要，请直接在回复中输出话术（与《Coze对接说明》一致）
  const requestSummaryParts = [
    `请根据以下信息生成一款${userInput.productName}的${scriptTypeConfig.script_type_name}。`,
    `产品名称：${userInput.productName}`,
    `国家：${countryName}`,
    `话术类型：${scriptTypeConfig.script_type}`,
  ]
  if (userInput.price) requestSummaryParts.push(`价格：${userInput.price}`)
  if (userInput.features) requestSummaryParts.push(`产品特点：${userInput.features}`)
  if (userInput.targetAudience) requestSummaryParts.push(`目标人群：${userInput.targetAudience}`)
  if (promotionInfo && scriptTypeConfig.use_promotion_info) requestSummaryParts.push(`促销活动：${promotionInfo}`)
  if (userInput.productSku) requestSummaryParts.push(`SKU信息：${userInput.productSku}`)
  const requestSummaryLine = requestSummaryParts.join('，')

  const userPrompt = `${requestSummaryLine}

---

请为以下产品生成{{script_type_name}}类型的直播话术。仅输出纯中文话术（由终端系统负责翻译为目标语言）。

${productSection}

${countrySection}
${promotionSection}
${customRequirementsSection}
${storeSection}

## 话术类型（script_type）
{{script_type}}
{{script_type_description}}

请生成话术：`

  // 仅替换与用户选择话术类型相关的占位符，不注入格式/长度/CTA 等规则
  const userPromptFilled = userPrompt
    .replace(/\{\{script_type_name\}\}/g, scriptTypeConfig.script_type_name)
    .replace(/\{\{script_type\}\}/g, scriptTypeConfig.script_type)
    .replace(/\{\{script_type_description\}\}/g, scriptTypeConfig.script_type_description)

  return {
    systemPrompt,
    userPrompt: userPromptFilled,
  }
}
