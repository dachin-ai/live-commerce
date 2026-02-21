/**
 * 话术可视化动作规则（规则驱动，非硬编码）
 * 原则：根据**实际话术段落**抓取对应卖点，再按配置的「关键词→演示动作」设计本环节建议；不依赖固定列举。
 * 规则来源：优先从 config/script-rules/visualSegmentRules.json 读取 featureDemoHints 与分段规则，缺省使用本文件内置。
 */

import type { ScriptType } from './scriptGeneration'
import { loadVisualSegmentRules } from './loadScriptRulesConfig'

export interface VisualActionContext {
  productName?: string
  features?: string
  promoCopy?: string
  targetAudience?: string
}

/** 卖点→演示动作：当话术或产品特点中出现 keywords 时，给出对应演示型建议 */
export interface FeatureDemoHint {
  keywords: string[]
  suggestion: string
}

export interface VisualSegmentRule {
  id: string
  label: string
  color: string
  startMarker: string
  visualAction?: string
  allowFeatureDemos?: boolean
}

export interface VisualPart {
  type: string
  label: string
  color: string
  text: string
  action?: string
}

const PLACEHOLDER_FALLBACKS_DEFAULT: Required<VisualActionContext> = {
  productName: '本品',
  features: '核心卖点',
  promoCopy: '本场福利',
  targetAudience: '目标人群',
}

function getPlaceholderFallbacks(): Required<VisualActionContext> {
  const loaded = loadVisualSegmentRules()?.placeholderFallbacks
  if (!loaded) return PLACEHOLDER_FALLBACKS_DEFAULT
  return {
    productName: loaded.productName ?? PLACEHOLDER_FALLBACKS_DEFAULT.productName,
    features: loaded.features ?? PLACEHOLDER_FALLBACKS_DEFAULT.features,
    promoCopy: loaded.promoCopy ?? PLACEHOLDER_FALLBACKS_DEFAULT.promoCopy,
    targetAudience: loaded.targetAudience ?? PLACEHOLDER_FALLBACKS_DEFAULT.targetAudience,
  }
}

/**
 * 内置卖点→演示映射**仅作举例**；实际应根据业务在 config 的 featureDemoHints 中配置，
 * 使「实际话术中出现的关键词」与「对应可视化动作」一一对应。
 */
const FEATURE_DEMO_HINTS_EXAMPLE: FeatureDemoHint[] = [
  { keywords: ['防水', '防泼水', 'IPX'], suggestion: '本环节可把{productName}直接放进水盆里演示防水，比手卡更有说服力。' },
  { keywords: ['不锈钢', '坚固', '牢固', '承重', '结实'], suggestion: '本环节可拍打{productName}或站上去展示牢固承重，比单举手卡更直观。' },
  { keywords: ['静音', '降噪', '无声'], suggestion: '本环节可现场对比有/无{productName}时的声音差异，直观展示静音效果。' },
  { keywords: ['耐磨', '耐刮', '防刮'], suggestion: '本环节可用钥匙或硬物轻划{productName}演示耐磨，增强可信度。' },
]

function getFeatureDemoHints(): FeatureDemoHint[] {
  const loaded = loadVisualSegmentRules()?.featureDemoHints
  if (Array.isArray(loaded) && loaded.length > 0) return loaded as FeatureDemoHint[]
  return FEATURE_DEMO_HINTS_EXAMPLE
}

/**
 * 根据**实际话术段落**与用户填写的产品特点抓取卖点，匹配「关键词→演示动作」配置，生成演示型建议。
 * 匹配来源：优先该段话术正文（segmentText），辅以 context.features，从而根据实际话术设计对应可视化动作。
 */
