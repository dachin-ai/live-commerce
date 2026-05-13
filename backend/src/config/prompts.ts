/**
 * LLM Prompt 模板配置
 * 从 todoGenerator.ts 中提取，集中管理便于维护。
 * 运营可通过 GET /api/ai/prompt-templates 只读查看当前模板。
 *
 * 模板使用 {{变量名}} 占位符，由调用方填充。
 */

// ==================== 待办生成 System Prompt ====================

export const TODO_SYSTEM_PROMPT_TEMPLATE = `【语言】locale={{locale}}，countryCode={{countryCode}}。标题与描述用该语言。

你是直播电商待办助手。根据下方店铺与数据生成待办；有按日明细时请基于明细分析趋势，结论以你分析为准。

【范围】聚焦直播运营：内容、话术、节奏、转化、时段、商品、互动。产出 6～10 条可落地待办。

【描述结构】每条 tasks[i].description 必须严格包含并按顺序组织以下 5 个段落（标题必须用中文全角书名号括号形式，便于系统解析展示）：
1) 【目标】（SMART，含时间边界）
2) 【数据来源】（当前值/目标值/依据说明）
3) 【执行步骤】（第一步/第二步…，每步含动作+截止时间+责任人）
4) 【参数配置】（关键参数+来源+调整方案）
5) 【验证方案】（指标/方法/周期/成功标准/失败处理）
可选追加：6) 【资源需求】（人力/预算/工具/风险）

【输出】仅返回一个 JSON：{"tasks":[{"title":"标题","description":"按【目标】【数据来源】【执行步骤】【参数配置】【验证方案】结构输出","priority":"urgent或normal","estimated_days":"可选，如3天","category":"可选 analysis|core|strategy","responsible":"可选，如运营或主播+运营"},...]}。每条必须严格用英文双引号与冒号。无 markdown、无前缀，直接流式输出。

【关键】禁止在字符串值内使用未转义的英文双引号。价格举例用「」包裹。`

// ==================== 待办生成 User Message 模板 ====================

export const TODO_USER_MESSAGE_TEMPLATE = `【store_data】{{storeDataJson}}
【store_attributes】{{storeAttributesStr}}
【raw_daily_table】
{{rawDailyTableStr}}

【用户界面语言/地区】locale={{locale}}，countryCode={{countryCode}}
【店铺基本信息】
- 店铺名称：{{storeName}}
- 平台：{{storePlatform}}
- 国家/区域：{{region}}
- 类目：{{categories}}{{storeAttrsLine}}

【核心销售指标（最近30天）】
- 总订单数：{{orders}} 单（完成订单：{{completedOrders}} 单）
- 总观看数：{{viewers}} 人
- 总互动数：{{interactions}}（点赞 {{likes}}、评论 {{comments}}、分享 {{shares}}、关注 {{follows}}）
- 互动率：{{interactionRate}}%
- 商品曝光：{{productViews}}，商品点击：{{productClicks}}
- 总收入（GMV）：{{gmv}} {{currencyName}}
- 转化率：{{conversionRate}}%
- 直播总时长：{{duration}} 小时
- 时均 GMV：{{gmvPerHour}} {{currencyName}}

【历史对比】
{{historicalBlock}}{{rawDataBlock}}
【业务上下文】{{existingTasksLine}}{{additionalPromptLine}}`

// ==================== 异常分析 Prompt ====================

export const ANOMALY_SYSTEM_PROMPT_TEMPLATE = `【回复语言与地区】locale={{locale}}，countryCode={{countryCode}}。任务标题与描述使用该语言。
你是直播电商运营助手。根据系统检测到的数据异常，输出 1～3 条可执行的待办任务建议。
输出格式：JSON，形如 {"tasks":[{"title":"任务标题","description":"任务描述","priority":"urgent 或 normal"}]}。`

export const ANOMALY_USER_MESSAGE_TEMPLATE = `【用户界面语言/地区】locale={{locale}}，countryCode={{countryCode}}
店铺：{{storeName}}{{platformSuffix}}{{categoriesSuffix}}
{{statsLine}}

系统检测到的异常：
{{anomalyLines}}

请基于以上异常，输出 1～3 条待办任务（JSON 格式）。`

// ==================== 模板渲染工具 ====================

/**
 * 将模板中的 {{key}} 占位符替换为 vars 中对应的值。
 * 未匹配的占位符保留原样（不会意外删除）。
 */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const val = vars[key]
    return val !== undefined && val !== null ? String(val) : match
  })
}

// ==================== 所有模板汇总（供只读接口使用） ====================

export interface PromptTemplateInfo {
  id: string
  name: string
  description: string
  template: string
  variables: string[]
}

/** 提取模板中的所有 {{变量}} 名称 */
function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
}

export function getAllPromptTemplates(): PromptTemplateInfo[] {
  return [
    {
      id: 'todo_system',
      name: '待办生成 - 系统指令',
      description: '控制 LLM 生成待办的格式、语言和结构要求',
      template: TODO_SYSTEM_PROMPT_TEMPLATE,
      variables: extractVariables(TODO_SYSTEM_PROMPT_TEMPLATE),
    },
    {
      id: 'todo_user',
      name: '待办生成 - 用户消息',
      description: '包含店铺数据、销售指标、历史对比等业务信息',
      template: TODO_USER_MESSAGE_TEMPLATE,
      variables: extractVariables(TODO_USER_MESSAGE_TEMPLATE),
    },
    {
      id: 'anomaly_system',
      name: '异常分析 - 系统指令',
      description: '控制异常分析待办的输出格式',
      template: ANOMALY_SYSTEM_PROMPT_TEMPLATE,
      variables: extractVariables(ANOMALY_SYSTEM_PROMPT_TEMPLATE),
    },
    {
      id: 'anomaly_user',
      name: '异常分析 - 用户消息',
      description: '包含店铺信息和检测到的数据异常',
      template: ANOMALY_USER_MESSAGE_TEMPLATE,
      variables: extractVariables(ANOMALY_USER_MESSAGE_TEMPLATE),
    },
  ]
}
