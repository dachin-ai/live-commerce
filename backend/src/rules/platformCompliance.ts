/**
 * 各平台直播带货违规点与合规规则（功能代码内）
 * 从 config/script-rules/platformCompliance.json 加载，缺省使用本文件内置默认值
 */

import { loadPlatformCompliance } from './loadScriptRulesConfig'

export interface PlatformComplianceRule {
  platformId: string
  platformName: string
  bannedWords: string[]
  cautionWords: string[]
  violationTypes: string[]
  styleTips: string[]
  categoryExtra?: Record<string, { banned?: string[]; caution?: string[] }>
}

/** 各平台违规点与合规规则（可配置、可迭代） */
export const PLATFORM_COMPLIANCE: Record<string, PlatformComplianceRule> = {
  douyin: {
    platformId: 'douyin',
    platformName: '抖音/抖音电商',
    bannedWords: [
      '全网最低', '史上最低', '第一', '最好', '最佳', '100%', '绝对', '根治', '疗效', '治疗', '药效', '医用',
      '假一赔十', '无效退款', '秒杀一切', '无敌', '零风险', '保证见效', '永久', '国家级', '顶级',
      '点击领红包', '加微信', '私信送', '转场其他平台',
      '返现补差', '邀好评', '好评返现', '晒单返现',
    ],
    cautionWords: [
      '最低价', '最便宜', '性价比之王', '销量第一', '行业第一', '领先', '顶尖',
      '美白', '祛斑', '抗衰', '防脱', '减肥', '丰胸', '增高', '提高免疫力',
    ],
    violationTypes: [
      '虚假宣传（功效、价格、销量）',
      '绝对化用语',
      '医疗/药品暗示',
      '诱导站外交易',
      '违禁品/仿品',
    ],
    styleTips: [
      '价格表述需有依据（如「活动价」「直播间专享价」），避免无依据的「最低」',
      '功效类需有备案或检测报告支撑，避免医疗化表述',
      '多用「很多用户反馈」「个人体验」等主观表述，少用绝对化结论',
      '互动话术自然，避免诱导点赞、关注、私信等话术模板化',
    ],
    categoryExtra: {
      '美妆个护': { caution: ['美白', '祛斑', '抗衰', '除皱', '消炎'] },
      '保健食品': { banned: ['治疗', '疗效', '治病', '预防疾病'], caution: ['增强免疫力', '改善体质'] },
      '母婴': { caution: ['替代母乳', '治疗', '药用'] },
      '食品': { banned: ['治病', '疗效', '药用'], caution: ['保健', '养生'] },
    },
  },
  taobao: {
    platformId: 'taobao',
    platformName: '淘宝/淘宝直播',
    bannedWords: [
      '全网最低价', '史上最低', '第一', '最好', '最佳', '100%', '绝对', '根治', '疗效', '治疗', '药效',
      '假一赔十', '无效退款', '秒杀一切', '零风险', '保证见效', '永久', '国家级', '顶级',
      '微信', 'QQ', '加我', '转场',
      '返现补差', '邀好评', '好评返现', '晒单返现',
    ],
    cautionWords: [
      '最低价', '最便宜', '销量第一', '行业第一', '领先', '顶尖',
      '美白', '祛斑', '抗衰', '防脱', '减肥', '丰胸', '增高',
    ],
    violationTypes: [
      '虚假宣传（功效、价格、销量）',
      '绝对化用语',
      '医疗/药品暗示',
      '引导站外交易',
      '价格欺诈（虚构原价）',
    ],
    styleTips: [
      '原价需真实存在或标注「划线价仅供参考」',
      '促销需明确时间、数量、规则',
      '功效宣称需与商品详情页、备案一致',
      '避免「全网最低」等无依据比价',
    ],
    categoryExtra: {
      '保健食品': { banned: ['治疗', '疗效', '治病'], caution: ['增强免疫力'] },
      '化妆品': { caution: ['美白', '祛斑', '抗衰', '除皱'] },
    },
  },
  kuaishou: {
    platformId: 'kuaishou',
    platformName: '快手/快手电商',
    bannedWords: [
      '全网最低', '史上最低', '第一', '最好', '最佳', '100%', '绝对', '根治', '疗效', '治疗', '药效',
      '假一赔十', '无效退款', '秒杀一切', '零风险', '保证见效', '永久', '国家级', '顶级',
      '加微信', '私信', '转场',
      '返现补差', '邀好评', '好评返现', '晒单返现',
    ],
    cautionWords: [
      '最低价', '最便宜', '销量第一', '行业第一', '领先', '顶尖',
      '美白', '祛斑', '抗衰', '防脱', '减肥',
    ],
    violationTypes: ['虚假宣传', '绝对化用语', '医疗/药品暗示', '诱导站外'],
    styleTips: [
      '老铁文化可保留，但避免过度承诺与绝对化',
      '价格与活动规则需清晰、可验证',
    ],
    categoryExtra: {},
  },
  tiktok: {
    platformId: 'tiktok',
    platformName: 'TikTok / TikTok Shop',
    bannedWords: [
      'best in the world', 'number one', '100%', 'guaranteed cure', 'medical treatment', 'heal', 'treat disease',
      'fake price', 'fabricated', 'miracle', 'zero risk', 'permanent', 'national level', 'top',
      'add me on WeChat', 'DM me', 'go to other platform',
    ],
    cautionWords: [
      'lowest price', 'cheapest', 'best seller', 'no.1', 'leading', 'top',
      'whitening', 'anti-aging', 'weight loss', 'hair growth',
    ],
    violationTypes: ['False advertising', 'Absolute claims', 'Medical/drug claims', 'Off-platform inducement'],
    styleTips: [
      'Price claims must be verifiable; avoid "lowest price" without proof.',
      'Localize script per region (e.g. Thailand, US); avoid direct translation of CN banned words only.',
      'Respect local ad laws and platform policies per market.',
    ],
    categoryExtra: {},
  },
  wechat: {
    platformId: 'wechat',
    platformName: '微信视频号/微信直播',
    bannedWords: [
      '全网最低', '史上最低', '第一', '最好', '最佳', '100%', '绝对', '根治', '疗效', '治疗', '药效',
      '假一赔十', '无效退款', '秒杀一切', '零风险', '保证见效', '永久', '国家级', '顶级',
      '加QQ', '转场淘宝', '转场抖音',
      '返现补差', '邀好评', '好评返现', '晒单返现',
    ],
    cautionWords: [
      '最低价', '最便宜', '销量第一', '行业第一', '领先', '顶尖',
      '美白', '祛斑', '抗衰', '防脱', '减肥',
    ],
    violationTypes: ['虚假宣传', '绝对化用语', '医疗/药品暗示', '诱导至其他平台'],
    styleTips: [
      '与微信生态一致，避免诱导分享、诱导关注等违规话术',
      '价格与活动需真实、可追溯',
    ],
    categoryExtra: {},
  },
  default: {
    platformId: 'default',
    platformName: '通用',
    bannedWords: [
      '全网最低', '史上最低', '第一', '最好', '最佳', '100%', '绝对', '根治', '疗效', '治疗', '药效',
      '假一赔十', '无效退款', '秒杀一切', '零风险', '保证见效', '永久', '国家级', '顶级',
      '返现补差', '邀好评',
    ],
    cautionWords: [
      '最低价', '最便宜', '销量第一', '行业第一', '领先', '顶尖',
      '美白', '祛斑', '抗衰', '防脱', '减肥',
      '好评返现', '晒单返现',
    ],
    violationTypes: ['虚假宣传', '绝对化用语', '医疗/药品暗示'],
    styleTips: [
      '从用户角度出发，话术可复用、可迭代，避免一次性夸张承诺',
      '价格与功效表述需有依据，实测有效',
    ],
    categoryExtra: {},
  },
}

