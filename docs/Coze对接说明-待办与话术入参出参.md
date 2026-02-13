# Coze 对接说明：待办生成与话术生成（入参 / 出参）

**用途**：发给 Coze 侧，统一约定本系统与 Coze 的入参、出参及流式要求，便于待办 Bot 与话术 Bot 行为一致、解析稳定。

**更新日期**：2026-02-13

**与《Coze 对接协议 - 最终落地方案》的关系**：协议规定入参为 `content.query.prompt[0].content.text`（即 legacy 体）。本系统对 **\*.coze.site** 默认使用该格式，无需设置环境变量。若接入的自建 Agent 仅支持 `{ content, session_id }`，可设置 `AGENT_API_BODY=1`。  
**解析逻辑**：本系统**仅**从 `type: "answer"`、`message.delta`、`conversation.message.delta` 等流式事件中的 **content/answer/delta** 字符串拼接正文；**不再解析或使用 `tool_response`**。

**tool 路径已废弃**：本系统**未**在请求中要求 Coze 调用工具。**正文必须由 Coze 在 answer/delta 中直接流式输出**；`tool_request`→`tool_response` 路径已废弃，本系统收到 `tool_response` 时仅记录诊断日志、**不产出任何正文**。若 Bot 仍配置为走工具，请改为在「回复」中直接输出 JSON（待办）或话术（话术），否则将无法得到结果。

---

## 一、通用约定

### 1.1 调用方式

- **接口**：Coze 发布站点 `POST /stream_run`（URL 示例：`https://xxx.coze.site/stream_run`）。
- **请求体**（本系统当前对 `*.coze.site` 使用「旧版」格式）：
  - `content.query.prompt[0].content.text`：**一条完整文本**，即下方「入参」中的 **整条 message**。
  - `content.query.parameters.max_tokens`：可选，待办建议 3000，话术可更大。
  - `type: "query"`，`session_id`（UUID），`project_id`（若需）。
- **响应**：SSE（`text/event-stream`），按行 `data: {...}` 推送事件。

### 1.2 流式输出要求（重要）

本系统**依赖流式正文**解析结果：

- **话术**：流式 chunk 直接推前端展示。
- **待办**：后端会**聚合全部流式 chunk** 成一段完整文本，再从中解析 JSON。

因此 Coze 必须通过**流式事件**输出正文，而不是仅在 `message_start` / `message_end` 里把 `content.answer` 置为 `null`。否则本系统会认为「无输出」，待办会走规则兜底、话术会无内容。

**请确保**：

- 正文通过 **`type: "answer"` 且 `content.answer` 为字符串** 的 SSE 事件逐块推送；或
- 通过 **`event: "conversation.message.delta"` / `message.delta`** 等流式事件，且事件体中有 **`content` / `delta` / `answer`** 等字符串字段。

本系统会从上述事件中提取字符串并拼接；若只有 `message_start` 与 `message_end` 且其中 `content.answer`、`content.thinking` 均为 `null`，则无法得到任何正文。

---

## 二、待办生成（智能生成任务）

### 2.1 场景说明

用户在本系统内选择店铺并点击「智能生成」后，后端拉取该店铺数据，拼成一条 message 发给 Coze；Coze 需根据店铺与数据**流式输出**一段 **JSON 文本**，本系统聚合后解析为待办列表并写入。

### 2.2 入参：一条完整 message

本系统将 **systemPrompt** 与 **userMessage** 拼成一条消息后放入 `content.query.prompt[0].content.text`：

```text
fullMessage = systemPrompt + "\n\n【用户请求】\n" + userMessage
```

**systemPrompt（系统指令）** 示例（实际会带 locale/countryCode 等）：

```text
【回复语言与地区】locale=zh-CN，countryCode=CN。任务标题与描述使用该语言。

你是专业的直播电商待办助手。根据下方**必要参数**与**店铺直播明细**生成待办事项。系统会提供阶段、趋势、异常等汇总数据供参考；若你基于明细的结论与参考不一致，以你基于明细的结论为准。

【最近发展区】基于店铺当下数据（GMV、转化率、场次、观看、趋势、异常等）和直播运营逻辑，产出当下最应投入的、可落地的待办。

【直播场景】聚焦直播运营：直播内容、话术、节奏、转化、时段、商品推荐、互动等。

【输出格式】返回包含 tasks 数组的 JSON，每条含：标题、描述、优先级。条数 6～10。
```

**userMessage（用户内容）** 结构（`{{...}}` 为系统填充的变量）：

