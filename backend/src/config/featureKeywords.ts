/**
 * AI 功能关键词配置
 * 从 todoGenerator.ts autoTagTaskRoleAndTool 中提取，集中管理便于维护和扩展。
 * 新增工具只需在此文件添加条目，无需修改核心生成逻辑。
 */

// ==================== 角色关键词规则 ====================

export interface RoleKeywordRule {
  role: 'anchor' | 'operator' | 'both'
  pattern: RegExp
  /** 规则说明（运营查看用） */
  description: string
}

export const ROLE_KEYWORD_RULES: RoleKeywordRule[] = [
  {
    role: 'anchor',
    pattern: /话术|逼单|宠粉|互动话术|主播.*技巧|主播.*培训|语调|声音|现场.*应变|直播.*节奏|开场.*话术|收尾.*话术|带货.*话术|促单/,
    description: '主播相关：话术、技巧、培训、节奏等',
  },
  {
    role: 'operator',
    pattern: /复盘|数据.*分析|策略|选品|时段.*选择|时段.*优化|商品.*布局|活动.*策划|投放|A\/B.*测试|测试.*方案|测试.*效果|测试.*新品|复制.*策略|优化.*策略|分析.*原因|分析.*问题|建立.*机制|制定.*计划|数据.*复盘|日.*复盘/,
    description: '运营相关：复盘、选品、策略、数据分析等',
  },
  {
    role: 'both',
    pattern: /直播.*内容.*优化|直播.*流程|场次.*安排|商品.*推荐.*直播|直播.*商品|短视频.*引流.*直播|直播间.*优化|直播.*时长.*优化/,
    description: '主播+运营协同：直播流程、内容优化等',
  },
]

// ==================== AI 功能关键词规则 ====================

export interface FeatureKeywordRule {
  feature: string
  pattern: RegExp
  /** 规则说明（运营查看用） */
  description: string
}

/**
 * 规则按优先级排列——靠前的规则优先匹配。
 * 新增工具时在此列表中添加条目即可自动生效。
 */
export const FEATURE_KEYWORD_RULES: FeatureKeywordRule[] = [
  { feature: 'event',             pattern: /节日|大促|备货|情人节|圣诞|宋干|水灯|倒计时/,                                       description: '节日大促活动' },
  { feature: 'comparison',        pattern: /对比|同比|环比|店铺对比|时期对比/,                                                   description: '数据对比分析' },
  { feature: 'positioning',       pattern: /定位|店铺定位|完善店铺|目标人群|品牌定位|价格区间/,                                   description: '店铺定位' },
  { feature: 'brand',             pattern: /品牌|品牌形象|品牌建设/,                                                             description: '品牌建设' },
  { feature: 'supply_chain',      pattern: /供应链|供货|采购/,                                                                   description: '供应链' },
  { feature: 'crm',               pattern: /粉丝运营|客户维护|客户运营|crm|私域/,                                                description: '客户关系管理' },
  { feature: 'image_analysis',    pattern: /主图|图片分析|主图优化|商品图|商品卡主图|直播场景.*(图|分析)/,                         description: '图片分析' },
  { feature: 'scene_scoring',     pattern: /直播场景|场景打分|场景布置|直播间布置|录屏|视频分析/,                                 description: '直播场景评分' },
  { feature: 'script',            pattern: /话术|逼单|宠粉|开场.*话术|收尾.*话术|促单|话术考核|话术评估|话术打分/,               description: '话术生成与评估' },
  { feature: 'product_recommend', pattern: /选品|商品.*推荐|商品.*布局|商品.*组合|爆品|竞争力|竞品|竞争分析/,                     description: '选品与商品推荐' },
  { feature: 'time_recommend',    pattern: /时段|时间.*选择|黄金.*时段|流量.*高峰/,                                               description: '直播时段推荐' },
  { feature: 'engagement',        pattern: /互动|评论|私信|粉丝|关注|留存/,                                                     description: '互动与粉丝运营' },
  { feature: 'content',           pattern: /内容|选题|脚本|剧本|短视频/,                                                         description: '内容策划' },
  { feature: 'pricing',           pattern: /定价|价格|客单价|利润/,                                                               description: '定价策略' },
  { feature: 'stats',             pattern: /数据|统计|指标|报表|分析/,                                                           description: '数据统计分析' },
  { feature: 'report',            pattern: /复盘|总结|回顾/,                                                                     description: '复盘总结' },
  { feature: 'marketing',         pattern: /流量|引流|推广|投放/,                                                                 description: '流量投放' },
  { feature: 'schedule',          pattern: /排期|日程|计划|安排/,                                                                 description: '排期计划' },
]

// ==================== 匹配函数 ====================

/**
 * 根据标题+描述文本自动匹配角色和 AI 功能标签。
 * 替代 todoGenerator.ts 中原来的硬编码 autoTagTaskRoleAndTool。
 */
export function matchRoleAndFeature(title: string, description: string): {
  assignedRole: string | undefined
  aiFeature: string | undefined
} {
  const text = (title + ' ' + description).toLowerCase()

  // 角色匹配：anchor > operator > both（both 可覆盖前两者）
  let assignedRole: string | undefined
  for (const rule of ROLE_KEYWORD_RULES) {
    if (rule.role === 'both') {
      // both 规则可覆盖之前的匹配
      if (rule.pattern.test(text)) {
        assignedRole = 'both'
      }
    } else if (!assignedRole && rule.pattern.test(text)) {
      assignedRole = rule.role
    }
  }

  // 功能匹配：第一个命中的规则优先
  let aiFeature: string | undefined
  for (const rule of FEATURE_KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      aiFeature = rule.feature
      break
    }
  }

  return { assignedRole, aiFeature }
}
