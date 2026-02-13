# AI 话术技术实现说明

本文说明本项目中「AI 话术生成」的架构、与参考方案（LLM 流式）的对比，以及可选的 LLM + 流式优化方式。

---

## 1. 整体架构（当前实现）

```
┌─────────────────┐     POST /api/ai/script      ┌─────────────────────────────┐
│   前端 (React)   │ ───────────────────────────▶ │   Express 路由 (ai-refactored) │
│  AIFeatures.tsx  │     JSON body                │   POST /script               │
│  generateScript()│                              └──────────────┬──────────────┘
└────────┬────────┘                                             │
         │                                                       ▼
         │  res.json(script)                    ┌───────────────────────────────┐
         │◀─────────────────────────────────────│  规则层（无 LLM 调用）         │
         │  一次性返回                           │  1. runScriptResearch()       │
         │                                       │  2. synthesizeScript()         │
         │                                       │  3. injectVisualSuggestions() │
         │                                       │  4. segmentForVisual()        │
         │                                       └───────────────────────────────┘
         │                                       数据来源：用户输入 + 店铺上下文
         ▼                                       产出：规则+模板拼接的完整话术
  展示 content / visualParts / visualLegend
```

- **当前无 LLM**：话术由「市调 + 模板/规则」直接生成，不调用大模型。
- **一次性返回**：接口返回完整 `script` 对象（content、visualParts、visualLegend 等），无流式。
- **规则位置**：`backend/src/rules/`（scriptResearch、scriptSynthesis、scriptPrompts、fullSalesScript、platformCompliance、scriptVisualRules 等）。

---

## 2. 核心代码实现

### 2.1 后端接口（`backend/src/routes/ai-refactored.ts`）

- **路由**：`POST /api/ai/script`
- **流程**：
  1. 解析 body：productName、price、features、targetAudience、scriptType、language、promoCopy、storeId 等。
  2. 若有 storeId：查库得到 storeContext（店铺名、平台、品类、近期统计）。
  3. 调用 `runScriptResearch(userInput, storeContext)` 得到市调结果（含 summaryForLLM、platformRule、categoryPractices 等）。
  4. 调用 `synthesizeScript(research)`：
     - 内部使用 `buildScriptContent(scriptType, language, params)`（即 scriptPrompts + fullSalesScript 的规则/模板）。
     - 再按平台与品类做 `checkPlatformCompliance`，并拼接数据来源说明与合规提示。
  5. 对合成后的 content 做 `injectVisualSuggestionsIntoContent`（按话术段落抓卖点 → 配置驱动演示动作）。
  6. `segmentForVisual`、`getVisualLegend` 得到 visualParts、visualLegend。
  7. 一次性 `res.json(script)`。

### 2.2 提示词与 LLM 预留（未接 LLM 时未使用）

- **scriptResearch.ts**：
  - `buildSummaryForLLM()`：把用户输入、店铺数据、平台合规、品类实践、产出要求等整理成「市调摘要」。
  - `buildLLMSystemPrompt(research)`：生成系统提示词（角色、合规、结构、避免硬编码等）。
  - `buildLLMUserMessage(research)`：市调摘要 + 「请根据以上市调摘要，生成符合要求的话术内容」。
- 当前路由**没有**调用任何 LLM，上述函数仅为「若接 LLM 时」的提示词构建预留。

### 2.3 多语言与话术类型

- **语言**：zh-CN、en-US、th-TH，在 `scriptPrompts` / `fullSalesScript` 中按 language 分支生成不同语种话术。
- **话术类型**：interaction、scenario、promotion、closing、full-sales；每种类型在 scriptPrompts 与 fullSalesScript 中有对应模板与结构（见《话术生成规则说明》）。

---

## 3. 与参考方案（LLM + 流式）的对比

| 对比项       | 本项目当前实现           | 参考方案（如豆包 + SSE）     |
|--------------|--------------------------|------------------------------|
| 生成方式     | 规则 + 模板拼接          | LLM 流式生成                 |
| 输出方式     | 一次性 JSON              | SSE 流式，打字机效果         |
| 提示词       | 仅预留（未用）           | 按语言/话术类型构建 system + user prompt |
| LLM 调用     | 无                       | 有（如 coze-coding-dev-sdk / 豆包） |
| 限流         | 全局 15 分钟 500 次      | 可针对话术接口单独限流（如 1 分钟 10 次） |
| 前端展示     | 一次性展示全文           | 逐字/逐句追加（ReadableStream + getReader） |

