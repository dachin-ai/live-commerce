# 待办智能生成：传给 Coze 的数据清单

**用途**：排查「待办失真」、核对数据口径、与 12 月原表等测试数据对齐。  
**更新**：按日明细已改为与「核心销售指标」同一区间，**最多 30 天**（此前为 15 天）。

---

## 1. 数据总览

| 类别 | 内容 | 数据来源 | 时间范围 / 说明 |
|------|------|----------|-----------------|
| 店铺基本信息 | 名称、平台、国家/区域、类目、属性 | `stores`、`store_categories` → `categories` | 当前配置 |
| 核心销售指标 | 订单、观看、GMV、转化率、时长、时均 GMV、阶段 | `stats` 汇总 | **与按日明细同一区间**（见下） |
| 历史对比 | 前期平均 GMV/转化率、本期变化百分比 | `stats` 上一周期汇总 | 上一 30 天区间 |
| **按日明细（TSV）** | 日期、GMV、时长、观看、订单、互动、场次、转化率、时均 GMV | `stats` 按日 | **dateFrom～dateTo 全量，最多 30 天** |
| 业务上下文 | 阶段与重点、趋势、异常、季节、气温、即将节日、已有待办、用户补充 | 计算 + `getTimeContext`、`getUpcomingEvents`、`tasks` | 当前 |

**关键对齐**：**【核心销售指标】** 与 **【按日明细】** 使用**同一** `dateFrom` / `dateTo`（当前周期，通常为「当天往前 30 天」或「以最新有数据日为终点的 30 天」），避免 Coze 看到的汇总与按日不一致导致失真。

---

## 2. 时间范围如何确定

- **有「当天往前 30 天」数据时**：`currentRange = getPeriodDateRange(0)`，即今天往前 30 天。
- **当天往前 30 天无数据时**：取 `stats` 表该店铺**最新一条数据的日期**为终点，`currentRange = getPeriodDateRangeFromEnd(latestDate, 0)`，即「以最新数据日为终点的 30 天」。

上述 `currentRange.dateFrom`、`currentRange.dateTo` 同时用于：  
① 汇总得到「核心销售指标」；② 查询按日明细 `getRawDailyStatsForLLM(storeId, dateFrom, dateTo)`。  
因此用 12 月原表导入后，若最新数据在 12 月，传给 Coze 的将是 12 月区间内的**最多 30 天**按日数据，与汇总一致。

---

## 3. 按日明细格式（TSV，可视为表格/CSV）

- **来源**：`getRawDailyStatsForLLM(storeId, dateFrom, dateTo)`，直接从数据库 `stats` 查询，无条数截断（仅 `LIMIT 31` 防止异常大区间）。
- **表头**（一行）：  
  `日期\tGMV\t直播时长(h)\t观看\t订单\t互动\t场次\t转化率(%)\t时均GMV`
- **每一行**：一天一条，制表符分隔，顺序与表头一致。  
- 在发给 Coze 的 `userMessage` 中，整段放在 **【⭐ 按日明细数据】** 下的代码块内，便于模型按表解析。

如需用 Excel 核对：可将该 TSV 复制到文本文件，另存为 `.csv`（制表符分隔）后用 Excel 打开，或直接粘贴到 Excel 中按 Tab 分列。

---

## 4. userMessage 中出现的全部字段（清单）

以下为拼进 `userMessage` 的完整数据块与变量，与代码中 `generateIntelligentTodosWithLLM` 的入参一致。

| 块/变量 | 含义 | 来源 |
|--------|------|------|
| **【店铺基本信息】** | | |
| storeName | 店铺名称 | stores.name |
| storePlatform | 平台 | stores.platform |
| region | 国家/区域 | stores.region |
| categories | 类目 | store_categories → categories.name |
| 其他属性 | 目标人群、品牌定位、价格区间、品牌策略、店铺说明 | stores 对应字段 |
| **【核心销售指标（最近30天）】** | | |
| orders | 总订单数 | 当前周期 stats 汇总 |
| viewers | 总观看数 | 同上 |
| gmv | 总收入（GMV） | 同上 |
| conversionRate | 转化率（%） | orders/viewers×100 |
| duration | 直播总时长（小时） | 同上 |
| gmvPerHour | 时均 GMV | gmv/duration |
| storeStage.name | 店铺阶段 | getStoreStage(...) |
| **【历史对比】** | | |
| historicalBlock | 前期平均 GMV、平均转化率、本期变化百分比或「无历史数据」 | 上一周期汇总 + 计算 |
| **【⭐ 按日明细数据】** | | |
| rawDailyStatsText | TSV 表格：日期、GMV、时长、观看、订单、互动、场次、转化率、时均 GMV | getRawDailyStatsForLLM(storeId, dateFrom, dateTo)，**最多 30 天** |
| **【业务上下文】** | | |
| storeStage.focus | 阶段重点（前 3 项） | getStoreStage |
| trendAnalysis | 趋势描述（若有） | 内部计算 |
| anomaliesSummary | 数据异常摘要（若有） | 内部计算 |
| timeContext | 季节、月份、气温带、天气提示 | getTimeContext(region) |
| eventsShort | 即将节日，最多 3 个 | getUpcomingEvents(region, now) |
| existingTaskTitles | 已有待办标题（避免重复） | tasks 表 status=pending |
| additionalUserPrompt | 用户补充说明 | 前端/API |

---

## 5. 若需从数据库导出 CSV/Excel 自测

- 按日数据与系统传给 Coze 的**同源同区间**：表 `stats`，筛选 `storeId` 与 `date BETWEEN dateFrom AND dateTo`，列与 TSV 表头一致（date, totalGMV, totalDuration, totalViewers, totalOrders, totalInteractions, rounds, averageConversionRate, gmvPerHour）。
- 可用管理端或脚本查询同一 `dateFrom`/`dateTo`，导出为 CSV（或另存为 xlsx）与 Coze 收到的按日明细对照，便于验证 12 月原表测试时数据是否一致。

---

## 6. 相关代码与文档

- 按日查询与 TSV 生成：`ai-refactored.ts` 中 `getRawDailyStatsForLLM`（约 L105–138）。  
- 入参结构与示例： [LLM待办生成-给Coze的输入参数.md](./LLM待办生成-给Coze的输入参数.md)  
- 功能总览： [待办生成完整功能清单.md](./待办生成完整功能清单.md)
