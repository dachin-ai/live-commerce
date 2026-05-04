/**
 * 直播带货主播话术生成规则
 * 基于市场调研：docs/直播带货主播话术市场调研.md
 */

// 话术类型定义
export type ScriptType =
  | 'full-sales'
  | 'segment-audience'
  | 'segment-product'
  | 'segment-concerns'
  | 'segment-benefits'
  | 'segment-after-sales'
  | 'segment-closing'
  | 'framework-weak-product'
  | 'framework-strong-product'
export type ScriptLanguage = 'zh-CN' | 'en-US' | 'th-TH' | 'id-ID'

// 话术类型元数据
export const SCRIPT_TYPE_META = {
  'full-sales': {
    id: 'full-sales',
    nameCN: '完整销售流程话术',
    nameEN: 'Complete Sales Script',
    nameTH: 'สคริปต์การขายแบบสมบูรณ์',
    goal: '完整转化漏斗，从圈人群到逼单',
    scenario: '单品深度推销、高价值商品',
    duration: '5-10分钟',
    elements: ['圈人群/塑品', '卖点提炼', '打消顾虑', '利益点', '售后保障', '逼单'],
  },
  'segment-audience': {
    id: 'segment-audience',
    nameCN: '圈人群部分',
    nameEN: 'Audience Segment',
    nameTH: 'ส่วนระบุกลุ่มผู้ชม',
    goal: '快速圈定目标人群并建立代入',
    scenario: '完整流程第1环节单独生成',
    duration: '60-90秒',
    elements: ['目标人群识别', '痛点共鸣', '场景代入', '承接到产品'],
  },
  'segment-product': {
    id: 'segment-product',
    nameCN: '塑品部分',
    nameEN: 'Product Positioning Segment',
    nameTH: 'ส่วนปั้นคุณค่าสินค้า',
    goal: '清晰塑造产品价值与卖点',
    scenario: '完整流程第2环节单独生成',
    duration: '90-120秒',
    elements: ['核心卖点', '使用场景', '差异化价值', '过渡到答疑'],
  },
  'segment-concerns': {
    id: 'segment-concerns',
    nameCN: '打消顾虑部分',
    nameEN: 'Concern Handling Segment',
    nameTH: 'ส่วนคลายความกังวล',
    goal: '解决观众疑虑，降低决策阻力',
    scenario: '完整流程第3环节单独生成',
    duration: '60-90秒',
    elements: ['高频疑问', '风险消除', '信任背书', '承接到利益点'],
  },
  'segment-benefits': {
    id: 'segment-benefits',
    nameCN: '利益点部分',
    nameEN: 'Benefits Segment',
    nameTH: 'ส่วนผลประโยชน์และข้อเสนอ',
    goal: '强化价格与福利价值，拉升下单意愿',
    scenario: '完整流程第4环节单独生成',
    duration: '90-120秒',
    elements: ['价格价值', '促销福利', '对比感知', '承接到售后'],
  },
  'segment-after-sales': {
    id: 'segment-after-sales',
    nameCN: '售后部分',
    nameEN: 'After-sales Segment',
    nameTH: 'ส่วนบริการหลังการขาย',
    goal: '明确售后保障，增强购买安全感',
    scenario: '完整流程第5环节单独生成',
    duration: '60-90秒',
    elements: ['退换政策', '发货时效', '客服支持', '承接到逼单'],
  },
  'segment-closing': {
    id: 'segment-closing',
    nameCN: '逼单部分',
    nameEN: 'Closing Segment',
    nameTH: 'ส่วนปิดการขาย',
    goal: '制造紧迫感并完成成交转化',
    scenario: '完整流程第6环节单独生成',
    duration: '60-90秒',
    elements: ['限时限量', '最终价值', '强行动召唤', '倒计时催单'],
  },
  'framework-weak-product': {
    id: 'framework-weak-product',
    nameCN: '弱塑品强营销框架',
    nameEN: 'Fast-sell Framework (Weak Product Build)',
    nameTH: 'กรอบขายเร็ว (สร้างสินค้าเบา)',
    goal: '高频循环：一卖点一逼单，2分钟/循环，适合引流款/爆单款',
    scenario: '低中客单价、快速出单、引流爆单场景',
    duration: '2分钟/循环，可重复',
    elements: ['痛点闪击(15s)', '单一卖点(30-45s)', '利益点(15s)', '逼单CTA(15s)', '互动循环(15s)'],
  },
  'framework-strong-product': {
    id: 'framework-strong-product',
    nameCN: '强塑品理性说服框架',
    nameEN: 'Persuasion Framework (Strong Product Build)',
    nameTH: 'กรอบโน้มน้าว (สร้างสินค้าหนัก)',
    goal: '深度塑品：Before/After对比+算账法+理性说服，适合利润款/战略款',
    scenario: '高客单价、品质品牌、利润款战略款场景',
    duration: '6-10分钟完整流程',
    elements: ['圈人群共鸣(60s)', '深度塑品Before/After(90-120s)', '算账法说服(60s)', '顾虑打消(60s)', '售后背书(30s)', '理性逼单(60s)'],
  },
} as const

