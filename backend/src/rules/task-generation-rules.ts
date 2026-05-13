/**
 * 待办生成规则模块
 * 所有判定逻辑以规则形式集中在此，避免一次性判定、便于维护与 A/B 调整。
 * 修改规则时仅改本文件与规则文档，无需散落修改业务代码。
 *
 * 支持环境变量覆盖：使用 TASK_ 前缀 + 大写驼峰转下划线格式。
 * 例如：TASK_CONVERSION_RATE_MIN=5 覆盖 conversionRateMin 默认值 3。
 */

/** 从环境变量读取数值，未设置或无效时使用默认值 */
function envNum(key: string, defaultVal: number): number {
  const val = process.env[key]
  if (val === undefined || val === '') return defaultVal
  const n = Number(val)
  return isNaN(n) ? defaultVal : n
}

/** 从环境变量读取布尔值 */
function envBool(key: string, defaultVal: boolean): boolean {
  const val = process.env[key]
  if (val === undefined || val === '') return defaultVal
  return val === '1' || val === 'true'
}

// ==================== 规则 1：任务生成阈值（支持环境变量覆盖） ====================

export const TASK_GEN_CONFIG = {
  conversionRateMin: envNum('TASK_CONVERSION_RATE_MIN', 3),
  conversionRateUrgentBelow: envNum('TASK_CONVERSION_RATE_URGENT_BELOW', 1.5),
  conversionRateMinViewers: envNum('TASK_CONVERSION_RATE_MIN_VIEWERS', 100),
  durationMinHours: envNum('TASK_DURATION_MIN_HOURS', 20),
  durationUrgentBelow: envNum('TASK_DURATION_URGENT_BELOW', 15),
  gmvPerHourMin: envNum('TASK_GMV_PER_HOUR_MIN', 5000),
  durationTargetAdd: envNum('TASK_DURATION_TARGET_ADD', 10),
  interactionRateMin: envNum('TASK_INTERACTION_RATE_MIN', 10),
  interactionRateUrgentBelow: envNum('TASK_INTERACTION_RATE_URGENT_BELOW', 5),
  interactionRateMinViewers: envNum('TASK_INTERACTION_RATE_MIN_VIEWERS', 50),
  interactionRateTarget: envNum('TASK_INTERACTION_RATE_TARGET', 15),
  platformInteractionAvg: envNum('TASK_PLATFORM_INTERACTION_AVG', 12),
  avgOrderValueMin: envNum('TASK_AVG_ORDER_VALUE_MIN', 200),
  avgOrderValueMinOrders: envNum('TASK_AVG_ORDER_VALUE_MIN_ORDERS', 10),
  viewersMin: envNum('TASK_VIEWERS_MIN', 500),
  viewersMinDuration: envNum('TASK_VIEWERS_MIN_DURATION', 10),
  viewersUrgentBelow: envNum('TASK_VIEWERS_URGENT_BELOW', 200),
  anomalyFallbackGmvDropRatio: envNum('TASK_ANOMALY_GMV_DROP_RATIO', 0.5),
  anomalyFallbackConversionDropRatio: envNum('TASK_ANOMALY_CONVERSION_DROP_RATIO', 0.7),
  anomalyFallbackViewersDropRatio: envNum('TASK_ANOMALY_VIEWERS_DROP_RATIO', 0.6),
  anomalySigmaMultiplier: envNum('TASK_ANOMALY_SIGMA', 2),
  anomalyMinHistoricalPeriods: envNum('TASK_ANOMALY_MIN_PERIODS', 3),
  enableSingleSessionTasks: envBool('TASK_ENABLE_SINGLE_SESSION', true),
  enableAnchorTasks: envBool('TASK_ENABLE_ANCHOR', true),
}

// ==================== 规则 2：主播能力阶段判定（教育心理学 ZPD） ====================

export type AnchorStage = 'novice' | 'growth' | 'proficient'

/** 主播阶段判定规则：满足任一条件即归入该阶段，按优先级顺序判定 */
export const ANCHOR_STAGE_RULES = {
  /** 新手：场次少或核心指标明显偏低 */
  novice: {
    /** 估算场次 < 此值视为新手（场次 = 总时长/2） */
    maxSessions: 10,
    /** 转化率 < 此值（%）视为新手 */
    maxConversionRate: 2,
    /** 互动率 < 此值（%）视为新手 */
    maxInteractionRate: 5,
    label: '新手',
    zpdHint: '一次一事、一个数字、一个动作，避免术语堆砌',
  },
  /** 熟练：场次多且核心指标接近或超过基准 */
  proficient: {
    /** 估算场次 >= 此值才可能为熟练 */
    minSessions: 30,
    /** 转化率 >= 行业基准 × 此系数 */
    conversionRateFactorVsIndustry: 0.9,
    /** 互动率 >= 此值（%） */
    minInteractionRate: 12,
    label: '熟练',
    zpdHint: '可给策略性建议，仍控制单条长度',
  },
  /** 成长：不满足新手也不满足熟练时的默认阶段 */
  growth: {
    label: '成长',
    zpdHint: '目标+1个关键数+1个核心动作+1个可选动作',
  },
} as const

