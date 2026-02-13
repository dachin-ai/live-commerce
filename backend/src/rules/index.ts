/**
 * 规则模块入口
 * 待办生成、实验设计、教育心理学相关规则均由此导出，形成规则而非一次性判定。
 */
export {
  TASK_GEN_CONFIG,
  ANCHOR_STAGE_RULES,
  getAnchorStageByRules,
  ZPD_RULES,
  SIGNAL_NOISE_RULES,
  ANOMALY_RULES,
} from './task-generation-rules'
export type { AnchorStage } from './task-generation-rules'
