# LLM 待办生成：给 Coze 的输入参数

本文档描述「智能生成待办」时，系统发给 **Coze Bot** 的输入参数格式与**数据变量**，便于排查与联调。角色、输出格式、最近发展区、直播场景等**已内置 Coze**，本系统只补充语言与数据块。

**出参与流式约定**：以 **`docs/Coze对接说明-待办与话术入参出参.md`** 为准；表格要求正文在 **answer/delta** 中输出，**推荐** Coze 在 answer/delta 直接流式输出 JSON，不依赖 tool。

---

## 1. 传输形式

- **调用方式**：Coze 发布站点 `stream_run` 接口。
- **入参位置**：请求体 `content.query.prompt[0].content.text` 为**一条完整文本**。
- **拼接规则**：`fullMessageForCoze = systemPrompt + "\n\n【用户请求】\n" + userMessage`

---

## 2. systemPrompt（系统指令）

**角色、输出格式、最近发展区、直播场景等已内置 Coze**，本系统仅发送简短补充：

- **【语言】**：`locale`、`countryCode`（标题与描述使用该语言）
- **【范围】**：聚焦直播运营，产出 6～10 条可落地待办
- **【输出】**：仅返回 JSON `{"tasks":[...]}`，无 markdown、无前缀

具体文案见代码 `generateIntelligentTodosWithLLM` 中的 `systemPrompt` 变量。

---

## 3. userMessage（用户内容）结构

本系统只下发**数据块**，结构如下（无长段说明文案，说明类已内置 Coze）：

- **【store_data】**：**合法 JSON 字符串**（紧跟标签后、无换行），店铺汇总数据，Bot 据此生成待办。字段见 `docs/Coze-API入参实现说明.md`。
- **【store_attributes】**：**纯文本**，目标人群、品牌定位、价格区间、品牌策略、店铺说明等，用 ` | ` 分隔；无则空。
- **【raw_daily_table】**：**TSV 表格**（标签后换行接表头+按日数据），无数据时为空。格式见 `docs/Coze待办生成-调试说明.md`。
- **【用户界面语言/地区】**：locale、countryCode
- **【店铺基本信息】**：店铺名称、平台、国家/区域、类目、其他属性（可选）
- **【核心销售指标（最近30天）】**：订单数、完成订单、观看数、总互动（点赞/评论/分享/关注）、互动率、商品曝光/点击、GMV、转化率、时长、时均 GMV
- **【历史对比】**：前期平均 GMV/转化 或「无历史数据」
- **【按日明细】**：有则附 TSV 表格，**全维度 19 列**（与 Creator-Live-Performance Excel 一致）：日期、GMV、时长(h)、观看、在线、订单、完成、互动、点赞、评论、分享、关注、商品曝光、商品点击、场次、转化率(%)、点击率(%)、互动率(%)、时均GMV；最多 31 天
- **【业务上下文】**：已有待办（最多 10 条标题）、用户补充（最多 300 字，可选）

### 变量说明

| 变量 | 来源 | 说明 |
|------|------|------|
| **store_data（JSON）** | 见下 | 首行【store_data】后接合法 JSON。必含：conversion_rate、daily_views、avg_order_value、daily_orders、live_duration_hours、weekly_sessions、platform、country；扩展：store_name、categories、currency、existing_tasks、total_interactions、interaction_rate、**total_likes**、**total_comments**、**total_shares**、**total_follows**、**total_product_views**、**total_product_clicks**、**completed_orders**（与 Creator-Live-Performance 全维度一致）。见 `docs/Coze-API入参实现说明.md` |
| locale / countryCode | 入参或店铺 region | 用户界面语言与地区，标题与描述用该语言 |
| storeName | stores.name | 店铺名称 |
| storePlatform | stores.platform | 平台（如 TikTok、抖音） |
| region | stores.region | 国家/区域 |
| categories | store_categories → categories.name | 类目，多则顿号拼接 |
| 其他属性 | 见下 | 目标人群、品牌定位、价格区间、品牌策略、店铺说明（有则输出，有长度截断） |
| orders / viewers / **interactions** / **interactionRate** / gmv / conversionRate / duration / gmvPerHour | 最近 30 天 stats 汇总与计算 | 订单数、观看数、**总互动数、互动率(%)**、GMV、转化率(%)、时长(h)、时均 GMV；currencyName 按 region 取 |
| historicalBlock | hasHistory + historicalStats | 前期平均 GMV/转化 或「无历史数据，仅基于最近30天」 |
| rawDataBlock | getRawDailyStatsForLLM(...) | 主流程为**全维度**：最多 31 天、**19 列**（日期、GMV、时长、观看、在线、订单、完成、互动、点赞、评论、分享、关注、商品曝光、商品点击、场次、转化率、点击率、互动率、时均GMV），与 Creator-Live-Performance Excel 导入维度一致；有则放在代码块。详见 [待办生成-传给Coze的数据清单](./待办生成-传给Coze的数据清单.md) |
| existingTaskTitles | tasks 表 status=pending | 已有待办标题，最多 10 条，避免重复 |
| additionalUserPrompt | 前端/API 传入 | 用户补充，最多 300 字 |

---

## 4. 示例与联调

- 入参结构以**第三节**与**变量说明**为准；完整一条 `fullMessageForCoze` 以实际请求或运行时生成为准。
- 若需在 Coze 对话中复现，可查看或导出 `backend/coze-input-sample-utf8.txt`（若已生成）；或直接在本系统内点击「智能生成」后根据 `coze-debug.log` 的 request 与 payload 核对。

---

## 5. 代码位置与调试

- **拼装入参**：`backend/src/routes/ai-refactored.ts` → `generateIntelligentTodosWithLLM`（【store_data】/【store_attributes】/【raw_daily_table】+ 其余数据块）。
- **发给 Coze**：`backend/src/services/scriptLLM.ts` → `streamCozeAgent`，将 `systemPrompt + "\n\n【用户请求】\n" + userMessage` 放入 `content.query.prompt[0].content.text`。
- **Coze 联调与排查**：**docs/Coze待办生成-调试说明.md**（入参三块、Coze 提取规则、本系统侧排查、常见问题）。

---

## 6. 与流程的对应关系

- **系统 → Coze**：`fullMessageForCoze` 即本节所述入参（系统指令简短补充 + 用户数据块）。
- **Coze 输出 → 后端**：后端解析 `{"tasks":[...]}`、去重与优先级处理后写入任务；若待办无法正常生成，参见 `docs/待办生成返回空-排查说明.md` 与 `llmEmptyReason`。
