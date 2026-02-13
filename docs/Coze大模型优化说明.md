# Coze 大模型专项优化说明

本文档说明针对 **Coze 智能体（stream_run）** 的五项优化：性能与稳定性、体验、成本与效果、可观测性、架构统一。

## 1. 性能与稳定性

### 超时

| 场景 | 环境变量 | 默认值 | 说明 |
|------|----------|--------|------|
| 流式话术（SSE 整流） | `COZE_STREAM_TIMEOUT_MS` | 60000 (60s) | 避免长时间挂起，超时后结束迭代并记录 |
| 一次性调用（待办等） | `LLM_ONCE_TIMEOUT_MS` | 25000 (25s) | 与 OpenAI 分支共用，超时后回退并返回已收集内容 |

### 重试

- **仅对初始 `fetch` 重试**，不对流式读取中段重试。
- **环境变量**：
  - `COZE_MAX_RETRIES`：最大重试次数，默认 2（即最多共 3 次请求）。
  - `COZE_RETRY_DELAY_MS`：退避基数（毫秒），第 n 次重试前等待 `COZE_RETRY_DELAY_MS * (attempt + 1)`，默认 1000。
- **触发条件**：HTTP 5xx 或网络异常时重试；4xx 不重试。

### 统一错误处理

- 所有 Coze 分支错误均使用 `[scriptLLM] [Coze]` 前缀打日志。
- 流式：请求失败或超时则结束迭代，不抛错，由业务侧根据「无内容」做模板兜底。
- 一次性：超时或异常时返回已收集内容或空字符串，并记录统计。

---

## 2. 体验

### 流式与首字延迟

- 保持按 SSE 行解析、解析到即 `yield`，不额外缓冲，首字延迟主要取决于 Coze 端首包时间。
- 流式整体超时由 `COZE_STREAM_TIMEOUT_MS` 控制，超时后立即结束迭代并打日志。

### 超时/错误时的友好降级

- **话术流式**：当 Coze 超时或未返回内容时，后端自动使用模板话术，并在 SSE 最后一条事件中增加 `fallbackReason: 'llm_timeout_or_empty'`。
- **前端**：若实现 `onFallback` 回调（见 `frontend/src/services/ai.ts`），可提示「生成超时或未返回内容，已为您切换为模板话术」。

---

## 3. 成本与效果（提示词与场景区分）

### 场景区分

- **话术生成**（`taskType: 'script'`）：在用户消息前追加固定提醒——「只输出主播可念的话术正文，禁止输出分析报告、行业趋势…」，减少无关输出。
- **待办生成等**（`taskType: 'todo'`）：不追加话术提醒，仅使用接口传入的 `systemPrompt` + `userMessage`，避免待办场景被话术指令干扰。

### 调用方

- `streamScriptFromLLM`：默认 `taskType: 'script'`（话术流式）。
- `callLLMOnce`：由调用方传 `taskType`；待办生成处（如 `ai-refactored.ts`）已传 `taskType: 'todo'`。

---

## 4. 可观测性

### 内存统计（不持久化）

- **位置**：`backend/src/services/scriptLLM.ts` 中 `cozeStats`。
- **字段**：`requests`、`success`、`fail`、`timeout`、`retries`、`lastRequestDurationMs`。
- **获取**：调用 `getCozeStats()` 即可拿到当前统计（可被管理端或运维接口复用）。

### 日志

- 每次 **失败或超时** 会打一行汇总：  
  `[scriptLLM] [Coze] 统计: requests=... success=... fail=... timeout=... retries=... lastMs=...`
- 流式/一次性超时、请求失败（status）、请求异常会单独打 `console.warn`。

### 调试

- 设置 `DEBUG_COZE_STREAM=1` 可将 Coze 流式相关调试信息写入 `backend/coze-stream-debug.log`。

---

## 5. 架构统一

- **超时**：Coze 一次性调用与 OpenAI 分支均使用同一环境变量 `LLM_ONCE_TIMEOUT_MS`，超时后打日志并返回空或已收集内容。
- **错误**：两分支均采用「日志 + 安全返回」策略，不向调用方抛未捕获异常，由业务侧做模板或规则兜底。

---

## 环境变量汇总

| 变量 | 默认 | 说明 |
|------|------|------|
| `COZE_STREAM_TIMEOUT_MS` | 60000 | 流式整流超时（毫秒） |
| `LLM_ONCE_TIMEOUT_MS` | 25000 | 一次性调用超时（Coze 与 OpenAI 共用） |
| `COZE_MAX_RETRIES` | 2 | 初始 fetch 最大重试次数 |
| `COZE_RETRY_DELAY_MS` | 1000 | 重试退避基数（毫秒） |
| `DEBUG_COZE_STREAM` | 0 | 设为 1 时写 coze-stream-debug.log |

---

## 涉及文件

- `backend/src/services/scriptLLM.ts`：Coze 流式/一次性、重试、超时、统计、提示词场景。
- `backend/src/routes/ai-refactored.ts`：待办调用 `callLLMOnce` 传 `taskType: 'todo'`；话术流式返回 `fallbackReason`。
- `frontend/src/services/ai.ts`：流式回调 `onFallback`。
- `frontend/src/components/AIFeatures.tsx`：话术生成处使用 `onFallback` 提示模板降级。