// 时长与语速规范
export const SCRIPT_SPECS = {
  standardDuration: { min: 20, max: 60, unit: '秒' },
  goldenOpening: { duration: 30, description: '黄金30秒开场' },
  goldenRetention: { duration: 180, description: '前3分钟留人期' },
  wordsPerMinute: { min: 180, max: 220, unit: '字/分' },
  maxContinuousSpeech: { duration: 15, unit: '秒', description: '单次连续表达不宜超过' },
  interactionFrequency: { every: 3, unit: '句话', description: '每约3句话穿插1次互动' },
} as const

// 合规禁用词（部分示例，实际需更全面）
export const COMPLIANCE_BANNED_WORDS = {
  medical: ['治疗', '治愈', '疗效', '根治', '药效', '医用', '医疗级', 'cure', 'treat', 'medical-grade'],
  absolute: ['100%', '绝对', '最好', '最佳', '最优', '全网最低', 'best in the world', 'guaranteed 100%'],
  false: ['假一赔十', '无效退款', '虚构原价', '限时仅此一次（除非真的是）', 'fake price', 'fabricated'],
  exaggerated: ['神器', '秒杀一切', '无敌', '零风险', 'miracle', 'zero risk'],
} as const

// 合规高风险类目（需额外审核或警告）
export const HIGH_RISK_CATEGORIES = [
  '保健食品',
  '医疗器械',
  '药品',
  '特殊医学用途配方食品',
  '酒类',
  '化妆品（功效宣称）',
  'health supplements',
  'medical devices',
  'pharmaceuticals',
  'alcohol',
]

// 心理学策略元素库（可在提示词中引导）
export const PSYCHOLOGY_ELEMENTS = {
  anchoring: { nameCN: '锚定效应', example: '原价599，直播间199' },
  herd: { nameCN: '从众效应', example: '已有127位家人下单' },
  lossAversion: { nameCN: '损失厌恶', example: '过了这点立刻恢复原价' },
  reciprocity: { nameCN: '互惠原则', example: '先发福利/干货再推品' },
  authority: { nameCN: '权威效应', example: '专家/质检/品牌背书' },
  scarcity: { nameCN: '稀缺性', example: '限时、限量、库存倒数' },
  fomo: { nameCN: '错失恐惧', example: '明天就没这个价了' },
} as const

// 合规检查函数
export function checkCompliance(content: string): { pass: boolean; warnings: string[] } {
  const warnings: string[] = []
  
  // 检查禁用词
  for (const [category, words] of Object.entries(COMPLIANCE_BANNED_WORDS)) {
    for (const word of words) {
      if (content.includes(word)) {
        warnings.push(`包含${category}类禁用词：${word}`)
      }
    }
  }

  return {
    pass: warnings.length === 0,
    warnings,
  }
}

// 话术生成规则配置
export const SCRIPT_GENERATION_RULES = {
  // 字数与时长估算（按语速 180-220 字/分）
  estimateWordCount: (seconds: number): { min: number; max: number } => {
    const min = Math.floor((seconds / 60) * SCRIPT_SPECS.wordsPerMinute.min)
    const max = Math.ceil((seconds / 60) * SCRIPT_SPECS.wordsPerMinute.max)
    return { min, max }
  },

  // 话术类型推荐（基于类目，未来可扩展）
  recommendScriptTypes: (category?: string): ScriptType[] => {
    const categoryMap: Record<string, ScriptType[]> = {
      食品: ['segment-product', 'segment-benefits', 'segment-closing'],
      饮料: ['segment-product', 'segment-audience', 'segment-benefits'],
      美妆: ['segment-product', 'segment-benefits', 'segment-audience'],
      服装: ['segment-product', 'segment-benefits', 'segment-closing'],
      电子产品: ['segment-product', 'segment-benefits'],
      家居: ['segment-product', 'segment-benefits'],
      礼品: ['segment-product', 'segment-benefits'],
      节日用品: ['segment-product', 'segment-benefits', 'segment-audience'],
    }
    return category && categoryMap[category]
      ? categoryMap[category]
      : ['full-sales', 'segment-audience', 'segment-product', 'segment-benefits', 'segment-closing']
  },

  // 黄金30秒建议（用于前端提示）
  goldenTips: {
    'zh-CN': '前30秒抓住用户：痛点共鸣 + 福利钩子 + 行动指令',
    'en-US': 'First 30 seconds: Pain point + Value hook + Clear CTA',
  },
} as const
