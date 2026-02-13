# Coze 人工测试 - 话术与待办入参示例

本文档给出**两段完整入参**，对应本系统发给 Coze 的 `content.query.prompt[0].content.text` 的**整条 message**。可直接复制到 Coze 对话或 API 测试里做人工验证。

**说明**：本系统对 `*.coze.site` 使用 legacy 体，整段内容放在 `content.query.prompt[0].content.text` 中；无 system/user 分拆时即为下面整段。

---

## 一、话术入参（完整一条 message）

话术走 Coze 时，**仅发这一段**（无 systemPrompt 前缀），即 `message = userMessage`。

```
请根据以下信息生成一款猫笼的完整销售流程话术。，产品名称：猫笼，国家：泰国，话术类型：full_process，输出语言：仅中文，价格：1299，产品特点：不锈钢、易清洁，目标人群：多猫家庭，促销活动：满1000减20，SKU信息：S码适合1-2只猫，M码适合2-3只猫，L码适合3-5只猫
```

**用途**：在 Coze 对话里粘贴上述整段，或作为 `content.query.prompt[0].content.text` 发送。期望 Bot 在 **answer** 中直接流式输出话术正文（不依赖工具）。

---

## 二、待办入参（完整一条 message）

待办为 `message = systemPrompt + "\n\n【用户请求】\n" + userMessage`，下面为拼接后的**整段**。

```
【语言】locale=zh-CN，countryCode=CN。标题与描述用该语言。

你是直播电商待办助手。根据下方店铺与数据生成待办；有按日明细时请基于明细分析趋势，结论以你分析为准。

【范围】聚焦直播运营：内容、话术、节奏、转化、时段、商品、互动。产出 6～10 条可落地待办。

【输出】仅返回一个 JSON：{"tasks":[{"title":"","description":"","priority":"urgent|normal"},...]}，无 markdown、无前缀。请直接在回复（answer）中流式输出该 JSON，不要调用外部工具。

【用户请求】
【store_data】{"conversion_rate":2.8,"daily_views":650,"avg_order_value":38.5,"daily_orders":42,"live_duration_hours":4.5,"weekly_sessions":0,"platform":"TikTok","country":"泰国","store_name":"测试宠物店","categories":"宠物用品","currency":"泰铢","existing_tasks":["优化直播时段","复盘上周数据"]}
【store_attributes】目标人群：多猫家庭 | 品牌定位：性价比 | 价格区间：¥800～1500
【raw_daily_table】
日期	GMV	时长(h)	观看	订单	转化率(%)	时均GMV
2025-01-15	12000	4.2	820	28	3.41	2857
2025-01-16	9800	3.8	710	22	3.10	2579
2025-01-17	15000	5.0	950	35	3.68	3000

【用户界面语言/地区】locale=zh-CN，countryCode=CN
【店铺基本信息】
- 店铺名称：测试宠物店
- 平台：TikTok
- 国家/区域：泰国
- 类目：宠物用品
- 其他属性：目标人群：多猫家庭 | 品牌定位：性价比 | 价格区间：¥800～1500

【核心销售指标（最近30天）】
- 总订单数：1260 单
- 总观看数：19500 人
- 总收入（GMV）：48510.00 泰铢
- 转化率：2.80%
- 直播总时长：135.0 小时
- 时均 GMV：359 泰铢

【历史对比】
前期平均 GMV 42000 泰铢（本期增长 15.5%） | 平均转化 2.4%（本期提升 0.4个百分点）

【按日明细数据】（若有）
（上表 raw_daily_table 已包含 3 天示例；实际最多约 21 天 7 列）

【业务上下文】
- 已有待办（避免重复）：优化直播时段；复盘上周数据
```

**用途**：在 Coze 对话里粘贴上述整段，或作为 `content.query.prompt[0].content.text` 发送。期望 Bot 在 **answer** 中直接流式输出一段 JSON：`{"tasks":[{"title":"...","description":"...","priority":"urgent|normal"},...]}`，无 markdown、无前缀。

---

## 三、测试要点

| 项目 | 话术 | 待办 |
|------|------|------|
| 期望输出位置 | `type: "answer"` 或 `message.delta` 的 content/answer | 同左 |
| 期望输出内容 | 纯文本话术，可直接念读 | 纯 JSON，根键 `tasks`，6～10 条 |
| 不依赖 | 不依赖 tool_request / tool_response | 同左 |
| 若 Bot 仍走工具 | 可从【store_data】提取 JSON 传入工具（待办）；话术无工具块 | — |

---

## 四、与代码对应

- 话术拼装：`backend/src/rules/scriptResearch.ts` → `buildScriptToolCallMessage`；`backend/src/services/scriptLLM.ts` 中 `toolCallOnly` 时 `message = userMessage`。
- 待办拼装：`backend/src/routes/ai-refactored.ts` → `generateIntelligentTodosWithLLM` 内 `systemPrompt` + `userMessage`，再在 scriptLLM 中拼接为 `systemPrompt + "\n\n【用户请求】\n" + userMessage`。