function getFeatureBasedDemoSuggestions(
  context: VisualActionContext | undefined,
  segmentText?: string
): string[] {
  const fallbacks = getPlaceholderFallbacks()
  const productName = (context?.productName ?? fallbacks.productName).trim()
  const featuresFromInput = (context?.features ?? '').trim()
  const textToMatch = [(segmentText || '').trim(), featuresFromInput].filter(Boolean).join(' ')
  if (!textToMatch) return []

  const lower = textToMatch.toLowerCase()
  const hints = getFeatureDemoHints()
  const out: string[] = []
  for (const hint of hints) {
    const hit = hint.keywords.some((k) => lower.includes(k.toLowerCase()))
    if (!hit) continue
    const text = hint.suggestion
      .replace(/\{productName\}/g, productName)
      .replace(/\{features\}/g, featuresFromInput || fallbacks.features)
      .trim()
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

function resolveVisualAction(
  template: string | undefined,
  ctx: VisualActionContext | undefined,
  options?: { rule?: VisualSegmentRule; segmentText?: string }
): string | undefined {
  const fallbacks = getPlaceholderFallbacks()
  const productName = (ctx?.productName ?? fallbacks.productName).trim()
  const features = (ctx?.features ?? '').trim()
  const promoCopy = (ctx?.promoCopy ?? fallbacks.promoCopy).trim()
  const targetAudience = (ctx?.targetAudience ?? fallbacks.targetAudience).trim()

  const replacePlaceholders = (t: string) =>
    t
      .replace(/\{productName\}/g, productName)
      .replace(/\{features\}/g, features || fallbacks.features)
      .replace(/\{promoCopy\}/g, promoCopy || fallbacks.promoCopy)
      .replace(/\{targetAudience\}/g, targetAudience || fallbacks.targetAudience)
      .trim()

  const allowDemos = options?.rule?.allowFeatureDemos ?? false
  const demos = allowDemos ? getFeatureBasedDemoSuggestions(ctx, options?.segmentText) : []

  if (!template || !template.trim()) {
    if (demos.length > 0) return demos.join('；') + '。'
    return undefined
  }

  const base = replacePlaceholders(template)
  if (!base) return demos.length > 0 ? demos.join('；') + '。' : undefined

  if (demos.length > 0) return demos.join('；') + ' 也可' + base
  return base
}

const VISUAL_SEGMENT_RULES: Partial<Record<ScriptType, VisualSegmentRule[]>> & { default: VisualSegmentRule[] } = {
  'full-sales': [
    { id: 'intro', label: '标题与说明', color: '#6b7280', startMarker: '【完整销售流程话术', visualAction: '口播开头时，画面可展示本场主题或店铺名。' },
    { id: 'step1', label: '圈人群+塑品', color: '#2563eb', startMarker: '第一步：圈人群 + 塑品', visualAction: '口播到这一段时，把手卡写上「谁需要」或痛点关键词（可写「{targetAudience}」），举给镜头看或切场景。' },
    { id: 'step2', label: '卖点提炼', color: '#059669', startMarker: '第二步：卖点提炼', allowFeatureDemos: true, visualAction: '口播到这一段时，把手卡写上卖点词「{features}」举给镜头看，或给{productName}特写。' },
    { id: 'step3', label: '打消顾虑', color: '#0891b2', startMarker: '第三步：打消顾虑', visualAction: '口播到这一段时，可上「答疑要点」或规格字幕；手卡写「质保」「包退」等，说到时举一下。' },
    { id: 'step4', label: '利益点', color: '#ea580c', startMarker: '第四步：利益点', visualAction: '口播到这一段时，把价格和福利打在字幕或手卡上；若有活动「{promoCopy}」务必让观众看清。' },
    { id: 'step5', label: '售后保障', color: '#7c3aed', startMarker: '第五步：售后保障', visualAction: '口播到这一段时，可上「7天无理由」「正品」「发货」等关键词字幕或手卡。' },
    { id: 'step6', label: '逼单', color: '#dc2626', startMarker: '第六步：逼单', visualAction: '口播到这一段时，可上倒计时或「库存不多」等字幕；若有「{promoCopy}」再强调一次。' },
    { id: 'tips', label: '使用建议', color: '#64748b', startMarker: '💡 使用建议' },
    { id: 'compliance', label: '合规提示', color: '#b45309', startMarker: '---\n⚠️' },
  ],
  'segment-audience': [
    { id: 'section', label: '圈人群', color: '#2563eb', startMarker: '【圈人群部分话术', visualAction: '口播时聚焦目标人群痛点，可上「{targetAudience}」关键词字幕。' },
  ],
  'segment-product': [
    { id: 'section', label: '塑品', color: '#059669', startMarker: '【塑品部分话术', allowFeatureDemos: true, visualAction: '口播时突出卖点「{features}」，可配合{productName}近景展示。' },
  ],
  'segment-concerns': [
    { id: 'section', label: '打消顾虑', color: '#0891b2', startMarker: '【打消顾虑部分话术', visualAction: '口播时可上「常见问题」字幕，逐项回答顾虑。' },
  ],
  'segment-benefits': [
    { id: 'section', label: '利益点', color: '#ea580c', startMarker: '【利益点部分话术', visualAction: '口播时把价格与活动「{promoCopy}」同步展示在手卡或字幕。' },
  ],
  'segment-after-sales': [
    { id: 'section', label: '售后', color: '#7c3aed', startMarker: '【售后部分话术', visualAction: '口播时突出退换、发货、客服支持等保障信息。' },
  ],
  'segment-closing': [
    { id: 'section', label: '逼单', color: '#dc2626', startMarker: '【逼单部分话术', visualAction: '口播时强化倒计时与限量感，并再次强调福利。' },
  ],
  default: [
    { id: 'header', label: '标题/说明', color: '#6b7280', startMarker: '【', visualAction: '口播开头时展示标题或「{productName}」核心信息。' },
    { id: 'compliance', label: '合规提示', color: '#b45309', startMarker: '---\n⚠️' },
  ],
}

const DEFAULT_PART_COLOR_BUILTIN = '#374151'

function getDefaultPartColor(): string {
  return loadVisualSegmentRules()?.defaultPartColor ?? DEFAULT_PART_COLOR_BUILTIN
}

function getResolvedRules(scriptType: ScriptType): VisualSegmentRule[] {
  const loaded = loadVisualSegmentRules()?.rulesByType
  const key = scriptType as string
  if (loaded?.[key] && Array.isArray(loaded[key]) && loaded[key].length > 0) {
    return loaded[key] as VisualSegmentRule[]
  }
  return VISUAL_SEGMENT_RULES[scriptType] ?? VISUAL_SEGMENT_RULES.default
}

/**
 * 按规则将话术切分为带类型与颜色的段落；本环节建议根据**该段话术正文**抓取卖点并匹配演示动作（若规则允许）。
 */
export function segmentForVisual(
  content: string,
  scriptType: ScriptType,
  context?: VisualActionContext | null
): VisualPart[] {
  if (!content || typeof content !== 'string') return []

  const rules = getResolvedRules(scriptType)
  const defaultColor = getDefaultPartColor()
  type MarkerHit = { index: number; rule: VisualSegmentRule }
  const hits: MarkerHit[] = []
  for (const rule of rules) {
    const idx = content.indexOf(rule.startMarker)
    if (idx !== -1) hits.push({ index: idx, rule })
  }
  hits.sort((a, b) => a.index - b.index)

  const parts: VisualPart[] = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index
    const end = i + 1 < hits.length ? hits[i + 1].index : content.length
    const text = content.slice(start, end)
    const { id, label, color, visualAction } = hits[i].rule
    const action = resolveVisualAction(visualAction, context ?? undefined, {
      rule: hits[i].rule,
      segmentText: text,
    })
    parts.push({ type: id, label, color, text, action })
  }

  if (parts.length === 0) {
    parts.push({ type: 'body', label: '正文', color: defaultColor, text: content })
  } else if (hits[0].index > 0) {
    const intro = content.slice(0, hits[0].index)
    if (intro.trim()) parts.unshift({ type: 'intro', label: '开头', color: defaultColor, text: intro })
  }

  return parts
}

export function getVisualLegend(
  scriptType: ScriptType,
  context?: VisualActionContext | null
): Array<{ label: string; color: string; action?: string }> {
  const rules = getResolvedRules(scriptType)
  return rules.map((r) => ({
    label: r.label,
    color: r.color,
    action: resolveVisualAction(r.visualAction, context ?? undefined, { rule: r }),
  }))
}

const VISUAL_SUGGESTION_PREFIX = '※本环节建议：'

/**
 * 在每段起始标记下一行插入「※本环节建议：xxx」；建议内容根据**该段话术正文**抓取卖点并匹配配置的演示动作。
 */
export function injectVisualSuggestionsIntoContent(
  content: string,
  scriptType: ScriptType,
  context?: VisualActionContext | null
): string {
  if (!content || typeof content !== 'string') return content
  const rules = getResolvedRules(scriptType)
  type MarkerHit = { index: number; rule: VisualSegmentRule }
  const hits: MarkerHit[] = []
  for (const rule of rules) {
    const idx = content.indexOf(rule.startMarker)
    if (idx !== -1) hits.push({ index: idx, rule })
  }
  hits.sort((a, b) => a.index - b.index)

  type Insert = { afterIndex: number; text: string }
  const inserts: Insert[] = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index
    const end = i + 1 < hits.length ? hits[i + 1].index : content.length
    const segmentText = content.slice(start, end)
    const action = resolveVisualAction(hits[i].rule.visualAction, context ?? undefined, {
      rule: hits[i].rule,
      segmentText,
    })
    if (!action) continue
    const afterMarker = hits[i].index + hits[i].rule.startMarker.length
    const nextNewline = content.indexOf('\n', afterMarker)
    const afterIndex = nextNewline === -1 ? content.length : nextNewline + 1
    inserts.push({ afterIndex, text: `\n${VISUAL_SUGGESTION_PREFIX}${action}\n\n` })
  }
  if (inserts.length === 0) return content
  inserts.sort((a, b) => b.afterIndex - a.afterIndex)
  let result = content
  for (const { afterIndex, text } of inserts) {
    result = result.slice(0, afterIndex) + text + result.slice(afterIndex)
  }
  return result
}
