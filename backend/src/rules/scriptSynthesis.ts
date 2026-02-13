/**
 * 话术综合产出：市调 → 模板/LLM → 平台合规 → 最终话术
 * 避免一次性话术，从用户角度出发，形成可复用、实测有效的话术逻辑
 */

import { buildScriptContent } from './scriptPrompts'
import { checkPlatformCompliance } from './platformCompliance'
import type { ScriptResearchResult } from './scriptResearch'

export interface SynthesisResult {
  content: string
  compliancePass: boolean
  complianceWarnings: string[]
  dataSourceNote: string
}

/**
 * 综合产出话术
 * 1. 使用市调上下文（用户输入 + 店铺数据）生成初稿（模板填充；后续可替换为 LLM）
 * 2. 按平台与品类做合规检查
 * 3. 拼接店铺与数据依据说明，并附加合规提示
 */
export function synthesizeScript(research: ScriptResearchResult): SynthesisResult {
  const { userInput, storeContext, platformRule, dataHint } = research
  const platform = storeContext.platform || undefined
  const firstCategory = storeContext.categories?.[0] || undefined

  const { analyzedAudience } = research
  const rawContent = buildScriptContent(userInput.scriptType, userInput.language, {
    productName: userInput.productName,
    productSku: userInput.productSku,
    price: userInput.price,
    features: userInput.features,
    targetAudience: userInput.targetAudience || storeContext.targetAudience || undefined,
    addressTerm: analyzedAudience.addressTerm,
    painPointsHint: analyzedAudience.painPointsHint,
    promoCopy: userInput.promoCopy,
    platform: platform,
  })

  const compliance = checkPlatformCompliance(rawContent, platform, firstCategory)
  const complianceWarnings: string[] = []
  if (compliance.suggestions.length > 0) {
    complianceWarnings.push(...compliance.suggestions)
  }
  if (compliance.cautionHits.length > 0) {
    complianceWarnings.push(`慎用词已出现：${compliance.cautionHits.join('、')}，请确认有依据或人工复核后使用。`)
  }

  let content = rawContent
  const dataSourceNote: string[] = []

  if (storeContext.storeName && storeContext.platform) {
    const categoryPart = storeContext.categories?.length
      ? `（品类：${storeContext.categories.slice(0, 3).join('、')}）`
      : ''
    content = `【基于店铺】${storeContext.storeName}（${storeContext.platform}）${categoryPart}\n${dataHint ? dataHint + '\n\n' : ''}${content}`
    dataSourceNote.push(`店铺：${storeContext.storeName}，平台：${storeContext.platform}`)
  } else if (dataHint) {
    content = `${dataHint}\n\n${content}`
  }
  if (dataHint) dataSourceNote.push('话术已结合店铺品类与近期数据参考生成')

  if (!compliance.pass || complianceWarnings.length > 0) {
    content += '\n\n---\n⚠️ **合规提示**（请人工复核后使用）：\n'
    content += complianceWarnings.join('\n')
    if (platformRule.styleTips[0]) {
      content += `\n平台建议：${platformRule.styleTips[0]}`
    }
  }

  return {
    content,
    compliancePass: compliance.pass,
    complianceWarnings,
    dataSourceNote: dataSourceNote.join('；'),
  }
}
