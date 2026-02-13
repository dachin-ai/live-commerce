/**
 * 直播带货主播话术生成规则
 * 基于市场调研：docs/直播带货主播话术市场调研.md
 */

// 话术类型定义
export type ScriptType = 'interaction' | 'scenario' | 'promotion' | 'closing' | 'full-sales'
export type ScriptLanguage = 'zh-CN' | 'en-US' | 'th-TH'

// 话术类型元数据
export const SCRIPT_TYPE_META = {
  interaction: {
    id: 'interaction',
    nameCN: '人群互动话术',
    nameEN: 'Interaction Script',
    nameTH: 'การมีปฏิสัมพันธ์กับผู้ชม',
    goal: '提升直播间互动率',
    scenario: '暖场、活跃气氛、回答评论',
    duration: '20-40秒',
    elements: ['吸引提问', '请求互动', '建立联系', '行动召唤'],
  },
  scenario: {
    id: 'scenario',
    nameCN: '场景化塑品话术',
    nameEN: 'Scenario Script',
    nameTH: 'การสร้างสถานการณ์',
    goal: '建立产品使用场景',
    scenario: '产品介绍、展示价值',
    duration: '30-60秒',
    elements: ['场景代入', '痛点描述', '产品即解决方案', '效果展示', '行动召唤'],
  },
  promotion: {
    id: 'promotion',
    nameCN: '促销活动话术',
    nameEN: 'Promotion Script',
    nameTH: 'โปรโมชันและเปรียบเทียบราคา',
    goal: '促进转化、提升客单价',
    scenario: '折扣、比价、套餐推荐',
    duration: '20-40秒',
    elements: ['成本与售价', '价格对比', '超值感', '紧迫感', '省钱强调', '行动召唤'],
  },
  closing: {
    id: 'closing',
    nameCN: '逼单技巧话术',
    nameEN: 'Closing Script',
    nameTH: 'เทคนิคการปิดการขาย',
    goal: '促成下单、制造紧迫感',
    scenario: '限时限量、促单成交',
    duration: '15-30秒',
    elements: ['紧迫感', '最终价值', '异议处理', '强烈CTA', 'FOMO', '简单选择'],
  },
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
      食品: ['scenario', 'promotion', 'closing'],
      饮料: ['scenario', 'interaction', 'promotion'],
      美妆: ['scenario', 'promotion', 'interaction'],
      服装: ['scenario', 'promotion', 'closing'],
      电子产品: ['scenario', 'promotion'],
      家居: ['scenario', 'promotion'],
      礼品: ['scenario', 'promotion'],
      节日用品: ['scenario', 'promotion', 'interaction'],
    }
    return category && categoryMap[category] ? categoryMap[category] : ['interaction', 'scenario', 'promotion', 'closing']
  },

  // 黄金30秒建议（用于前端提示）
  goldenTips: {
    'zh-CN': '前30秒抓住用户：痛点共鸣 + 福利钩子 + 行动指令',
    'en-US': 'First 30 seconds: Pain point + Value hook + Clear CTA',
  },
} as const
