# 话术生成 - Coze 方案与当前实现对照

## 一、Coze 推荐方案（方案 1）— 已采用

### 流程

```
用户填写表单（Cursor 前端）
    ↓
Cursor 后端将表单数据转为「工具参数」
    ↓
请求发往 Coze Agent API（如 POST /api/chat）
    ↓
Agent 解析请求并调用 generate_live_script 工具
    ↓
工具内部使用完整提示词并调用 LLM
    ↓
工具返回话术（JSON，符合 V3.1）
    ↓
Cursor 解析 tool_calls 中的 result，前端展示
```

### 要点

- **Cursor 不自己写提示词**：只组「请调用 generate_live_script 工具，产品名称：x，国家：y，价格：z，话术类型：full_process，…」这类消息。
- **Coze Agent 负责**：识别工具调用、执行 `generate_live_script`、在工具内维护提示词与 V3.1 格式。
- **响应格式**：JSON 中含 `tool_calls`，其中 `tool_name === 'generate_live_script'`，`result` 为工具返回的 JSON（含 `script` 等）。

### 当前实现（方案 1 消息形态）

- **Coze 模式**（调用方式为「Coze Agent」）：后端**一律**仅发送一条工具调用式消息（`buildScriptToolCallMessage`），不区分话术类型；`scriptLLM` 使用 `toolCallOnly: true`，与 Coze 内部测试一致。
- **OpenAI 兼容模式**（豆包/火山方舟等）：使用本地 `buildCozeScriptPrompts` 或 `buildLLMSystemPrompt` 构建提示词；此时生成结果与 Coze 内部测试无关。

---

## 二、当前 Cursor 项目实现（流式 stream_run）

### Coze 流式对接要求与实现

| 要求 | 实现 |
|------|------|
| **使用 POST /stream_run 接口** | `ensureCozeStreamRunUrl` 保证请求发往 `.../stream_run`；`buildCozeStreamRunBody(message)` 组 body，`fetch(url, { method: 'POST', body: JSON.stringify(...) })`。 |
| **解析 SSE 格式数据** | 按行读取响应体，识别 `data: ` 开头的行，`JSON.parse` 后由 `extractCozeContent` 提取可展示文本；`data: [DONE]` 忽略。 |
| **实时显示流式内容** | 每解析到一块 content 即 `yield`，路由层 `send({ content: chunk })` 推给前端；前端 `onChunk` 更新 `streamingContent`，界面展示打字机效果。 |
| **处理工具调用和响应** | `function_call` / `tool_call` / `tool_response` 事件不产出正文（`extractCozeContent` 返回 `undefined`）；仅 `type=answer` 的 content 参与输出。支持 `conversation.message.delta`、`conversation.message.completed` 等事件格式。 |

### 流程（Coze 模式采用方案 1 消息形态）

```
用户填写表单（前端 AIFeatures）
    ↓
前端将表单字段作为 body 发给 Cursor 后端（POST /api/ai/script/stream）
    ↓
后端 parseScriptRequestBody 解析 productName、country、price、scriptType 等
    ↓
【Coze 模式】不先跑市调，buildScriptToolCallMessage(userInput, storeContext, …) 仅组一条「请调用 generate_live_script 工具，…」；【OpenAI 模式】先跑市调，再用 buildCozeScriptPrompts / buildLLMSystemPrompt
    ↓
streamCozeAgent：Coze 时始终 toolCallOnly，只发该条消息
    ↓
POST 到 Coze 的 stream_run；Coze Bot 流式返回文本
    ↓
后端仅做长度截断与兜底，不改写正文；前端流式展示
```

### 与 Coze 方案 1 的对齐情况

| 项目         | Coze 方案 1              | 当前实现（Coze 模式）                    |
|--------------|--------------------------|------------------------------------------|
| 请求谁       | Coze Agent API（带工具） | 仍为 Coze 发布站点 stream_run            |
| 提示词在哪   | Agent 侧工具内部         | **已对齐**：Cursor 不再维护，只发工具调用式消息 |
| 消息形态     | 工具调用式自然语言 + 参数 | **已对齐**：仅一条「请调用 generate_live_script 工具，…」 |
| 响应形态     | JSON + tool_calls        | 仍为流式文本（SSE）                       |
| 是否「真」调工具 | 是                       | 取决于 Coze Bot 是否配置了该工具          |

