/**
 * 目标人群解析（功能代码内）：将用户输入的「目标人群」转化为话术可用的称呼与痛点
 * 从 config/script-rules/audienceKeywords.json 加载，缺省使用本文件内置默认值
 */

import { loadAudienceKeywords } from './loadScriptRulesConfig'

export interface AnalyzedAudience {
  /** 话术中的自然称呼（用于「有多少XXX」「XXX们」等） */
  addressTerm: string
  /** 从人群推导的痛点/需求短语（用于「遇到过XXX问题」「想要XXX」等） */
  painPointsHint: string
  /** 简短标签，仅用于内部或数据参考，不直接进话术正文 */
  label: string
}

/** 内置默认：人群关键词 → 称呼与痛点（配置缺失时使用） */
const BUILTIN_RULES: Array<{ keywords: string[]; addressTerm: string; painPointsHint: string; label: string }> = [
  { keywords: ['多猫家庭', '多猫', '好几只猫', '多只猫'], addressTerm: '家里好几只主子的铲屎官们', painPointsHint: '多只猫的卫生、空间不好管理，笼子要耐用又好清洁', label: '多猫家庭' },
  { keywords: ['资深中产', '中产', '品质', '讲究'], addressTerm: '注重品质的家人们', painPointsHint: '既要品质靠谱又要省心耐用', label: '品质型用户' },
  { keywords: ['铲屎官', '养宠', '养猫', '养狗', '宠物'], addressTerm: '养宠的家人们', painPointsHint: '主子的健康与卫生、用品耐用好打理', label: '养宠用户' },
  { keywords: ['宝妈', '妈妈', '母婴', '带娃'], addressTerm: '宝妈们', painPointsHint: '孩子用的要安全、省心、好用', label: '宝妈' },
  { keywords: ['25-45岁女性', '女性', '姐妹'], addressTerm: '姐妹们', painPointsHint: '好用、好看、性价比', label: '女性用户' },
  { keywords: ['学生', '年轻人', '学生党'], addressTerm: '同学们', painPointsHint: '实惠、好用、不踩雷', label: '年轻用户' },
  { keywords: ['白领', '上班族', '忙碌'], addressTerm: '上班族家人们', painPointsHint: '省时省心、品质稳定', label: '上班族' },
  { keywords: ['银发', '老年', '中老年'], addressTerm: '叔叔阿姨们', painPointsHint: '简单好用、安全放心', label: '中老年' },
]

const DEFAULT_AUDIENCE: AnalyzedAudience = {
  addressTerm: '家人们',
  painPointsHint: '好用、实惠、品质靠谱',
  label: '通用',
}

function getAudienceRules(): typeof BUILTIN_RULES {
  const config = loadAudienceKeywords()
  if (config?.rules?.length) return config.rules
  return BUILTIN_RULES
}

function getDefaultAudience(): AnalyzedAudience {
  const config = loadAudienceKeywords()
  if (config?.defaultAudience) {
    const d = config.defaultAudience as Record<string, unknown>
    return {
      addressTerm: (d.addressTerm as string) ?? DEFAULT_AUDIENCE.addressTerm,
      painPointsHint: (d.painPointsHint as string) ?? DEFAULT_AUDIENCE.painPointsHint,
      label: (d.label as string) ?? DEFAULT_AUDIENCE.label,
    }
  }
  return DEFAULT_AUDIENCE
}

/**
 * 解析目标人群文案，产出话术可用的称呼与痛点
 * 不直接使用 raw 进话术，避免「资深中产、多猫家庭」等生硬照搬
 */
export function analyzeTargetAudience(
  raw?: string | null,
  productContext?: { productName?: string; features?: string }
): AnalyzedAudience {
  if (!raw || typeof raw !== 'string') return DEFAULT_AUDIENCE
  const text = raw.trim()
  if (!text) return DEFAULT_AUDIENCE

  const lower = text.toLowerCase()
  const segments = text.split(/[,，、；;]\s*/).map((s) => s.trim()).filter(Boolean)
  const rules = getAudienceRules()
  const defaultAudience = getDefaultAudience()

  let addressTerm = defaultAudience.addressTerm
  let painPointsHint = defaultAudience.painPointsHint
  const labels: string[] = []

  for (const rule of rules) {
    const matched = rule.keywords.some(
      (k) => lower.includes(k.toLowerCase()) || segments.some((s) => s.includes(k))
    )
    if (matched) {
      labels.push(rule.label)
      if (addressTerm === defaultAudience.addressTerm) {
        addressTerm = rule.addressTerm
        painPointsHint = rule.painPointsHint
      } else {
        painPointsHint = [painPointsHint, rule.painPointsHint].filter(Boolean).join('；') || painPointsHint
      }
    }
  }

  const isPetProduct =
    productContext?.productName &&
    /猫|狗|宠|笼|碗|粮|砂|窝/.test(productContext.productName)
  if (isPetProduct && (lower.includes('猫') || lower.includes('宠') || lower.includes('多猫'))) {
    if (addressTerm === defaultAudience.addressTerm) {
      addressTerm = '家里养主子的铲屎官们'
      painPointsHint = '主子的卫生和健康、用品好清洁耐用'
    }
    if (addressTerm.includes('铲屎官') && !addressTerm.includes('好几只')) {
      if (lower.includes('多猫') || lower.includes('多只')) {
        addressTerm = '家里好几只主子的铲屎官们'
        painPointsHint = '多只猫的卫生和空间、笼子要耐用又好清洁'
      }
    }
  }

  return {
    addressTerm,
    painPointsHint,
    label: labels.length > 0 ? labels.join('、') : '通用',
  }
}
