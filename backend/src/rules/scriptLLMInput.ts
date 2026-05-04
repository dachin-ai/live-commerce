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
  'framework-weak-product': {
    script_type_name: '弱塑品强营销框架话术',
    script_type: 'simple_cycle',
    script_type_description: '高频循环：一卖点一逼单，2分钟/循环，适合引流款/爆单款/低中客单价',
    use_promotion_info: true,
    segmentHint: '按「弱塑品强营销」框架输出：痛点闪击(15s)→单一卖点(30-45s)→利益点(15s)→逼单CTA(15s)→互动循环(15s)，整体2分钟可循环，节奏快、价格前置',
  },
  'framework-strong-product': {
    script_type_name: '强塑品理性说服框架话术',
    script_type: 'full_process',
    script_type_description: '深度塑品：Before/After对比+算账法+理性说服，适合利润款/高客单价',
    use_promotion_info: true,
    segmentHint: '按「强塑品理性说服」框架输出：圈人群共鸣(60s)→深度塑品Before/After(90-120s)→算账法说服(60s)→顾虑打消(60s)→售后背书(30s)→理性逼单(60s)；塑品段必须有Before/After场景对比与算账；逼单温和理性，不咆哮',
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
  /** 与 Coze 文档范式一致：单品 / 组套 使用不同括号字段 */
  const brackets: string[] = []
  if (userInput.isCombo) {
    brackets.push(`【product_name：${userInput.productName}】`)
    brackets.push(`【script_type：${scriptTypeConfig.script_type}】`)
    brackets.push(`【country：${countryName}】`)
    if (userInput.targetAudience) brackets.push(`【target_audience：${userInput.targetAudience}】`)
    brackets.push(`【is_combo：true】`)
    if (userInput.comboTotalPrice) brackets.push(`【combo_total_price：${userInput.comboTotalPrice}】`)
    if (userInput.comboOriginalPrice) brackets.push(`【combo_original_price：${userInput.comboOriginalPrice}】`)
    if (userInput.comboDiscountAmount) brackets.push(`【combo_discount_amount：${userInput.comboDiscountAmount}】`)
    if (userInput.comboProductsJson) brackets.push(`【products：${userInput.comboProductsJson}】`)
    if (userInput.bundleFeaturesNarrative?.trim())
      brackets.push(`【combo_bundle_features：${userInput.bundleFeaturesNarrative.trim()}】`)
    if (promotionInfo && scriptTypeConfig.use_promotion_info) brackets.push(`【promotion_info：${promotionInfo}】`)
    if (userInput.afterSalesInfo) brackets.push(`【after_sales_info：${userInput.afterSalesInfo}】`)
    if (userInput.competitorLink?.trim()) brackets.push(`【competitor_reference：${userInput.competitorLink.trim()}】`)
    if (userInput.priceLevel) brackets.push(`【price_level：${userInput.priceLevel}】`)
    if (userInput.productRole) brackets.push(`【product_role：${userInput.productRole}】`)
  } else {
    brackets.push(`【product_name：${userInput.productName}】`)
    brackets.push(`【script_type：${scriptTypeConfig.script_type}】`)
    brackets.push(`【country：${countryName}】`)
    if (userInput.price) brackets.push(`【price：${String(userInput.price).replace(/[^\d.]/g, '') || userInput.price}】`)
    if (userInput.productSku) brackets.push(`【sku_info：${userInput.productSku}】`)
    if (userInput.features) brackets.push(`【features：${userInput.features}】`)
    if (userInput.targetAudience) brackets.push(`【target_audience：${userInput.targetAudience}】`)
    if (promotionInfo && scriptTypeConfig.use_promotion_info) brackets.push(`【promotion_info：${promotionInfo}】`)
    if (userInput.afterSalesInfo) brackets.push(`【after_sales_info：${userInput.afterSalesInfo}】`)
    if (userInput.competitorLink?.trim()) brackets.push(`【competitor_reference：${userInput.competitorLink.trim()}】`)
    if (userInput.priceLevel) brackets.push(`【price_level：${userInput.priceLevel}】`)
    if (userInput.productRole) brackets.push(`【product_role：${userInput.productRole}】`)
  }
  const isFrameworkType = userInput.scriptType === 'framework-weak-product' || userInput.scriptType === 'framework-strong-product'
  const customReqParts: string[] = []
  // For framework types, segmentHint is already injected via stageRequirement + outputFormat below.
  // Adding it here a second time sends conflicting signals that cause the Bot to ignore the framework structure.
  if (scriptTypeConfig.segmentHint && !isFrameworkType) customReqParts.push(scriptTypeConfig.segmentHint)
  if (userInput.customRequirements && userInput.customRequirements.trim()) customReqParts.push(userInput.customRequirements.trim())
  if (customReqParts.length > 0) brackets.push(`【custom_requirements：${customReqParts.join('；')}】`)

  let stageRequirement: string
  if (userInput.isCombo) {
    stageRequirement = userInput.scriptType === 'full-sales'
      ? '输出完整销售流程话术（多环节一体），结构与 Coze 话术专家默认版式对齐；此为组套：以核心产品（is_main=true）为主展开塑品与逼单，配套产品仅作简要组合价值说明，勿写成多个单品并列长稿。'
      : `${scriptTypeConfig.segmentHint || '按所选环节'}；组套场景以核心产品为主，配套点到为止。`
  } else if (userInput.scriptType === 'full-sales') {
    stageRequirement = '输出完整销售流程话术（多环节一体），结构与 Coze 话术专家默认版式对齐。'
  } else if (isFrameworkType) {
    stageRequirement = scriptTypeConfig.segmentHint || ''
  } else {
    stageRequirement = scriptTypeConfig.segmentHint
      ? `${scriptTypeConfig.segmentHint}；仍须保留本段的「💡 小白主播提示」与必要的【】小标题。`
      : '只输出当前指定单环节话术；须保留本段导演提示与【】结构。'
  }

  if (userInput.competitorLink?.trim()) {
    stageRequirement +=
      ' 若参数含竞品参考（链接或用户填写的对比要点），据此做差异化口播与站位；对用户未写明、且无法从链接获知的竞品数据勿编造；通常无法实时打开链接。'
  }

  // Framework types get their own output format so the standard segment structure
  // does not override the cycle / deep-persuasion rhythm specified in segmentHint.
  let outputFormat: string
  if (userInput.scriptType === 'framework-weak-product') {
    outputFormat = [
      '【输出格式 — 弱塑品强营销框架，严格按此结构】',
      '整段控制在约 350-400 字（2 分钟可口播循环），严格按五步输出：',
      '❗ 痛点闪击（约 50 字）→ ✅ 单一卖点（约 100-150 字，只讲 1 个核心卖点）→ 💰 利益点（约 50 字，直接报价+促销）→ 🛒 逼单CTA（约 50 字）→ 💬 互动循环（约 50 字，引导评论/互动过渡下一轮）。',
      '禁止写成多环节完整销售流程；禁止输出「小白主播提示」；禁止图表/数据分析报告。',
    ].join('')
  } else if (userInput.scriptType === 'framework-strong-product') {
    outputFormat = [
      '【输出格式 — 强塑品理性说服框架，严格按此结构】',
      '整段控制在约 1000-1800 字（6-10 分钟口播），严格按六步输出：',
      '1️⃣ 圈人群共鸣（约 60 秒）→ 2️⃣ 深度塑品 Before/After（约 90-120 秒，必须有对比场景）→ 3️⃣ 算账法说服（约 60 秒，将价格拆解到每次使用成本）→ 4️⃣ 顾虑打消（约 60 秒）→ 5️⃣ 售后背书（约 30 秒）→ 6️⃣ 理性逼单（约 60 秒，温和坚定，不咆哮）。',
      '每步用「### 步骤名 (时长)」作标题；Before/After 用「Before：…」「After：…」明确对比；算账法必须有数字拆解。',
      '禁止输出「小白主播提示」样式的导演提示；禁止图表/数据分析报告。',
    ].join('')
  } else {
    outputFormat = [
      '【输出格式 — 须完整保留，勿以「精简」为由删减】',
      '1）环节划分：完整流程须覆盖圈人群、塑品、打消顾虑、利益点、售后、逼单（或与你 Bot 内定等价环节）；每大段可用 emoji 序号（如 1️⃣ 2️⃣）开头，或用 Markdown「### 环节名 (时长)」与单独一行的「---」分隔大段。',
      '2）小白主播提示：每个大段开头另起一行写「💡 小白主播提示：……」，一句话点明本段要讲什么、语气与镜头注意；该行必须保留。',
      '3）半角【】结构：须保留「【核心卖点 1：……】」「【顾虑 1：……】」「【承诺 1：……】」「【原价 vs 现价】」「【SKU 说明】」等括号标题，其下再写口播正文；可含 Before（使用前）/ After（使用后）、生活场景、对比句。',
      '4）口播与提示混排：导演提示、emoji、【】标题与口播正文同属交付内容，禁止只输出「纯口播」而删掉提示与【】行。',
      '5）禁止输出图表、Mermaid、仪表盘、宽表、政策对比或数据分析报告；仅输出直播话术文稿。',
    ].join('')
  }

  const query = [
    '任务：直播带货话术生成（非政策分析）。',
    '请严格仅根据下列参数生成话术，勿使用店铺名称、店铺类目或其它未在参数中出现的背景信息。',
    stageRequirement,
    outputFormat,
    `请基于以下参数生成：${brackets.join('')}`,
    '最后一行要求：直接输出完整话术全文（从标题或第一节开始），不要前言、不要复述本指令。',
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
${userInput.targetAudience ? `- 目标人群（target_audience）：${userInput.targetAudience}` : ''}
${userInput.afterSalesInfo && !userInput.isCombo ? `- 售后信息（after_sales_info）：${userInput.afterSalesInfo}` : ''}`

  const competitorSection = userInput.competitorLink?.trim()
    ? `

## 竞品参考（competitor_reference）
- 可为商品/店铺链接，或用户手写的竞品关键参数（价格带、核心卖点、规格、赠品等）；模型通常无法打开链接，且仅可采信本字段已写明的文字，勿虚构未出现的数据：
${userInput.competitorLink.trim()}`
    : ''

  const comboSection = userInput.isCombo
    ? `

## 组套入参（combo，与 Coze 范式一致）
- is_combo：true
${userInput.comboTotalPrice ? `- combo_total_price：${userInput.comboTotalPrice}` : ''}
${userInput.comboOriginalPrice ? `- combo_original_price：${userInput.comboOriginalPrice}` : ''}
${userInput.comboDiscountAmount ? `- combo_discount_amount：${userInput.comboDiscountAmount}` : ''}
- products（JSON，is_main=true 为核心品）：
\`\`\`json
${userInput.comboProductsJson ?? '[]'}
\`\`\`
${userInput.bundleFeaturesNarrative ? `- 组套整体特点（补充）：${userInput.bundleFeaturesNarrative}` : ''}
${userInput.afterSalesInfo ? `- 售后信息（after_sales_info）：${userInput.afterSalesInfo}` : ''}
话术结构：以核心产品为主展开，配套仅作组合价值简要说明。`
    : ''

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

  const formatBlock = [
    '## 输出版式（与 Coze 控制台一致，须遵守）',
    '- 每大段：可选 emoji 序号 + 环节名 + 建议时长；段首必须有「💡 小白主播提示：…」一行。',
    '- 段内用「【核心卖点 n：…】」「【顾虑 n：…】」等半角【】标题组织卖点、顾虑、承诺、价格、SKU；可写 Before/After、生活场景。',
    '- 可用 ### 标题与 --- 分隔线区分大段；不要删掉提示行与【】标题。',
    '- 禁止输出图表、Mermaid、政策对比报告；仅输出话术文稿。',
  ].join('\n')

  const userPrompt = `${requestSummaryParts.join('，')}

---

请为以下产品生成${scriptTypeConfig.script_type_name}类型的直播话术。默认输出简体中文（若终端请求其它界面语言，系统会在收到后再翻译，你仍先按完整结构生成中文稿）。

${productSection}${comboSection}${competitorSection}

${countrySection}${promotionSection}${customRequirementsSection}${storeSection}

## 话术类型（script_type）
${scriptTypeConfig.script_type}
${scriptTypeConfig.script_type_description}

${formatBlock}

请生成话术：`

  return { systemPrompt, userPrompt }
}

