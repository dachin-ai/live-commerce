import type { WorkflowContext, RoleOutput } from '../types'
import { runPlanner } from './planner'
import { runIndustryExpert } from './industry_expert'
import { runSeniorUser } from './senior_user'
import { runEngineer } from './engineer'
import { runNovice } from './novice'
import { WORKFLOW_ROLE_IDS, type WorkflowRoleId } from '../types'

export type RoleRunner = (context: WorkflowContext) => Promise<RoleOutput>

export const roleRunners: Record<WorkflowRoleId, RoleRunner> = {
  planner: runPlanner,
  industry_expert: runIndustryExpert,
  senior_user: runSeniorUser,
  engineer: runEngineer,
  novice: runNovice,
}

export { runPlanner, runIndustryExpert, runSeniorUser, runEngineer, runNovice }
export { WORKFLOW_ROLE_IDS }
