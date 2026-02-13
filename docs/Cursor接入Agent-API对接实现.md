# Cursor / 外部系统接入 Agent API 对接实现

本文档记录本系统为《Cursor系统接入API使用指南》所做的对接实现，便于 Cursor 端或其它调用方使用统一 Agent 接口。

---

## 1. 请求体格式

- **本系统对 \*.coze.site 实际使用**：**legacy 体**（`content.query.prompt[0].content.text` = 整条 message，另含 `type`、`session_id`、`project_id`），与《Coze 对接协议》一致，见 `docs/Coze对接说明-待办与话术入参出参.md`。
- **仅当自建 Agent 且接口只支持** `{ content, session_id }` 时，设 **`AGENT_API_BODY=1`** 后本系统才改为发送该格式。
- **代码位置**：`backend/src/services/scriptLLM.ts` 中 `buildCozeStreamRunBody()`。

---

## 2. 响应解析（SSE）

- **事件**：`event: message`，`data` 为 JSON。
- **正文来源**：`type === 'answer'` 时优先取 `data.content.answer`（与 Coze SSE 说明一致），兼容顶层 `data.answer`。
- **代码位置**：`scriptLLM.ts` 中 `extractCozeContent()`。

---

## 3. 工具响应（tool_response）与模拟流式

- **与《Coze对接说明》一致**：正文**推荐**在 **answer/delta** 中直接流式输出；`tool_response` 为兼容路径。
- **监听**：SSE 解析到 `type === 'tool_response'` 时，从 payload 中提取话术/待办文本。
- **提取逻辑**：`extractScriptFromToolResponse(data)` 从 `content.tool_response.result`（JSON 字符串）解析，再取 `script` / `content` / `data.content` 或 `tasks` 等字段（与 Coze SSE 说明一致）。
- **输出方式**：若提取到非空字符串，则按固定块长（如 80 字符）分段 `yield`，实现「模拟流式」输出，便于前端打字机效果。
- **代码位置**：`scriptLLM.ts` 中 `extractScriptFromToolResponse()` 与 `streamCozeAgent` 循环内对 `tool_response` 的分段 yield。

---

## 4. 前端占位与模拟流式显示

- **占位**：流式且无内容时仅展示「正在生成话术，请稍候…」（`tools.streamPlaceholder`）；有内容后直接显示流式正文 + 闪烁光标。已取消「连接中」单独阶段。
- **无障碍**：`<pre>` 使用 `min-h-[8rem]`、`role="status"`、`aria-live="polite"`。
- **模拟流式**：当 `onDone(script)` 时，若已流式接收长度 &lt; 完整话术 20%，则用定时器将 `script.content` 分段追加到展示区，形成打字机效果后再写入最终结果并清空流式状态。
- **多语言**：`tools.streamPlaceholder` 已加入 zh-CN / en-US / th-TH。
- **代码位置**：`frontend/src/components/AIFeatures.tsx`（streamedLengthRef、simulatingStreamRef、onChunk/onDone、pre 占位与光标）。

---

## 5. 参考文档

- **入参/出参主约定**：`docs/Coze对接说明-待办与话术入参出参.md`（请求体对 *.coze.site 为 legacy；正文须在 answer/delta 输出，推荐不依赖 tool）。
- 接口与使用方式以《Cursor系统接入API使用指南》为准（`POST /stream_run`、SSE 事件类型等）。
- **Coze SSE 结构**：`docs/Coze-Agent-SSE输出结构说明.md`（answer 取 `content.answer`，tool_response 取 `content.tool_response.result`）。
- 话术流式与 Coze 实现：`docs/话术生成-Coze方案与当前实现对照.md`。

---

**最后更新**：按对接指南完成请求体、answer 解析、tool_response 话术提取与模拟流式、前端进度与模拟流式显示。