---

## 四、当前实现与 Coze 建议的对齐方式（已落实）

1. **方案 1 消息形态（已采用）**
   - **Coze 模式**下，后端仅发送一条「请调用 generate_live_script 工具，生成一款{产品名}的{话术类型名}。产品名称：{product_name}，国家：{country}，话术类型：{script_type}，…」由 `buildScriptToolCallMessage` 生成，不再拼接系统提示与任务提醒；提示词与 V3.1 由 Coze 侧工具维护。

2. **表单与参数**
   - 表单字段已与 Coze 规范对齐：产品名称、价格、国家、话术类型、产品特点、目标人群、营销方案、SKU 等。
   - 后端 `parseScriptRequestBody` 已支持上述字段并传入 `buildScriptToolCallMessage`（Coze）或 `buildCozeScriptPrompts`（OpenAI）。

3. **V3.1 格式**
   - Coze 侧工具负责 V3.1；OpenAI 模式下仍在 system / user 中要求 6 环节、### N. 环节名(建议时长)、💡小白主播提示、Before/After，禁止旧 5 环节。

---

## 五、若后续接入 Coze Agent API（带工具）

可参考 Coze 提供的示例：

- 请求体：`type: 'query'`, `session_id`, `message: '请生成话术'`, `content.query.prompt: [{ type: 'text', content: { text: '请调用 generate_live_script 工具，…' } }]`。
- 响应：解析 `tool_calls`，找到 `tool_name === 'generate_live_script'`，从 `result`（JSON）中取 `script` 展示。
- 本仓库可新增例如 `backend/src/services/cozeAgentClient.ts`，实现 `generateScriptViaCozeAgent(params)`，在「使用 Agent API」模式下替代当前对 stream_run 的调用；表单与前端展示可复用现有逻辑。

---

## 六、与 Coze 内部测试不一致时的排查（已修复其一）

| 可能原因 | 说明 | 当前处理 |
|----------|------|----------|
| **Cursor 端调用了其他 LLM（如 OpenAI）** | 管理员将「话术」的 LLM 调用方式选为「OpenAI」时，请求会发往配置的 URL（如豆包/火山），使用 `buildCozeScriptPrompts` 的长提示词，结果与 Coze 内部测试无关。 | **排查**：在「LLM 调用方式」中确认话术为 **Coze Agent**；话术 LLM 配置的 URL 为 Coze 发布站点（如 `https://xxx.coze.site`）。 |
| **Cursor 端绕过了 Agent，用了自建提示词** | 此前仅在「完整销售流程或有营销方案」时发工具调用消息；人群互动等类型会走 `buildLLMSystemPrompt`，把自建提示词发给 Coze，未走工具。 | **已修复**：Coze 模式下**一律**只发工具调用式消息（`buildScriptToolCallMessage` + `toolCallOnly`），所有话术类型都走 Agent/工具，与 Coze 内部测试一致。 |
| **buildCozeScriptPrompts 问题** | 该函数仅用于 **OpenAI 兼容模式**（非 Coze 时）构建长提示词；不会在 Coze 模式下使用。 | Coze 模式不再调用 `buildCozeScriptPrompts`；若需与 Coze 一致，请使用 Coze Agent 模式。 |

**结论**：要与 Coze 内部测试一致，请确保「话术」的 LLM 调用方式为 **Coze Agent**，且配置的 API 地址为 Coze 发布站点；后端会始终只发一条「请调用 generate_live_script 工具，…」消息。

---

**文档目的**：明确 Coze 方案 1（Agent + 工具）与当前 Cursor 实现（stream_run + 工具调用式消息）的差异，以及与 Coze 内部测试不一致时的排查要点。
