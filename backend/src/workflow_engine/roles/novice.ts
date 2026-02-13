import type { WorkflowContext, RoleOutput } from '../types'
import * as outputCollector from '../output_collector'

/** 小白：基于当轮全部产出提问暴露盲点，输出疑问库 */
export async function runNovice(context: WorkflowContext): Promise<RoleOutput> {
  const theme = outputCollector.readRoundFileContent(context.roundLabel, '主题.md')
  const roadmap = outputCollector.readRoundFileContent(context.roundLabel, '路线图.md')
  const practices = outputCollector.readRoundFileContent(context.roundLabel, '行业最佳实践.json')
  const report = outputCollector.readRoundFileContent(context.roundLabel, '用户体验测试报告.md')
  const ab = outputCollector.readRoundFileContent(context.roundLabel, 'AB测试建议.md')
  const plan = outputCollector.readRoundFileContent(context.roundLabel, '技术实施方案.md')
  const refs = [theme && '主题', roadmap && '路线图', practices && '行业方案', report && '体验报告', ab && 'A/B建议', plan && '技术方案'].filter(Boolean)

  const questions = `# 疑问库\n\n轮次：${context.roundLabel}\n\n## 基于本轮产出\n${refs.length > 0 ? `本轮已产出：${refs.join('、')}` : '（暂无产出）'}\n\n## 问题清单\n${refs.includes('主题') || refs.includes('路线图') ? '1. 数据采集频率如何设置？（规划师路线图中提到数据基础强化）\n' : '1. 数据采集频率如何设置？\n'}${refs.includes('A/B 测试建议') ? '2. A/B 测试流量分配比例建议？（结合资深用户的 A/B 建议）\n' : '2. A/B 测试流量分配比例建议？\n'}3. 部署回滚流程是否就绪？${refs.includes('技术方案') ? '（程序工程师的技术方案中是否包含回滚步骤？）' : ''}`
  return {
    roleId: 'novice',
    files: [{ path: '疑问库.md', content: questions }],
    summary: '小白产出：基于当轮产出的疑问库与潜在优化点',
  }
}
