/** Workflow role IDs in execution order */
export const WORKFLOW_ROLE_IDS = ['planner', 'industry_expert', 'senior_user', 'engineer', 'novice'] as const
export type WorkflowRoleId = (typeof WORKFLOW_ROLE_IDS)[number]

/** Cross-role workflow context */
export interface WorkflowContext {
  roundId: string
  roundLabel: string
  currentRoleIndex: number
  previousOutputPaths: Record<string, string>
  storeId: string | null
  taskIds: string[]
  startedAt: string
  updatedAt: string
}

/** Single role output for output_collector */
export interface RoleOutput {
  roleId: WorkflowRoleId
  files: { path: string; content: string }[]
  summary?: string
}
