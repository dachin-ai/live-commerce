import type { WorkflowContext, RoleOutput } from '../types'
import * as outputCollector from '../output_collector'

/** 规划师：制定优化方向，输出季度主题与路线图；若有上一轮则基于上一轮产出做下一轮优化 */
export async function runPlanner(context: WorkflowContext): Promise<RoleOutput> {
  const previousRoundLabel = outputCollector.getPreviousRoundLabel(context.roundLabel)
  let priorTheme = ''
  let priorRoadmap = ''
  if (previousRoundLabel) {
    priorTheme = outputCollector.readRoundFileContent(previousRoundLabel, '主题.md') || ''
    priorRoadmap = outputCollector.readRoundFileContent(previousRoundLabel, '路线图.md') || ''
  }

  const priorBlock =
    priorTheme || priorRoadmap
      ? `\n\n## 上一轮参考（${previousRoundLabel || ''}）\n${priorTheme ? '### 上轮主题摘要\n' + priorTheme.slice(0, 500) + (priorTheme.length > 500 ? '...' : '') : ''}\n${priorRoadmap ? '### 上轮路线图摘要\n' + priorRoadmap.slice(0, 500) + (priorRoadmap.length > 500 ? '...' : '') : ''}\n`
      : ''

  const theme = `# 季度优化主题\n\n轮次：${context.roundLabel}\n时间：${context.updatedAt}\n\n## 本轮聚焦\n直播转化率与时长优化。${previousRoundLabel ? `\n\n**注意：本轮基于 ${previousRoundLabel} 的成果进行延续优化。**` : ''}${priorBlock}`
  const roadmap = `# 路线图\n\n${previousRoundLabel ? `## 延续自 ${previousRoundLabel}\n基于上一轮成果，本轮路线图如下：\n\n` : ''}1. 数据基础强化（多平台采集、目标验证）\n2. 用户体验与 A/B 测试\n3. 技术实施与部署包生成\n4. 疑问与盲点收集${previousRoundLabel ? '\n\n**优化方向：**在上一轮基础上深化数据采集与验证机制，提升 A/B 测试的统计显著性。' : ''}`
  return {
    roleId: 'planner',
    files: [
      { path: '主题.md', content: theme },
      { path: '路线图.md', content: roadmap },
    ],
    summary: `规划师产出：主题与路线图（${context.roundLabel}）${previousRoundLabel ? '，已参考上一轮' : ''}`,
  }
}
