# Coze Agent API - SSE（Server-Sent Events）输出结构说明

本文档说明 Agent API 的 SSE 流式输出格式，与 `scriptLLM.ts` 的解析逻辑对齐。

---

## 基本格式

- **event**: 固定为 `message`
- **data**: JSON，含 `type` 与 `content` 等
- 块之间用 `\n\n` 分隔

---

## 消息类型与解析约定

| type | 说明 | 本系统处理 |
|------|------|------------|
| message_start | 请求开始 | 不产出正文 |
| answer | Agent 回答（逐字） | **产出**：取 `content.answer` 拼接流式输出 |
| tool_request | 工具调用请求 | 不产出正文 |
| tool_response | 工具执行结果 | 若为话术/待办类，从 `content.tool_response.result` 解析后 yield；**与《Coze对接说明》一致，推荐正文在 answer/delta 直接输出，tool_response 为兼容路径** |
| message_end | 请求结束 | 不产出正文，可读 code / time_cost_ms |

---

## answer（流式正文）

- 正文在 **`data.content.answer`**（字符串，可能 1～2 字）。
- 客户端需按顺序拼接所有 `type === 'answer'` 的 `content.answer`。

示例：

```json
{"type": "answer", "content": {"answer": "###"}, ...}
{"type": "answer", "content": {"answer": " "}, ...}
{"type": "answer", "content": {"answer": "【"}, ...}
```

---

## tool_response（工具结果）

- `content.tool_response.result` 为 **JSON 字符串**，如：`"{\"status\": \"success\", \"data\": {...}}"` 或待办场景下的 `"{\"tasks\":[...]}"`。
- **话术类工具**：解析 `result` 后取其中的 `script` / `content` / `data.content` 等字段作为话术文本，再按块 yield 做模拟流式。
- **待办生成**：`result` 为 `{"tasks":[...]}` 时，本系统整段作为待办 JSON 解析，见《Coze 对接说明 - 待办与话术入参出参》第二节。

---

## 代码位置

- 正文提取：`backend/src/services/scriptLLM.ts` → `extractCozeContent()`（优先 `content.answer`）、`extractScriptFromToolResponse()`（解析 `content.tool_response.result`）。
- 不产出正文的 type：`isCozeToolCallEvent()` 包含 `tool_request`、`tool_response` 等。

---

**参考**：Coze 官方《SSE（Server-Sent Events）输出结构说明》V3.1
