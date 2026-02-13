/**
 * 仪表盘/数据分析页「数据项目」统一配置：重要性排序、默认全选、与用户偏好持久化一致。
 */

export type DataItemType =
  | 'gmv'
  | 'duration'
  | 'viewers'
  | 'interactions'
  | 'orders'
  | 'completedOrders'
  | 'conversion'
  | 'rounds'
  | 'avgWatchDuration'
  | 'gpm'
  | 'timeliness'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'follows'
  | 'productViews'
  | 'productClicks'
  | 'clickThroughRate'
  | 'interactionRate'

/** 按重要性排序的完整数据项列表：核心经营指标 → 场次/时效 → 互动与曝光。默认全选且按此顺序展示。 */
export const DATA_ITEM_IMPORTANCE_ORDER: DataItemType[] = [
  'gmv',
  'duration',
  'viewers',
  'orders',
  'completedOrders',
  'conversion',
  'rounds',
  'timeliness',
  'avgWatchDuration',
  'gpm',
  'interactions',
  'likes',
  'comments',
  'shares',
  'follows',
  'productViews',
  'productClicks',
  'clickThroughRate',
  'interactionRate',
]

const VALID_SET = new Set<DataItemType>(DATA_ITEM_IMPORTANCE_ORDER)

/** 解析用户偏好中保存的 dashboardDataItems，校验类型与至少一项；无效则返回 null。 */
export function parseSavedDataItems(saved: unknown): DataItemType[] | null {
  if (!Array.isArray(saved) || saved.length === 0) return null
  const filtered = saved.filter(
    (v): v is DataItemType => typeof v === 'string' && VALID_SET.has(v as DataItemType)
  )
  if (filtered.length === 0) return null
  return filtered
}
