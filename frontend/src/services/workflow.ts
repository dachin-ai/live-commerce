import api from './api'

export interface RoundSummary {
  roundId: string
  roundLabel: string
}

export interface TriggerResult {
  roundId: string
  roundLabel: string
  completedRoles: string[]
  currentRoleIndex: number
  error?: string
}

export interface RoundDetail {
  roundId: string
  roundLabel: string
  checkpoints: { role_id: string; status: string; payload: string | null; updated_at: string }[]
  manifest: {
    roundLabel: string
    entries: { roleId: string; files: string[]; summary?: string; collectedAt: string }[]
    updatedAt: string
  }
}

export async function triggerWorkflow(options?: {
  roundId?: string
  roundLabel?: string
  resumeFromRoleIndex?: number
}): Promise<TriggerResult> {
  const data = await api.post('/workflow/trigger', options || {})
  return data as unknown as TriggerResult
}

export async function listRounds(): Promise<RoundSummary[]> {
  const data = await api.get('/workflow/rounds')
  return (data as unknown as RoundSummary[]) || []
}

export async function getRoundDetail(roundId: string): Promise<RoundDetail> {
  const data = await api.get(`/workflow/rounds/${encodeURIComponent(roundId)}`)
  return data as unknown as RoundDetail
}

/** 带鉴权获取产出文件内容（用于文档预览，避免直接链接导致未登录） */
export async function getOutputFileContent(roundLabel: string, filePath: string): Promise<{ content?: string } | Record<string, unknown>> {
  const res = await api.get<{ content?: string } | Record<string, unknown>>('/workflow/outputs/file', {
    params: { roundLabel, path: filePath },
  })
  return res as { content?: string } | Record<string, unknown>
}
