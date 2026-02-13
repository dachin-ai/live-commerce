import path from 'path'
import * as contextPipeline from './context_pipeline'
import * as outputCollector from './output_collector'
import { roleRunners } from './roles'
import { WORKFLOW_ROLE_IDS, type WorkflowRoleId } from './types'
import type { WorkflowContext } from './types'

export interface DispatchResult {
  roundId: string
  roundLabel: string
  completedRoles: WorkflowRoleId[]
  currentRoleIndex: number
  error?: string
}

/** Run one round: load context, execute roles in order, collect outputs, save checkpoints */
export async function dispatchRound(options: {
  roundId: string
  roundLabel: string
  resumeFromRoleIndex?: number
}): Promise<DispatchResult> {
  const { roundId, roundLabel, resumeFromRoleIndex } = options
  const ctx = await contextPipeline.loadContext(roundId, roundLabel, { resumeFromRoleIndex })
  const completedRoles: WorkflowRoleId[] = []

  for (let i = ctx.currentRoleIndex; i < WORKFLOW_ROLE_IDS.length; i++) {
    const roleId = WORKFLOW_ROLE_IDS[i]
    const runner = roleRunners[roleId]
    if (!runner) continue

    try {
      console.log(`[工作流] 执行角色: ${roleId} (${roundLabel})`)
      const output = await runner(ctx)
      const collected = outputCollector.collectRoleOutput(roundLabel, output)
      const paths = collected.filter((c) => c.written).map((c) => c.path)
      outputCollector.appendToManifest(roundLabel, output, paths)
      
      // 更新上下文中的产出路径，供下游角色读取
      for (const p of paths) {
        ctx.previousOutputPaths[`${roleId}_${path.basename(p)}`] = p
      }
      ctx.previousOutputPaths[roleId] = paths[0] ?? roleId
      
      await contextPipeline.saveContext(ctx, roleId, 'completed', {
        outputPaths: ctx.previousOutputPaths,
      })
      completedRoles.push(roleId)
      console.log(`[工作流] 角色 ${roleId} 完成，产出文件: ${paths.join(', ')}`)
      Object.assign(ctx, contextPipeline.advanceToNextRole(ctx))
    } catch (err: any) {
      await contextPipeline.saveContext(ctx, roleId, 'failed', { error: err?.message })
      return {
        roundId,
        roundLabel,
        completedRoles,
        currentRoleIndex: i,
        error: err?.message ?? 'Unknown error',
      }
    }
  }

  return {
    roundId,
    roundLabel,
    completedRoles,
    currentRoleIndex: WORKFLOW_ROLE_IDS.length,
  }
}
