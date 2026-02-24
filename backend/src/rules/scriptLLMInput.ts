/**
 * LLM/Coze 入参构建（主链路）
 * 仅负责构建发送给 LLM 的参数文本，不参与模板兜底。
 */

import type { ScriptType } from './scriptGeneration'
import type { ScriptResearchResult, ScriptUserInput, StoreContext } from './scriptResearch'

interface CozeScriptTypeConfig {
  script_type_name: string
  script_type: string
  script_type_description: string
  use_promotion_info: boolean
  segmentHint?: string
}

const COZE_SCRIPT_TYPE_MAPPING: Record<ScriptType, CozeScriptTypeConfig> = {
  'full-sales': {
    script_type_name: '完整销售流程话术',
    script_type: 'full_process',
    script_type_description: '完整的直播销售流程（圈人群、塑品、打消顾虑、利益点、售后、逼单）',
    use_promotion_info: true,
  },
  'segment-audience': {
    script_type_name: '圈人群部分话术',
    script_type: 'interaction',
    script_type_description: '聚焦识别目标人群并建立痛点共鸣',
    use_promotion_info: false,
    segmentHint: '仅输出圈人群部分',
  },
  'segment-product': {
    script_type_name: '塑品部分话术',
    script_type: 'scenario',
    script_type_description: '聚焦产品价值塑造与卖点展开',
    use_promotion_info: false,
    segmentHint: '仅输出塑品部分',
  },
  'segment-concerns': {
    script_type_name: '打消顾虑部分话术',
    script_type: 'scenario',
    script_type_description: '聚焦回答疑虑并降低决策阻力',
    use_promotion_info: false,
    segmentHint: '仅输出打消顾虑部分',
  },
  'segment-benefits': {
    script_type_name: '利益点部分话术',
    script_type: 'promotion',
    script_type_description: '聚焦价格价值与福利展示',
    use_promotion_info: true,
    segmentHint: '仅输出利益点部分',
  },
  'segment-after-sales': {
    script_type_name: '售后部分话术',
    script_type: 'closing',
    script_type_description: '聚焦售后政策与保障承诺',
    use_promotion_info: false,
    segmentHint: '仅输出售后部分',
  },
  'segment-closing': {
    script_type_name: '逼单部分话术',
    script_type: 'closing',
    script_type_description: '聚焦紧迫感与最终成交动作',
    use_promotion_info: true,
    segmentHint: '仅输出逼单部分',
  },
}

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  CN: '中国', TH: '泰国', VN: '越南', US: '美国', MY: '马来西亚', SG: '新加坡', ID: '印尼', PH: '菲律宾', GB: '英国',
}

const COUNTRY_CURRENCY_MAP: Record<string, { currency: string; symbol: string; name: string; culturalNote: string }> = {
  CN: { currency: 'CNY', symbol: '¥', name: '人民币', culturalNote: '使用「元」作单位，强调性价比、品质、实用性' },
  TH: { currency: 'THB', symbol: '฿', name: '泰铢', culturalNote: '使用「บาท」作单位，泰国文化重视礼貌与轻松氛围' },
  VN: { currency: 'VND', symbol: '₫', name: '越南盾', culturalNote: '使用「đồng」作单位，越南文化重视家庭与实用性' },
  US: { currency: 'USD', symbol: '$', name: '美元', culturalNote: '使用「dollar/buck」，表达直接清晰' },
  MY: { currency: 'MYR', symbol: 'RM', name: '马来西亚令吉', culturalNote: '使用「ringgit」，兼顾多元文化表达' },
  SG: { currency: 'SGD', symbol: 'S$', name: '新加坡元', culturalNote: '使用「Singapore dollar」，强调效率与品质' },
  ID: { currency: 'IDR', symbol: 'Rp', name: '印尼盾', culturalNote: '使用「rupiah」，重视礼貌和社区感' },
  PH: { currency: 'PHP', symbol: '₱', name: '菲律宾比索', culturalNote: '使用「piso」，表达热情友好' },
}

