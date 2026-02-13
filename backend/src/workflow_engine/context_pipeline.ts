import * as state from './state_manager'
import type { WorkflowContext } from './types'
import { WORKFLOW_ROLE_IDS, type WorkflowRoleId } from './types'
import { clampInt32 } from './state_manager'

const CURSOR_LAST_ROUND = 'last_round_id'
const CURSOR_ROUND_PREFIX = 'round_'

/** Build WorkflowContext for a round, optionally from checkpoint (for resume) */
export async function loadContext(roundId: string, roundLabel: string, options?: { resumeFromRoleIndex?: number }): Promise<WorkflowContext> {
  const startedAt = new Date().toISOString()
  const previousOutputPaths: Record<string, string> = {}
  let currentRoleIndex = 0

  const checkpoints = await state.getCheckpointsByRound(roundId)
  for (const cp of checkpoints) {
    if (cp.payload) {
      try {
        const p = JSON.parse(cp.payload) as { outputPaths?: Record<string, string> }
        if (p.outputPaths) Object.assign(previousOutputPaths, p.outputPaths)
      } catch {
        // ignore
      }
    }
  }

  const roleIndexFromCursor = await state.getCursor(`${CURSOR_ROUND_PREFIX}${roundId}_role_index`)
  if (roleIndexFromCursor !== '') {
    const n = parseInt(roleIndexFromCursor, 10)
    if (!Number.isNaN(n)) currentRoleIndex = clampInt32(n)
  }
  if (options?.resumeFromRoleIndex !== undefined) {
    currentRoleIndex = clampInt32(options.resumeFromRoleIndex)
  }

  const storeId = await state.getCursor(`${CURSOR_ROUND_PREFIX}${roundId}_store_id`) || null
  const taskIdsStr = await state.getCursor(`${CURSOR_ROUND_PREFIX}${roundId}_task_ids`)
  const taskIds = taskIdsStr ? taskIdsStr.split(',').filter(Boolean) : []

  return {
    roundId,
    roundLabel,
    currentRoleIndex,
    previousOutputPaths,
    storeId,
    taskIds,
    startedAt,
    updatedAt: startedAt,
  }
}

/** Persist context updates to state (cursor for role index, checkpoints for role payloads) */
export async function saveContext(ctx: WorkflowContext, roleId: WorkflowRoleId, status: string, payload?: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString()
  await state.setCursor(CURSOR_LAST_ROUND, ctx.roundId)
  await state.setCursor(`${CURSOR_ROUND_PREFIX}${ctx.roundId}_role_index`, ctx.currentRoleIndex)
  if (ctx.storeId) await state.setCursor(`${CURSOR_ROUND_PREFIX}${ctx.roundId}_store_id`, ctx.storeId)
  if (ctx.taskIds.length > 0) await state.setCursor(`${CURSOR_ROUND_PREFIX}${ctx.roundId}_task_ids`, ctx.taskIds.join(','))
  await state.setCheckpoint(ctx.roundId, roleId, status, payload ? JSON.stringify(payload) : undefined)
}

/** Advance context to next role (increment currentRoleIndex) */
export function advanceToNextRole(ctx: WorkflowContext): WorkflowContext {
  const next = ctx.currentRoleIndex + 1
  const nextIndex = clampInt32(next)
  return {
    ...ctx,
    currentRoleIndex: Math.min(nextIndex, WORKFLOW_ROLE_IDS.length),
    updatedAt: new Date().toISOString(),
  }
}

/** Get current role id from context */
export function getCurrentRoleId(ctx: WorkflowContext): WorkflowRoleId | null {
  if (ctx.currentRoleIndex < 0 || ctx.currentRoleIndex >= WORKFLOW_ROLE_IDS.length) return null
  return WORKFLOW_ROLE_IDS[ctx.currentRoleIndex]
}
