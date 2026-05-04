/**
 * @deprecated 本文件已重构为以下子模块（路径: services/ai/）：
 *   - statsAnalysis.ts  - DB数据聚合、趋势分析、异常检测、动态阈值
 *   - dataBenchmarks.ts - 行业基准、时段推荐、成长阶段、规则任务
 *   - eventsCalendar.ts - 节假日、节日提醒、季节/气温上下文
 *   - todoGenerator.ts  - LLM调用、JSON修复、角色标注、主生成函数
 *
 * 此文件保留为 re-export barrel，保持所有现有 import 路径的兼容性。
 * 新代码请直接从以上子模块或 './ai' 导入。
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- keep for barrel sanity check
export * from './ai/statsAnalysis'
export * from './ai/dataBenchmarks'
export * from './ai/eventsCalendar'
export * from './ai/todoGenerator'