function getStoreCountry(storeContext: StoreContext, language: string): string {
  const r = (storeContext.region || '').trim()
  if (/泰国|Thailand|กรุงเทพ|曼谷|Bangkok|th|TH/i.test(r)) return '泰国'
  if (/越南|Vietnam|河内|胡志明|Hanoi|vn|VN/i.test(r)) return '越南'
  if (/印尼|Indonesia|雅加达|Jakarta|id|ID/i.test(r)) return '印尼'
  if (/马来西亚|Malaysia|吉隆坡|Kuala Lumpur|my|MY/i.test(r)) return '马来西亚'
  if (/新加坡|Singapore|sg|SG/i.test(r)) return '新加坡'
  if (/菲律宾|Philippines|马尼拉|Manila|ph|PH/i.test(r)) return '菲律宾'
  if (/美国|USA|United States|us|US/i.test(r)) return '美国'
  if (/英国|UK|Britain|uk|GB/i.test(r)) return '英国'
  if (/中国|China|北京|上海|广州|深圳|cn|CN/i.test(r)) return '中国'
  if (language === 'th-TH') return '泰国'
  if (language === 'zh-CN') return '中国'
  if (language === 'en-US') return '美国'
  return '当地'
}

function deriveCountryCode(region: string | undefined, lang: string): string {
  const r = (region || '').trim()
  if (/泰国|Thailand|กรุงเทพ|曼谷|Bangkok|th|TH/i.test(r)) return 'TH'
  if (/越南|Vietnam|河内|胡志明|Hanoi|vn|VN/i.test(r)) return 'VN'
  if (/印尼|Indonesia|雅加达|Jakarta|id|ID/i.test(r)) return 'ID'
  if (/马来西亚|Malaysia|吉隆坡|Kuala Lumpur|my|MY/i.test(r)) return 'MY'
  if (/新加坡|Singapore|sg|SG/i.test(r)) return 'SG'
  if (/菲律宾|Philippines|马尼拉|Manila|ph|PH/i.test(r)) return 'PH'
  if (/美国|USA|United States|us|US/i.test(r)) return 'US'
  if (/英国|UK|Britain|uk|GB/i.test(r)) return 'GB'
  if (/中国|China|北京|上海|广州|深圳|cn|CN/i.test(r)) return 'CN'
  const l = (lang || '').toLowerCase()
  if (l.startsWith('zh')) return 'CN'
  if (l.startsWith('th')) return 'TH'
  if (l.startsWith('vi')) return 'VN'
  if (l.startsWith('id')) return 'ID'
  if (l.startsWith('ms') || l.startsWith('my')) return 'MY'
  if (l.startsWith('tl') || l.startsWith('ph')) return 'PH'
  if (l.startsWith('en')) return 'US'
  return l.slice(0, 2).toUpperCase() || 'CN'
}

