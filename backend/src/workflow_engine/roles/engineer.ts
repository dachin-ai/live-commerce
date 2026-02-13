import type { WorkflowContext, RoleOutput } from '../types'
import * as outputCollector from '../output_collector'
import * as aiCodeGenerator from '../ai_code_generator'

/** 程序工程师：基于行业方案与用户报告/A/B 建议，调用 AI 生成实际代码与部署包 */
export async function runEngineer(context: WorkflowContext): Promise<RoleOutput> {
  const practicesRaw = outputCollector.readRoundFileContent(context.roundLabel, '行业最佳实践.json')
  const reportRaw = outputCollector.readRoundFileContent(context.roundLabel, '用户体验测试报告.md')
  const abRaw = outputCollector.readRoundFileContent(context.roundLabel, 'AB测试建议.md')
  const refs = [
    practicesRaw ? '行业最佳实践' : '',
    reportRaw ? '用户体验测试报告' : '',
    abRaw ? 'A/B 测试建议' : '',
  ].filter(Boolean)

  // 调用 AI 代码生成服务（如果配置了 AI）或使用模板
  let generatedCode: { files: { path: string; content: string }[]; summary: string }
  try {
    generatedCode = await aiCodeGenerator.generateCodeFromUpstream({
      prompt: '',
      context: {
        industryPractices: practicesRaw || undefined,
        userReport: reportRaw || undefined,
        abSuggestions: abRaw || undefined,
        roundLabel: context.roundLabel,
      },
    })
  } catch (err: any) {
    console.error('[程序工程师] AI 代码生成失败，使用基础模板:', err?.message)
    generatedCode = {
      files: [
        { path: 'deploy.sh', content: '#!/bin/bash\necho "部署脚本（模板）"\n' },
        { path: 'README.md', content: `# 部署包\n\n版本：${context.roundLabel}\n\n基础模板（AI 未配置）` },
      ],
      summary: '基础模板（AI 生成失败）',
    }
  }

  // 技术实施方案文档
  const plan = `# 技术实施方案\n\n轮次：${context.roundLabel}\n\n## 依据\n本方案基于以下上游产出制定：\n${refs.length > 0 ? refs.map(r => `- ${r}`).join('\n') : '- 无上游产出'}\n\n## 实施项\n${refs.includes('行业最佳实践') ? '1. 配置更新（实现行业方案中的话术与互动建议）\n' : '1. 配置更新\n'}${refs.includes('A/B 测试建议') ? '2. 脚本与部署包生成（包含 A/B 测试框架集成）' : '2. 脚本与部署包生成'}\n\n## 生成说明\n${generatedCode.summary}`

  // 将所有文件放入部署包目录
  const files: { path: string; content: string }[] = [
    { path: '技术实施方案.md', content: plan },
    ...generatedCode.files.map((f) => ({ path: `部署包/${f.path}`, content: f.content })),
  ]

  return {
    roleId: 'engineer',
    files,
    summary: `程序工程师产出：${generatedCode.summary}，共 ${files.length} 个文件`,
  }
}