/**
 * 按规则判定主播能力阶段（规则驱动，非一次性判定）
 */
export function getAnchorStageByRules(
  storeStats: { totalViewers?: number; totalDuration?: number; totalOrders?: number; totalInteractions?: number } | null,
  industryConversionRate: number
): { stage: AnchorStage; label: string; zpdHint: string } {
  const R = ANCHOR_STAGE_RULES
  if (!storeStats) {
    return { stage: 'novice', label: R.novice.label, zpdHint: R.novice.zpdHint }
  }

  const viewers = storeStats.totalViewers || 0
  const duration = storeStats.totalDuration || 0
  const orders = storeStats.totalOrders || 0
  const interactions = storeStats.totalInteractions || 0
  const conversionRate = viewers > 0 ? (orders / viewers) * 100 : 0
  const interactionRate = viewers > 0 ? (interactions / viewers) * 100 : 0
  const estimatedSessions = Math.max(0, Math.floor(duration / 2))

  if (estimatedSessions < R.novice.maxSessions || conversionRate < R.novice.maxConversionRate || interactionRate < R.novice.maxInteractionRate) {
    return { stage: 'novice', label: R.novice.label, zpdHint: R.novice.zpdHint }
  }

  if (
    estimatedSessions >= R.proficient.minSessions &&
    conversionRate >= industryConversionRate * R.proficient.conversionRateFactorVsIndustry &&
    interactionRate >= R.proficient.minInteractionRate
  ) {
    return { stage: 'proficient', label: R.proficient.label, zpdHint: R.proficient.zpdHint }
  }

  return { stage: 'growth', label: R.growth.label, zpdHint: R.growth.zpdHint }
}

// ==================== 规则 3：最近发展区（ZPD）与可懂度 ====================
// 产品侧定义：电商「最近发展区」= 基于店铺当下数据与直播运营逻辑，当下最应投入的运营任务。此处规则侧重可懂度与单条信息量。

/** 每条任务描述的信息量上限（降噪、可懂度） */
export const ZPD_RULES = {
  /** 每条任务最多保留的关键数据个数 */
  maxKeyNumbersPerTask: 2,
  /** 新手：仅 1 个核心动作，0 个可选 */
  noviceMaxActions: 1,
  /** 成长：1 个核心 + 1 个可选 */
  growthMaxActions: 2,
  /** 熟练：建议类表述，仍控制单条长度 */
  proficientMaxActions: 2,
  /** 新手表述结构：一句结论 + 「下一场先做一件事」+ 一个动作 */
  noviceStructure: 'one_goal_then_one_action',
  /** 成长表述结构：目标 + 关键数 + 核心一步 + 可选一步 */
  growthStructure: 'goal_keynumber_core_optional',
  /** 熟练表述结构：目标 + 关键数 + 策略建议 */
  proficientStructure: 'goal_keynumber_advice',
} as const

// ==================== 规则 4：信号与噪音 ====================

/** 描述中允许出现的数据与动作数量（规则化） */
export const SIGNAL_NOISE_RULES = {
  /** 与当前任务目标直接相关的数据视为信号，每条任务最多保留此数量个关键数 */
  maxSignalNumbersPerTask: 2,
  /** 数据来源、行业基准长句不写入正文，仅保留结论性短句 */
  dataSourceInBody: false,
  /** 措施合并为：1 个核心动作 + 0～1 个可选动作 */
  maxCoreActions: 1,
  maxOptionalActions: 1,
} as const

// ==================== 规则 5：异常检测 ====================

/** 异常检测使用的配置（与 TASK_GEN_CONFIG 一致，此处明确为规则） */
export const ANOMALY_RULES = {
  /** 历史期数 >= 此值 + 1 时使用动态阈值（mean - k*std），否则使用兜底比例 */
  minHistoricalPeriodsForDynamic: TASK_GEN_CONFIG.anomalyMinHistoricalPeriods,
  /** 动态阈值：mean - k*std，k 取此值 */
  sigmaMultiplier: TASK_GEN_CONFIG.anomalySigmaMultiplier,
  /** 兜底：GMV 下降超过此比例视为异常 */
  fallbackGmvDropRatio: TASK_GEN_CONFIG.anomalyFallbackGmvDropRatio,
  /** 兜底：转化率下降超过此比例视为异常 */
  fallbackConversionDropRatio: TASK_GEN_CONFIG.anomalyFallbackConversionDropRatio,
  /** 兜底：观看人数下降超过此比例视为异常 */
  fallbackViewersDropRatio: TASK_GEN_CONFIG.anomalyFallbackViewersDropRatio,
} as const