参考方案优点：体验上「边生成边看」、可接入更强创意与多样性；本项目当前优点：无外部依赖、可预测、合规与结构由规则强约束、无 LLM 成本。

---

## 4. 可选优化：LLM + 流式接口

在保留当前「规则模板」为主的前提下，可增加**可选** LLM 与流式输出，与参考方案对齐部分能力。

### 4.1 设计思路

- **双模式**：
  - **未配置 LLM**：行为与现在一致，仅由规则层生成话术；流式接口可对「模板结果」做单次 SSE 推送，前端仍可统一按流式 UI 消费。
  - **已配置 LLM**：用 `buildLLMSystemPrompt` + `buildLLMUserMessage` 调用外部大模型（OpenAI 兼容 API 或豆包等），以 SSE 流式返回生成内容；最后再补一次合规与可视化后处理（或仅对 LLM 输出做合规检查与分段）。
- **流式协议**：与参考方案一致，便于前端复用。
  - 事件格式：`data: {"content": "..."}\n\n`（文本块）、`data: {"done": true, "script": {...}}\n\n`（结束并带完整 script 对象）。
  - 前端：`fetch` + `response.body.getReader()` 解析 SSE，将 `content` 追加展示（打字机效果），收到 `done` 后更新为完整 script。

### 4.2 后端已实现（可选 LLM + 流式）

- **LLM 适配层** `backend/src/services/scriptLLM.ts`：
  - 环境变量：`SCRIPT_LLM_URL`（或 `OPENAI_API_BASE`）、`SCRIPT_LLM_API_KEY`（或 `OPENAI_API_KEY`）、`SCRIPT_LLM_MODEL`（或 `OPENAI_MODEL`，默认 `gpt-4o-mini`）。
  - 若未配置：`isScriptLLMConfigured()` 为 false，流式接口回退到模板生成。
  - 若已配置：调用 OpenAI 兼容的 chat completions（stream: true），逐块 yield 文本。
- **流式路由** `POST /api/ai/script/stream`：
  - 入参与 `POST /api/ai/script` 一致；先执行 `runScriptResearch`。
  - 若配置了 LLM：用 `buildLLMSystemPrompt` / `buildLLMUserMessage` 流式生成，每块发送 `data: {"content": "..."}\n\n`；结束后做合规检查与可视化，再发 `data: {"done": true, "script": {...}}\n\n`。
  - 若未配置 LLM：用 `synthesizeScript` 得到 content，再做注入与分段，先发一整段 `data: {"content": content}\n\n`，再发 `data: {"done": true, "script": {...}}\n\n`。
  - 响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`。

### 4.3 前端已实现

- **流式请求**：`generateScriptStream(params, { onChunk, onDone, onError })`（`frontend/src/services/ai.ts`），使用 `fetch('/api/ai/script/stream')` + `getReader()` 解析 SSE，对 `content` 调用 `onChunk`，对 `done` 调用 `onDone(script)`。
- **打字机效果**：话术工具表单有「流式生成（打字机效果）」选项；勾选后生成时先展示空内容并设 `streaming: true`，每收到一块追加到 `streamingContent` 并渲染，结束时用完整 `script` 替换结果（含 visualParts、visualLegend）。

### 4.4 限流（参考方案）

- 可为 `POST /api/ai/script` 与 `POST /api/ai/script/stream` 单独做更严格限流（例如每 IP 每分钟 10 次），与参考方案一致，减少滥用。

---

## 5. 小结

| 项目         | 说明 |
|--------------|------|
| **当前实现** | 规则 + 模板驱动，市调 → 综合产出 → 合规 → 可视化，一次性 JSON；无 LLM、无流式。 |
| **参考方案** | LLM 流式生成 + SSE + 打字机效果；提示词按语言/话术类型构建。 |
| **优化方向** | 保留现有规则管线，增加可选 LLM + 流式接口（双模式）；前端增加流式消费与打字机展示；话术接口可单独限流。 |

《话术生成规则说明》描述话术逻辑与可视化规则；本文描述技术架构与可选 LLM/流式方案，便于与参考实现对照与迭代。