```text
【用户界面语言/地区】locale={{locale}}，countryCode={{countryCode}}

【店铺基本信息】
- 店铺名称：{{storeName}}
- 平台：{{storePlatform}}（如 TikTok、抖音、快手）
- 国家/区域：{{region}}
- 类目：{{categories}}
- 其他属性：（可选）目标人群、品牌定位、价格区间等

【核心销售指标（最近30天）】
- 总订单数、总观看数、总收入（GMV）、转化率、直播总时长、时均 GMV

【历史对比】
（前期平均 GMV、转化率及本期变化，或无历史说明）

【⭐ 按日明细数据】（若有）
（TSV 表格：日期、GMV、时长、观看、订单、互动、场次、转化率、时均GMV 等，最多约 30 天）

【业务上下文】
- 已有待办（避免重复）：（标题列表）
- 用户补充：（若有）
```

**平台一致**：userMessage 中会明确写出「平台：TikTok」或「平台：抖音」等，生成的任务描述中**数据来源须与该平台一致**，不得混用其他平台名称。

### 2.3 出参：JSON 格式（必须流式输出此段正文）

Coze 的**整段回复正文**（通过流式事件拼接后）应为**一个 JSON 对象**，且满足：

- **根对象**包含键 **`tasks`**，值为数组。
- **每条任务**为对象，建议字段：
  - **title**（必）：任务标题，字符串。
  - **description**（必）：任务描述/可执行动作，字符串。
  - **priority**（必）：`"urgent"` 或 `"normal"`。

本系统**兼容**的字段名（可任选其一）：

| 本系统解析用 | Coze 可返回字段名 |
|--------------|--------------------|
| 标题         | title / task / name / content |
| 描述         | description / expected_outcome / content（与标题不同时） |
| 优先级       | priority / level / importance（值：urgent/high/critical → urgent，其余 → normal） |

**条数**：6～10 条。

**禁止**：

