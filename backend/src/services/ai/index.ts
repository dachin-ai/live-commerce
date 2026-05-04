/**
 * AI 服务模块 - Barrel 文件
 * 统一从各子模块重导出所有符号，保证外部 import 路径兼容性
 * 对应拆分自: aiTasksService.ts
 *
 * 子模块职责:
 *   statsAnalysis   - DB数据聚合、趋势分析、异常检测、动态阈值
 *   dataBenchmarks  - 行业基准、时段推荐、成长阶段、同比/环比规则任务
 *   eventsCalendar  - 各地区节假日、节日提醒、季节/气温上下文
 *   todoGenerator   - LLM调用封装、JSON修复、角色标注、主生成函数
 */

export * from './statsAnalysis'
export * from './dataBenchmarks'
export * from './eventsCalendar'
export * from './todoGenerator'
