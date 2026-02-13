import type { WorkflowContext, RoleOutput } from '../types'
import * as outputCollector from '../output_collector'

/** 资深用户：基于行业专家最佳实践，输出体验测试与 A/B 测试建议 */
export async function runSeniorUser(context: WorkflowContext): Promise<RoleOutput> {
  const practicesRaw = outputCollector.readRoundFileContent(context.roundLabel, '行业最佳实践.json')
  let practicesSummary = ''
  if (practicesRaw) {
    try {
      const p = JSON.parse(practicesRaw) as { practices?: { area: string; recommendation: string }[] }
      practicesSummary = p.practices?.map((x) => `- ${x.area}: ${x.recommendation}`).join('\n') || practicesRaw.slice(0, 400)
    } catch {
      practicesSummary = practicesRaw.slice(0, 400)
    }
  }

  const report = `# 用户体验测试报告\n\n轮次：${context.roundLabel}\n\n## 依据（行业最佳实践摘要）\n${practicesSummary || '（无上游产出）'}\n\n## 测试结论\n基于上述行业方案，测试结论如下：\n- 流程可用性良好\n- 建议增加关键步骤提示${practicesSummary ? '\n- 行业方案中的互动频率建议在实际测试中表现良好' : ''}`
  const abSuggestions = `# A/B 测试建议\n\n${practicesSummary ? '**基于行业最佳实践方案，建议以下 A/B 测试：**\n\n' : ''}1. 标题样式 A/B：短标题 vs 长标题${practicesSummary.includes('话术') ? '（结合话术优化）' : ''}\n2. 开播时间 A/B：19:00 vs 20:00${practicesSummary.includes('互动') ? '（配合互动环节设置）' : ''}\n\n${practicesSummary ? '**说明：**以上建议结合了行业专家提供的实践方案。' : '（结合行业方案制定）'}`
  return {
    roleId: 'senior_user',
    files: [
      { path: '用户体验测试报告.md', content: report },
      { path: 'AB测试建议.md', content: abSuggestions },
    ],
    summary: '资深用户产出：基于行业方案生成体验报告与 A/B 建议',
  }
}
