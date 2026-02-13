# 后端脚本说明

| 脚本 | 命令 | 用途 |
|------|------|------|
| inspect-db.ts | `npm run db:inspect` | 查看 stats / data_imports 条数、按店铺日期分布、最近示例 |
| clean-stats-duplicates.ts | `npm run db:clean-stats` | 同店同日多条时只保留最新一条 |
| clean-monthly-orphan-stats.ts | `npm run db:clean-monthly-orphan` | 删除疑似整月汇总的月初行（与当月其余日合计比值在 [0.5,1.5] 时） |
| diagnose-excel.ts | `npx tsx scripts/diagnose-excel.ts <Excel路径>` | 诊断 Excel：解析行数、日期分布、GMV/时长汇总 |
| test-parse-excel.ts | `npx tsx scripts/test-parse-excel.ts <Excel路径>` | 快速解析 Excel：行数及首行字段 |
| test-dashboard-apis.ts | 见 package.json | 接口自动化测试 |
| clear-import-data.ts | `npm run db:clear-import` | 清理导入记录 |
| reset-database.ts | `npm run db:reset-full` | 重置数据库 |
| test-generate-logic.ts | `npm run test:generate-logic` | 待办生成逻辑直测（不依赖服务，直接调 generateSuggestedTodosForStore） |
| test-generate-tasks-api.ts | `npm run test:generate-api` | 待办生成接口测试（需先启动后端，再执行；登录→取店铺→POST /api/ai/generate-tasks） |