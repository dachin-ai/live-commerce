/**
 * 话术生成 LLM 输出校验：识别「跑题」内容（如分析报告、行业趋势），
 * 用于在返回内容明显非话术时切换为模板兜底并提示用户检查 LLM 配置。
 */

/** 命中以下任一即视为「非话术」（报告/分析类），应走模板兜底 */
const OFF_TOPIC_PATTERNS = [
  /分析报告\s*[（(]?\d{4}/i,
  /行业趋势\s*分析/i,
  /市场(规模|格局|趋势|渗透)/i,
  /竞争格局/i,
  /(泰国|越南|印尼|跨境).*电商.*(市场|报告|趋势)/i,
  /(##\s*一[、,]?\s*核心|##\s*二[、,]?\s*)/m,
  /(当前规模|未来预期|渗透情况)\s*[:：]/i,
  /(高|中|低)优先级\s*建议/i,
  /预期效果\s*[:：]\s*(提升|降低|抓住|拓展|预期)/i,
  /(三国杀|平台策略)态势/i,
  /(Shopee|Lazada|Temu).*市场/i,
]

/** 若内容较短且包含典型话术特征，仍视为话术（避免误杀） */
const SCRIPT_LIKE_PATTERNS = [
  /(家人们|姐妹们|宝宝们|各位)/,
  /(扣1|点个赞|评论|小黄车|下方链接)/,
  /(今天给大家|这款|咱们)/,
  /【(圈人群|塑品|逼单|利益点)】/,
]

/**
 * 判断 LLM 返回内容是否「像话术」而非报告/分析。
 * 若明显为报告、行业分析、策略建议等，返回 false，路由层将用模板兜底。
 */
export function isLikelyScriptContent(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const head = t.slice(0, 800)
  for (const p of OFF_TOPIC_PATTERNS) {
    if (p.test(head)) return false
  }
  if (t.length >= 200 && !SCRIPT_LIKE_PATTERNS.some((p) => p.test(t))) {
    if (OFF_TOPIC_PATTERNS.some((p) => p.test(t))) return false
  }
  return true
}

export const RELEVANCE_WARNING_MESSAGE =
  '检测到返回内容为分析报告/行业趋势而非话术，已切换为模板话术。请将 LLM/Coze 配置为「话术生成」专用（勿用市场分析类机器人）。'

export type ResolveScriptFallbackResult = {
  content: string
  usedTemplateFallback: boolean
  relevanceWarning?: string
  /** 用于诊断：empty | not_script（仅当未使用 Coze 提示词时可能为 not_script） */
  fallbackReason?: 'empty' | 'not_script'
}

/**
 * 决定最终展示内容：使用 Coze 提示词且 content 非空时直接采用 LLM 原生输出；
 * 否则空内容或「不像话术」时用模板兜底。供流式路由调用并便于单测。
 */
export function resolveScriptContentWithFallback(
  content: string,
  useCozePrompts: boolean,
  getTemplateContent: () => string
): ResolveScriptFallbackResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return {
      content: getTemplateContent(),
      usedTemplateFallback: true,
      fallbackReason: 'empty',
    }
  }
  if (useCozePrompts) {
    return { content: trimmed, usedTemplateFallback: false }
  }
  if (!isLikelyScriptContent(trimmed)) {
    return {
      content: getTemplateContent(),
      usedTemplateFallback: true,
      relevanceWarning: RELEVANCE_WARNING_MESSAGE,
      fallbackReason: 'not_script',
    }
  }
  return { content: trimmed, usedTemplateFallback: false }
}

/** 话术正文起始标记（Coze 可能带优化说明、产品信息表等，只保留完整话术段） */
const SCRIPT_BODY_START_MARKERS = [
  /##\s*🎤\s*完整话术/m,
  /##\s*完整话术\s*[（(]?\s*V?\d/m,
  /###\s*【圈人群】/m,
  /###\s*【塑品】/m,
  /###\s*【打消顾虑】/m,
  /###\s*【利益点】/m,
  /###\s*【售后】/m,
  /###\s*【逼单】/m,
]

/** 话术正文结束标记（之后为优化说明、数据统计、使用建议等，不展示给终端用户） */
const SCRIPT_BODY_END_MARKERS = [
  /^##\s*(📋|✅|🎯|📊|🚀)\s*((优化说明|产品信息|优化效果|话术数据统计|使用建议|优化亮点))/m,
  /^##\s*✅\s*V?\d.*优化效果/m,
  /^##\s*📊\s*话术数据统计/m,
  /^##\s*🚀\s*使用建议/m,
  /\*\*🎊\s*V?\d.*优化版已完成/m,
  /优化版已完成，可直接用于直播/m,
]

/**
 * 从 Coze 完整输出中提取「仅给终端用户展示」的话术正文。
 * 去掉：优化说明、产品信息表、优化效果对比、优化亮点、话术数据统计、使用建议、结尾标语等。
 * 保留：完整话术（含【圈人群】【塑品】【打消顾虑】【利益点】【售后】【逼单】及其中的小白主播提示）。
 */
export function extractScriptBodyForDisplay(rawContent: string): string {
  const s = rawContent.trim()
  if (!s) return s

  let startIndex = -1
  for (const re of SCRIPT_BODY_START_MARKERS) {
    const m = s.match(re)
    if (m && m.index !== undefined) {
      if (startIndex === -1 || m.index < startIndex) startIndex = m.index
    }
  }

  if (startIndex === -1) return s

  const fromStart = s.slice(startIndex)
  let endIndex = fromStart.length
  for (const re of SCRIPT_BODY_END_MARKERS) {
    const m = fromStart.match(re)
    if (m && m.index !== undefined && m.index < endIndex) endIndex = m.index
  }

  const extracted = fromStart.slice(0, endIndex).trim()
  return extracted.length >= 50 ? extracted : s
}