export function buildScriptToolCallMessage(
  userInput: ScriptUserInput,
  storeContext: StoreContext,
  promotionInfo?: string,
  explicitCountryCode?: string
): string {
  const countryName =
    (explicitCountryCode && COUNTRY_CODE_TO_NAME[explicitCountryCode])
      ? COUNTRY_CODE_TO_NAME[explicitCountryCode]
      : getStoreCountry(storeContext, userInput.language)
  const scriptTypeConfig = COZE_SCRIPT_TYPE_MAPPING[userInput.scriptType] || COZE_SCRIPT_TYPE_MAPPING['full-sales']
  const brackets: string[] = [
    `【product_name：${userInput.productName}】`,
    `【country：${countryName}】`,
    `【script_type：${scriptTypeConfig.script_type}】`,
  ]
  if (userInput.price) brackets.push(`【price：${String(userInput.price).replace(/[^\d.]/g, '') || userInput.price}】`)
  if (userInput.features) brackets.push(`【features：${userInput.features}】`)
  if (userInput.targetAudience) brackets.push(`【target_audience：${userInput.targetAudience}】`)
  if (promotionInfo && scriptTypeConfig.use_promotion_info) brackets.push(`【promotion_info：${promotionInfo}】`)
  if (userInput.productSku) brackets.push(`【sku_info：${userInput.productSku}】`)
  const customReqParts: string[] = []
  if (scriptTypeConfig.segmentHint) customReqParts.push(scriptTypeConfig.segmentHint)
  if (userInput.customRequirements && userInput.customRequirements.trim()) customReqParts.push(userInput.customRequirements.trim())
  if (customReqParts.length > 0) brackets.push(`【custom_requirements：${customReqParts.join('；')}】`)
  const stageRequirement = userInput.scriptType === 'full-sales'
    ? '只输出完整销售流程话术。'
    : (scriptTypeConfig.segmentHint ? `${scriptTypeConfig.segmentHint}。` : '只输出当前指定单环节话术。')
  const query = [
    '任务：直播带货话术生成（非政策分析）。',
    '请严格仅根据下列参数生成话术，勿使用店铺名称、品类或其它未列出的信息。',
    stageRequirement,
    '禁止输出图表、Mermaid、仪表盘、表格、政策对比或分析报告。',
    `请基于以下参数生成：${brackets.join('')}`,
    '输出要求：仅输出纯中文口播话术正文。',
  ].join('')
  return query
}

export function buildCozeScriptPrompts(
  research: ScriptResearchResult,
  promotionInfo?: string,
  explicitCountryCode?: string
): {
  systemPrompt: string
  userPrompt: string
} {
  const { userInput, storeContext } = research
  const countryCode = explicitCountryCode || deriveCountryCode(storeContext.region, userInput.language)
  const currencyInfo = COUNTRY_CURRENCY_MAP[countryCode] || COUNTRY_CURRENCY_MAP['CN']
  const countryName =
    (explicitCountryCode && COUNTRY_CODE_TO_NAME[explicitCountryCode])
      ? COUNTRY_CODE_TO_NAME[explicitCountryCode]
      : getStoreCountry(storeContext, userInput.language)
  const scriptTypeConfig = COZE_SCRIPT_TYPE_MAPPING[userInput.scriptType] || COZE_SCRIPT_TYPE_MAPPING['full-sales']

  const systemPrompt = '你是TikTok直播电商话术专家。'
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

  const productSection = `## 产品信息（入参）
- 产品名称（product_name）：${userInput.productName}
${userInput.productSku ? `- SKU信息（sku_info）：${userInput.productSku}` : ''}
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
    ? `\n\n## 促销活动（promotion_info）\n${promotionInfo}`
    : ''

  let customRequirementsSection = ''
  if (userInput.customRequirements && String(userInput.customRequirements).trim()) {
    customRequirementsSection = `\n\n## 自定义要求（custom_requirements）\n${String(userInput.customRequirements).trim()}`
  } else {
    const customParts: string[] = []
    if (userInput.topic && String(userInput.topic).trim()) customParts.push(String(userInput.topic).trim())
    if (userInput.style && String(userInput.style).trim()) customParts.push(`风格：${userInput.style.trim()}`)
    if (customParts.length > 0) customRequirementsSection = `\n\n## 自定义要求（custom_requirements）\n${customParts.join('\n')}`
  }

  const storeSection = research.dataHint
    ? `\n\n## 店铺数据参考\n${research.dataHint}${research.storeContext.storeName ? `\n店铺：${research.storeContext.storeName}` : ''}`
    : ''

  const userPrompt = `${requestSummaryParts.join('，')}

---

请为以下产品生成${scriptTypeConfig.script_type_name}类型的直播话术。仅输出纯中文话术（由终端系统负责翻译为目标语言）。

${productSection}

${countrySection}${promotionSection}${customRequirementsSection}${storeSection}

## 话术类型（script_type）
${scriptTypeConfig.script_type}
${scriptTypeConfig.script_type_description}

请生成话术：`

  return { systemPrompt, userPrompt }
}