const PLATFORM_ALIAS: Record<string, string> = {
  '抖音': 'douyin',
  '抖音电商': 'douyin',
  douyin: 'douyin',
  '淘宝': 'taobao',
  '淘宝直播': 'taobao',
  taobao: 'taobao',
  '快手': 'kuaishou',
  '快手电商': 'kuaishou',
  kuaishou: 'kuaishou',
  tiktok: 'tiktok',
  'TikTok': 'tiktok',
  'TikTok Shop': 'tiktok',
  '微信': 'wechat',
  '视频号': 'wechat',
  wechat: 'wechat',
}

export function resolvePlatform(platformName?: string | null): string {
  if (!platformName || typeof platformName !== 'string') return 'default'
  const normalized = platformName.trim()
  return PLATFORM_ALIAS[normalized] ?? 'default'
}

/** 平台是否禁止口播/诱导「晒单返现」「好评返现」等（合规风险，多数主流平台禁止） */
export function platformDisallowsReviewCashback(platformName?: string | null): boolean {
  const id = resolvePlatform(platformName)
  return id === 'douyin' || id === 'taobao' || id === 'kuaishou' || id === 'wechat' || id === 'tiktok'
}

function getPlatformRuleById(platformId: string): PlatformComplianceRule {
  const loaded = loadPlatformCompliance()
  const entry = loaded?.[platformId]
  if (entry) {
    return {
      platformId,
      platformName: entry.platformName,
      bannedWords: entry.bannedWords ?? [],
      cautionWords: entry.cautionWords ?? [],
      violationTypes: entry.violationTypes ?? [],
      styleTips: entry.styleTips ?? [],
      categoryExtra: entry.categoryExtra ?? {},
    }
  }
  return PLATFORM_COMPLIANCE[platformId] ?? PLATFORM_COMPLIANCE.default
}

