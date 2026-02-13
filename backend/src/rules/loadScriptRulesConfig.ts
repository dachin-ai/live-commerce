/**
 * 话术规则配置加载：从 config/script-rules/*.json 读取，供功能代码使用
 * 配置文件缺失时使用各规则模块内置默认值
 */

import fs from 'fs'
import path from 'path'

const CONFIG_DIR =
  process.env.SCRIPT_RULES_CONFIG_DIR ||
  path.join(process.cwd(), 'config', 'script-rules')

function readJson<T>(filename: string): T | null {
  try {
    const filepath = path.join(CONFIG_DIR, filename)
    if (!fs.existsSync(filepath)) return null
    const raw = fs.readFileSync(filepath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(filename: string, data: unknown): boolean {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
    const filepath = path.join(CONFIG_DIR, filename)
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/** 平台合规配置结构（与 platformCompliance 一致） */
export interface PlatformComplianceConfig {
  [platformId: string]: {
    platformName: string
    bannedWords: string[]
    cautionWords: string[]
    violationTypes: string[]
    styleTips: string[]
    categoryExtra?: Record<string, { banned?: string[]; caution?: string[] }>
  }
}

/** 人群关键词配置结构 */
export interface AudienceKeywordsConfig {
  defaultAudience: { addressTerm: string; painPointsHint: string; label: string }
  rules: Array<{
    keywords: string[]
    addressTerm: string
    painPointsHint: string
    label: string
  }>
}

/** 品类实践配置结构 */
export interface CategoryPracticesConfig {
  [category: string]: string
}

/** 卖点→演示动作映射（供 JSON 配置）；根据实际话术中出现的关键词匹配，设计对应可视化动作 */
export interface FeatureDemoHintConfig {
  keywords: string[]
  suggestion: string
}

/** 单条可视化分段规则（供 JSON 配置） */
export interface VisualSegmentRuleConfig {
  id: string
  label: string
  color: string
  startMarker: string
  visualAction?: string
  allowFeatureDemos?: boolean
}

/** 可视化分段规则配置；缺项使用代码内置默认值 */
export interface VisualSegmentRulesConfig {
  placeholderFallbacks?: {
    productName?: string
    features?: string
    promoCopy?: string
    targetAudience?: string
  }
  /** 卖点关键词→演示动作；根据实际话术抓取到的卖点与此处关键词匹配，设计对应可视化动作。内置仅为举例，实际应由业务配置 */
  featureDemoHints?: FeatureDemoHintConfig[]
  defaultPartColor?: string
  rulesByType?: Record<string, VisualSegmentRuleConfig[]>
}

/** 默认话术用语配置：避免硬编码具体数字/时间，确保终端用户收到的内容与规则一致（不货不对板） */
export interface DefaultScriptPhrasesConfig {
  /** 未填写价格时使用的占位表述（不展示虚假具体价格） */
  noPricePlaceholder?: Record<string, string>
  /** 未填写营销方案时的赠品/福利泛化句（替代“68元”“98元”等） */
  defaultGiftLine?: Record<string, string>
  /** 未填写时的限时/截止泛化句（替代“今晚12点”等） */
  defaultDeadlineLine?: Record<string, string>
  /** 未填写营销方案时的利益点/逼单泛化句 */
  defaultPromoLine?: Record<string, string>
  /** 互动话术中的“名额”泛化句（替代“前50名”） */
  interactionRankHint?: Record<string, string>
}

export function loadPlatformCompliance(): PlatformComplianceConfig | null {
  return readJson<PlatformComplianceConfig>('platformCompliance.json')
}

export function loadAudienceKeywords(): AudienceKeywordsConfig | null {
  return readJson<AudienceKeywordsConfig>('audienceKeywords.json')
}

export function loadCategoryPractices(): CategoryPracticesConfig | null {
  return readJson<CategoryPracticesConfig>('categoryPractices.json')
}

export function savePlatformCompliance(data: PlatformComplianceConfig): boolean {
  return writeJson('platformCompliance.json', data)
}

export function saveAudienceKeywords(data: AudienceKeywordsConfig): boolean {
  return writeJson('audienceKeywords.json', data)
}

export function saveCategoryPractices(data: CategoryPracticesConfig): boolean {
  return writeJson('categoryPractices.json', data)
}

export function loadVisualSegmentRules(): VisualSegmentRulesConfig | null {
  return readJson<VisualSegmentRulesConfig>('visualSegmentRules.json')
}

export function loadDefaultScriptPhrases(): DefaultScriptPhrasesConfig | null {
  return readJson<DefaultScriptPhrasesConfig>('defaultScriptPhrases.json')
}

const BUILTIN_DEFAULT_PHRASES: Required<DefaultScriptPhrasesConfig> = {
  noPricePlaceholder: { 'zh-CN': '超值价', 'en-US': 'amazing price', 'th-TH': 'ราคาพิเศษ' },
  defaultGiftLine: {
    'zh-CN': '今天下单还有超值大礼包、配套赠品，具体以直播间/详情页为准！',
    'en-US': 'Order today and get a free gift pack - see livestream or product page for details!',
    'th-TH': 'สั่งวันนี้ได้ของแถมฟรี รายละเอียดดูในไลฟ์หรือหน้ารายละเอียดสินค้า!',
  },
  defaultDeadlineLine: {
    'zh-CN': '活动限时，结束即恢复原价，欲购从速！',
    'en-US': 'Limited time - price goes back up when the deal ends. Get yours now!',
    'th-TH': 'จำกัดเวลา ราคากลับเป็นปกติเมื่อโปรจบ รีบสั่งเลย!',
  },
  defaultPromoLine: {
    'zh-CN': '还有超值福利，活动结束即恢复原价！',
    'en-US': 'Plus extra value - back to full price when the deal ends!',
    'th-TH': 'และยังมีของแถมคุ้มค่า ราคาเต็มเมื่อโปรจบ!',
  },
  interactionRankHint: {
    'zh-CN': '先到先得，手慢无！',
    'en-US': 'First come, first served!',
    'th-TH': 'มาก่อนได้ก่อน!',
  },
}

/** 按语言取默认话术用语（配置优先，缺省用内置），确保不输出虚假具体数字 */
export function getDefaultScriptPhrasesForLang(lang: string): Required<DefaultScriptPhrasesConfig> {
  const config = loadDefaultScriptPhrases()
  const norm = lang === 'zh-CN' || lang === 'en-US' || lang === 'th-TH' ? lang : 'zh-CN'
  const pick = <K extends keyof DefaultScriptPhrasesConfig>(key: K): Record<string, string> =>
    (config?.[key] as Record<string, string> | undefined) ?? BUILTIN_DEFAULT_PHRASES[key]
  return {
    noPricePlaceholder: pick('noPricePlaceholder'),
    defaultGiftLine: pick('defaultGiftLine'),
    defaultDeadlineLine: pick('defaultDeadlineLine'),
    defaultPromoLine: pick('defaultPromoLine'),
    interactionRankHint: pick('interactionRankHint'),
  }
}

/** 取当前语言下某 key 的文案 */
export function getDefaultScriptPhrase(key: keyof DefaultScriptPhrasesConfig, lang: string): string {
  const phrases = getDefaultScriptPhrasesForLang(lang)
  const norm = lang === 'zh-CN' || lang === 'en-US' || lang === 'th-TH' ? lang : 'zh-CN'
  return (phrases[key] as Record<string, string>)[norm] ?? (phrases[key] as Record<string, string>)['zh-CN'] ?? ''
}

export function getConfigDir(): string {
  return CONFIG_DIR
}
