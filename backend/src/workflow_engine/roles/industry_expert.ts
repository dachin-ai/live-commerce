import type { WorkflowContext, RoleOutput } from '../types'
import * as outputCollector from '../output_collector'

/** 行业专家：基于规划师主题与路线图，输出电商直播最佳实践 JSON */
export async function runIndustryExpert(context: WorkflowContext): Promise<RoleOutput> {
  // 读取规划师在本轮已产出的文件
  const themeContent = outputCollector.readRoundFileContent(context.roundLabel, '主题.md') || ''
  const roadmapContent = outputCollector.readRoundFileContent(context.roundLabel, '路线图.md') || ''
  
  // 如果读取失败，尝试从 previousOutputPaths 获取路径（断点续跑场景）
  const plannerPath = context.previousOutputPaths['planner']
  const themeContentAlt = themeContent || (plannerPath ? outputCollector.readRoundFileContent(context.roundLabel, plannerPath) || '' : '')
  
  const basedOn = (themeContent || themeContentAlt || roadmapContent) ? { 
    basedOnTheme: (themeContent || themeContentAlt).slice(0, 300), 
    basedOnRoadmap: roadmapContent.slice(0, 300) 
  } : undefined

  const practices = {
    roundLabel: context.roundLabel,
    generatedAt: new Date().toISOString(),
    ...(basedOn && { inputSummary: basedOn }),
    practices: [
      { 
        area: '话术', 
        recommendation: themeContent.includes('转化率') ? '开场 30 秒强调核心优惠，结合转化率优化目标' : '开场 30 秒强调核心优惠', 
        priority: 'high',
        ...(themeContent && { source: '基于规划师主题' })
      },
      { 
        area: '互动', 
        recommendation: roadmapContent.includes('A/B') ? '每 10 分钟设置一次互动环节，配合 A/B 测试框架' : '每 10 分钟设置一次互动环节', 
        priority: 'high',
        ...(roadmapContent && { source: '基于规划师路线图' })
      },
      { area: '商品展示', recommendation: '高转化商品前置', priority: 'medium' },
    ],
  }
  const content = JSON.stringify(practices, null, 2)
  return {
    roleId: 'industry_expert',
    files: [{ path: '行业最佳实践.json', content }],
    summary: '行业专家产出：基于规划师主题与路线图的结构化最佳实践方案',
  }
}
