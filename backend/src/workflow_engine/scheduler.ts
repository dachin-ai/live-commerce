import crypto from 'crypto'
import * as state from './state_manager'
import * as roleDispatcher from './role_dispatcher'

/** Generate next round id and label (e.g. round_1 -> 第1轮迭代) */
export async function nextRoundIdAndLabel(): Promise<{ roundId: string; roundLabel: string }> {
  const lastRound = await state.getCursor('last_round_id')
  let n = 1
  if (lastRound) {
    const match = lastRound.match(/^round_(\d+)$/)
    if (match) n = Math.min(2147483647, parseInt(match[1], 10) + 1)
  }
  const roundId = `round_${n}`
  const roundLabel = `第${n}轮迭代`
  return { roundId, roundLabel }
}

/** Run one round immediately (trigger from API or cron). Optionally pass roundId/roundLabel or resume. */
export async function runOneRound(options?: {
  roundId?: string
  roundLabel?: string
  resumeFromRoleIndex?: number
}): Promise<roleDispatcher.DispatchResult> {
  await state.initStateDatabase()
  const next = await nextRoundIdAndLabel()
  const roundId = options?.roundId ?? next.roundId
  const roundLabel =
    options?.roundLabel ??
    (options?.roundId ? `第${options.roundId.replace('round_', '')}轮迭代` : next.roundLabel)
  return roleDispatcher.dispatchRound({
    roundId,
    roundLabel,
    resumeFromRoleIndex: options?.resumeFromRoleIndex,
  })
}