/** 根据平台与品类获取合规规则（供市调与产出使用） */
export function getPlatformCompliance(platformName?: string | null, category?: string | null): PlatformComplianceRule {
  const platformId = resolvePlatform(platformName)
  const base = getPlatformRuleById(platformId)
  if (!category || !base.categoryExtra?.[category]) return base
  const extra = base.categoryExtra[category]
  return {
    ...base,
    bannedWords: [...base.bannedWords, ...(extra.banned || [])],
    cautionWords: [...base.cautionWords, ...(extra.caution || [])],
  }
}

export interface ComplianceResult {
  pass: boolean
  bannedHits: string[]
  cautionHits: string[]
  suggestions: string[]
}

/** 合规检查：扫描内容，返回违规与慎用提示（供综合产出后过滤或标注） */
export function checkPlatformCompliance(
  content: string,
  platformName?: string | null,
  category?: string | null
): ComplianceResult {
  const rule = getPlatformCompliance(platformName, category)
  const bannedHits: string[] = []
  const cautionHits: string[] = []
  for (const word of rule.bannedWords) {
    if (content.includes(word)) bannedHits.push(word)
  }
  for (const word of rule.cautionWords) {
    if (content.includes(word)) cautionHits.push(word)
  }
  const suggestions: string[] = []
  if (bannedHits.length > 0) {
    suggestions.push(`检测到禁用词：${bannedHits.join('、')}，请修改后再使用。`)
  }
  if (cautionHits.length > 0) {
    suggestions.push(`检测到慎用词：${cautionHits.join('、')}，请确认有依据或人工复核。`)
  }
  if (rule.styleTips.length > 0 && (bannedHits.length > 0 || cautionHits.length > 0)) {
    suggestions.push(`平台建议：${rule.styleTips[0]}`)
  }
  return {
    pass: bannedHits.length === 0,
    bannedHits,
    cautionHits,
    suggestions,
  }
}