- 在 JSON 外输出 markdown 代码块（\`\`\`json ... \`\`\`）、mermaid 图、分析段落、总结语等；否则本系统需从整段回复中截取 JSON，可能解析失败。
- **建议**：流式输出时**直接以 `{"tasks":[` 开头**，无任何前缀。

**示例**（流式输出的内容拼接后应等价于）：

```json
{"tasks":[
  {"title":"提升直播转化率","description":"当前转化率 3.6%，建议…","priority":"urgent"},
  {"title":"优化黄金时段排品","description":"结合按日 GMV 分布…","priority":"normal"}
]}
```

---

## 三、话术生成

### 3.1 场景说明

用户在执行工具中选择话术场景、填写参数后点击「生成」，后端拼好 systemPrompt + userMessage 发给 Coze；Coze **流式输出**一段**纯文本话术**，本系统逐块推给前端展示。

### 3.2 入参：同上的 message 形式

- 同样使用 **一条完整文本** 放入 `content.query.prompt[0].content.text`。
- 内容为 **systemPrompt + "\n\n【用户请求】\n" + userMessage**，具体由话术场景（销售流程、卖点等）决定，此处不展开模板。

### 3.3 出参：纯文本（流式）

- **无 JSON 要求**，整段回复为**纯文本**（话术正文）。
- 同样必须通过 **流式事件**（如 `type: "answer"` 且 `content.answer` 为字符串）逐块输出；本系统将 chunk 顺序拼接后推前端。

---

## 四、与话术的一致性（给 Coze 的要点）

| 项目         | 待办生成                 | 话术生成           |
|--------------|--------------------------|--------------------|
| 调用方式     | 同一 `stream_run`        | 同一 `stream_run`  |
| 入参位置     | `content.query.prompt[0].content.text`（一条 message） | 同左 |
| 入参结构     | systemPrompt + 【用户请求】 + userMessage | 同左 |
| 响应格式     | SSE 流式                 | SSE 流式           |
| **出参内容** | **仅一段 JSON**（`{"tasks":[...]}`） | **仅一段纯文本** |
| **流式要求** | **必须**在 answer/delta 等事件中输出正文，不能仅 message_start/end 且 answer=null | 同左 |
| **是否依赖 tool** | **已废弃**：仅支持 answer/delta 输出，本系统不再解析 tool_response | 同左 |

共同要求：

1. **流式 SSE**：正文必须通过 `type: "answer"` 或 `message.delta` 等事件的 **content/answer/delta** 字符串逐块推送，不能只在 `message_end` 里带 `answer: null`。
2. **仅 answer/delta**：待办与话术的正文**须在 answer/delta 中直接输出**；tool 路径已废弃，本系统不再从 `tool_response` 产出正文。
3. **无多余格式**：待办不要输出 markdown 代码块、mermaid、分析段落；话术不要输出 JSON。
4. **单次请求**：本系统不传历史对话，每次均为独立请求；Bot 若开启多轮记忆，请确保首轮即可按上述格式回复。

---

## 五、本系统解析流式事件的方式（供 Coze 排查）

本系统会从 SSE 的 `data:` 行中解析 JSON，并从下列位置取**字符串**参与拼接（任一处有值即采纳）：

- `type === "answer"` → `content.answer` 或 `content.content` 或顶层 `answer`
- `event === "conversation.message.delta"` 或 `conversation.message.completed"` → `content`
- `event === "message.delta"` / `"message.chunk"` / `"message.answer"` → `content` / `delta` / `answer`
- `event === "message"` → `message.content`
- `type === "message_end"` → `content.answer` / `content.content` / `content.text` / `content.reply` / `content.output` / `content.result` / `content.message` / `content.body`
- 顶层 `content` / `text` / `delta` / `answer`

**不再解析**：`tool_response` 已废弃，本系统收到时仅打日志、不参与正文拼接。

若 Coze 使用其他 event 名或字段名，请告知，本系统可增加兼容。

---

## 六、文档与代码位置（便于联调）

| 说明           | 路径 |
|----------------|------|
| **协议依据**   | 《Coze 对接协议 - 最终落地方案》（入参 content.query.prompt、SSE answer/tool_response） |
| 待办入参示例   | `docs/LLM待办生成-给Coze的输入参数.md`、`docs/待办生成-传给Coze的数据清单.md` |
| 请求格式详解   | `docs/待办生成-Coze请求格式说明.md`（与协议一致） |
| 待办返回空排查 | `docs/待办生成返回空-排查说明.md` |
| Coze 侧配合项  | `docs/待办生成-Coze智能体配合调整说明.md` |
| **Agent 侧 API 说明** | `docs/电商数据分析专家Agent-API使用指南.md`（Cursor 接入 Agent 的请求/响应约定） |
| 待办拼装逻辑   | `backend/src/routes/ai-refactored.ts` → `generateIntelligentTodosWithLLM` |
| 流式请求与解析 | `backend/src/services/scriptLLM.ts` → `streamCozeAgent`、`extractCozeContent`、`callLLMOnce`（tool_response 已废弃，不再解析） |

若待办生成仍出现「无输出」或「LLM 0 条」，请重点确认：**流式事件中是否持续推送了正文**（如 `type: "answer"` 且 `content.answer` 为字符串），而不是仅返回 `message_start` / `message_end` 且 `content.answer` 为 `null`。

---

## 七、与《电商数据分析专家 Agent-API 使用指南》的对应关系

当本系统调用的 Coze 发布站点即为该「电商数据分析专家 Agent」时，可对照其 [API 使用指南](./电商数据分析专家Agent-API使用指南.md) 做对齐：

| 项目 | Agent API 指南 | 本系统当前实现 |
|------|----------------|----------------|
| **请求体** | `POST /stream_run`，body: `{ content: string, session_id: string }` | 对 `*.coze.site` 使用旧版格式：`content.query.prompt[0].content.text` = 整条 message，另含 `type`、`session_id`、`project_id` |
| **入参内容** | content = 自然语言描述（话术/待办等） | 待办：systemPrompt + 【用户请求】 + userMessage（见第二节）；话术：同上结构，内容由场景决定 |
| **SSE 响应** | `type: message_start` / `answer` / `message_end`；示例中 `data.answer` 为流式片段 | 已兼容：从 `data.answer`、`data.content.answer`、`content.content`、`message.delta` 等取字符串并拼接 |
| **待办场景** | content 如「我是新开店铺，请帮我生成今日待办」 | 本系统传入的是**完整店铺数据 + 按日明细 + 输出格式要求**（见 2.2），期望 Agent 在**回复**中直接流式输出 **JSON**（`{"tasks":[...]}`），非自然语言描述 |

**若对接同一 Agent**：

- **请求体格式**：若 Agent 只接受 `{ content, session_id }`，本系统需在调用该 Agent 时改为该格式（content = 本系统拼好的整条 message）；若 Agent 同时支持 Coze 旧版 `content.query.prompt`，则无需改。
- **响应解析**：本系统已按「五、本系统解析流式事件的方式」兼容顶层 `answer` 与 `content.answer`，与指南中示例一致。
- **待办出参**：本系统要求待办场景下 Agent 在**回复（answer/delta）**中直接流式输出纯 JSON（`{"tasks":[...]}`），本系统从 answer/delta 拼接后解析。
