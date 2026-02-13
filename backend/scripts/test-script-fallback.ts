/**
 * 话术兜底逻辑单测：使用 Coze 提示词且 LLM 返回非空时，必须展示原生内容，不得替换为模板。
 * 运行：cd backend && npx tsx scripts/test-script-fallback.ts
 */

import { resolveScriptContentWithFallback, isLikelyScriptContent } from '../src/services/scriptOutputValidator'

const TEMPLATE_MARKER = '【完整销售流程话术'
const COZE_NATIVE_SAMPLE = '家人们好，今天给大家推荐这款不锈钢猫笼，多猫家庭必备。'

function getTemplateContent(): string {
  return `${TEMPLATE_MARKER}·5-10分钟】\n\n### 可念稿\n\n【环节:圈人群】\n...`
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

console.log('--- 1. useCozePrompts=true 且 content 非空 → 必须保留原生，不兜底 ---')
const r1 = resolveScriptContentWithFallback(COZE_NATIVE_SAMPLE, true, getTemplateContent)
assert(!r1.usedTemplateFallback, 'useCozePrompts=true 且非空时不应兜底')
assert(r1.content === COZE_NATIVE_SAMPLE, 'content 应为 Coze 原生')
assert(!r1.fallbackReason, '不应有 fallbackReason')
console.log('  content 前 50 字:', r1.content.slice(0, 50))
console.log('  usedTemplateFallback:', r1.usedTemplateFallback)
console.log('  OK')

console.log('\n--- 2. useCozePrompts=true 且 content 为空 → 模板兜底 ---')
const r2 = resolveScriptContentWithFallback('', true, getTemplateContent)
assert(r2.usedTemplateFallback === true, '空内容应兜底')
assert(r2.fallbackReason === 'empty', 'fallbackReason 应为 empty')
assert(r2.content.includes(TEMPLATE_MARKER), '应返回模板内容')
console.log('  OK')

console.log('\n--- 3. useCozePrompts=false 且「不像话术」→ 模板兜底 ---')
const reportLike = '## 一、核心发现\n行业趋势分析 2024...'
assert(!isLikelyScriptContent(reportLike), '报告类内容应被判为不像话术')
const r3 = resolveScriptContentWithFallback(reportLike, false, getTemplateContent)
assert(r3.usedTemplateFallback === true, '非话术应兜底')
assert(r3.fallbackReason === 'not_script', 'fallbackReason 应为 not_script')
assert(r3.relevanceWarning != null, '应有 relevanceWarning')
console.log('  OK')

console.log('\n--- 4. useCozePrompts=false 且「像话术」→ 保留原文 ---')
const scriptLike = '家人们，这款不锈钢猫笼多猫家庭必备，扣1上车。'
assert(isLikelyScriptContent(scriptLike), '应判为像话术')
const r4 = resolveScriptContentWithFallback(scriptLike, false, getTemplateContent)
assert(!r4.usedTemplateFallback, '像话术不应兜底')
assert(r4.content === scriptLike, '应保留原文')
console.log('  OK')

console.log('\n--- 全部通过：使用 Coze 且非空时必展示原生内容 ---')
