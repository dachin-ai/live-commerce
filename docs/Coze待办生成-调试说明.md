# Coze 待办生成 - 调试说明

**用途**：联调与排查「智能生成待办」时本系统与 Coze 的入参与出参。  
**更新日期**：2026-02-13

---

## 一、入参结构（本系统 → Coze）

本系统在**一条用户消息**中按固定顺序下发数据块（带标签），Bot 从消息中读取后**在回复中直接流式输出 JSON**，不涉及任何工具调用。详见《Coze对接说明-待办与话术入参出参》。

### 1.1 标签顺序与格式

| 标签 | 格式要求 | 说明 |
|------|----------|------|
| **【store_data】** | 紧跟标签后为**一整段合法 JSON**（无换行），以 `{` 开头、`}` 结尾 | 店铺汇总数据，字段见《Coze-API入参实现说明》。Bot 从消息中读取该段 JSON 后据此生成待办。 |
| **【store_attributes】** | 紧跟标签后为一段**纯文本**，到下一行或下一个【为止 | 目标人群、品牌定位、价格区间、品牌策略、店铺说明等，用 ` \| ` 分隔。可为空。 |
| **【raw_daily_table】** | 标签后换行，接 **TSV 表格**（第一行为表头，后续每行一天） | 按日明细（全维度 19 列等）。无数据时为空。 |

### 1.2 本系统实际发送示例（结构）

```text
【store_data】{"conversion_rate":2.5,"daily_views":800,"avg_order_value":40,"daily_orders":50,"live_duration_hours":5,"weekly_sessions":0,"platform":"TikTok","country":"泰国","store_name":"测试店铺","categories":"宠物用品","currency":"泰铢","existing_tasks":["标题1","标题2"]}
【store_attributes】目标人群：xxx | 品牌定位：xxx | 价格区间：¥100～200 | 品牌策略：...
【raw_daily_table】
日期	GMV	时长(h)	观看	订单	转化率(%)	时均GMV
2025-01-01	12000	4.2	800	25	3.12	2857
...

【用户界面语言/地区】locale=zh-CN，countryCode=CN
【店铺基本信息】
...
```

- **store_data**：整段为合法 JSON，禁止在 JSON 内换行或掺入自然语言。  
- **store_attributes**：无则标签后为空，或整行省略。  
- **raw_daily_table**：无数据时保留「【raw_daily_table】\n\n」，即空表。

---

## 二、Coze 侧如何读取消息

Bot 从本系统下发的**同一条消息**中读取数据即可，无需调用任何工具：

1. **store_data**：在消息中查找 `【store_data】`，取其后第一个 `{` 到最后一个 `}` 之间的字符串，`JSON.parse` 后即为店铺汇总数据。  
2. **store_attributes**：查找 `【store_attributes】`，取其后内容直到下一个 `【` 或行尾，trim 后即为属性文本（可为空）。  
3. **raw_daily_table**：查找 `【raw_daily_table】`，取其后内容直到下一个 `【` 或消息结尾，trim 后即为 TSV 按日表（可为空）。

读取后，Bot **在回复（answer/delta）中直接流式输出** JSON：`{"tasks":[{"title":"...","description":"...","priority":"urgent|normal"},...]}`。

---

## 三、出参格式与解析方式（Coze → 本系统）

### 3.1 出参要求

正文**须在 answer/delta 中流式输出**。本系统从 SSE 的 `type: "answer"`、`message.delta`、`conversation.message.delta` 等事件的 **content/answer/delta** 字符串按顺序拼接，得到完整 JSON 后解析为待办列表。

- 拼接结果应为**一个 JSON 对象**，根键 `tasks` 为数组，每项含 `title`、`description`、`priority`。  
- 不要输出 markdown 代码块、mermaid、分析段落等，直接以 `{"tasks":[` 开头流式输出即可。

**说明**：`tool_response` 路径已废弃，本系统不再解析；若 Bot 仍从工具返回，将无法得到结果，请改为在回复中直接输出 JSON。

---

## 四、本系统侧排查

### 4.1 看入参是否带齐三块

- 在 **backend** 临时加日志：在 `generateIntelligentTodosWithLLM` 内打印 `userMessage.slice(0, 800)`，确认是否包含 `【store_data】`、`【store_attributes】`、`【raw_daily_table】` 及内容。  
- 或点击「智能生成」后查看 **backend/coze-debug.log** 中本次请求的 `[request]`：`messageLen` 是否明显大于仅 store_data 长度（说明后两段也在内）。

### 4.2 看 Coze 是否在 answer/delta 中输出正文

- 打开 **backend/coze-debug.log**，确认本次请求后是否有从 `answer` / `message.delta` 等事件中解析出的内容（本系统仅从这些事件拼接正文，不再解析 tool_response）。  
- 若出现 `[tool_response_deprecated]`：说明 Coze 仍在下发 tool_response；本系统已忽略，请将 Bot 改为在回复中直接输出 JSON。

### 4.3 返回空 / 超时

- 参见 **docs/待办生成返回空-排查说明.md**：bodyKind、鉴权、超时等。

---

## 五、常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 待办解析失败 / JSON 无效 | Bot 输出含 markdown、分析段落或未按 `{"tasks":[` 直接输出 | Coze 侧在回复中**直接流式输出**纯 JSON，无前缀、无代码块。 |
| raw_daily_table 为空 | 店铺无按日数据或未传 | 本系统无数据时发「【raw_daily_table】\n\n」；Bot 读取时按空字符串处理即可。 |
| store_attributes 为空 | 店铺未填目标人群、品牌等 | 本系统会发「【store_attributes】\n」；Bot 按空字符串处理即可。 |
| 流式未产出 / 超时 | 见《待办生成返回空-排查说明》 | 查 bodyKind、鉴权、180s 超时；确认 Bot 在 **answer/delta** 中持续输出正文。 |
| 日志出现 tool_response_deprecated | Bot 仍从工具返回结果 | 本系统已不解析 tool_response；请将 Coze Bot 改为在**回复**中直接输出 JSON。 |

---

## 六、相关文档

- 入参字段与变量说明：**docs/LLM待办生成-给Coze的输入参数.md**
- store_data 字段与 Coze 约定：**docs/Coze-API入参实现说明.md**
- 返回空与超时排查：**docs/待办生成返回空-排查说明.md**
- 对接总约定：**docs/Coze对接说明-待办与话术入参出参.md**
