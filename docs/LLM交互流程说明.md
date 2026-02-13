# 与 LLM 交互流程说明（当前实现）

本文档整理后端与 LLM（话术/待办共用）的配置、调用入口、**Bot 回传数据的处理方式**及兜底逻辑。

**当前约定**：待办生成走两条路径——① 系统内「智能生成」：`POST /api/ai/generate-tasks`（需登录）；② **通过 API 与智能体 Bot 交互**：`POST /api/ai/bot/generate-tasks`（API Key 认证，无需登录，供 Coze/第三方传入 Excel（TSV）+ 提示词，返回待办列表，不写库）。**Agent 协议（/api/agent）已移除**，由本 Bot API 替代。

---

## 1. 配置来源

- **代码位置**：`backend/src/services/scriptLLMConfig.ts`、`backend/src/services/scriptLLM.ts`
- **生效方式**（`getScriptLLMConfigSync()`）：
  - **优先**：环境变量 `SCRIPT_LLM_URL` + `SCRIPT_LLM_API_KEY`（或 `OPENAI_API_BASE` + `OPENAI_API_KEY`）
  - **其次**：数据库 `system_config` 中 `script_llm_url`、`script_llm_api_key`（管理员保存后经 `loadScriptLLMConfigCache` 加载到内存）
- **可选**：`SCRIPT_LLM_MODEL` / `OPENAI_MODEL`（OpenAI 兼容接口时使用）；`COZE_PROJECT_ID`（Coze 发布站点时覆盖默认 project_id）
- **未配置时**：`isScriptLLMConfigured()` 为 false，待办/话术的 LLM 调用不会发起，直接走规则或返回空。

---

## 2. 调用入口概览

| 场景           | 入口函数 / 路由                         | 调用方式        | 说明 |
|----------------|-----------------------------------------|-----------------|------|
| 智能待办生成   | `generateIntelligentTodosWithLLM`        | `callLLMOnce`   | 一次请求，返回完整 JSON 文本后解析 |
| 异常分析待办   | `analyzeAnomaliesWithLLM`               | `callLLMOnce`   | 基于已检测异常生成 1～3 条待办 |
| 话术生成（流式） | `streamScriptFromLLM`（路由 `/api/ai/script/stream`） | Coze 流式 / OpenAI stream | 逐块返回话术正文 |

以下仅展开**智能待办生成**与 LLM 的交互；异常分析、话术流式共用同一套配置与 `callLLMOnce`/流式接口，但 prompt 与解析方式不同。

---

## 3. 智能待办生成：与 LLM 的交互过程

### 3.1 谁在调用（当前唯一路径）

- **系统内智能生成**：前端点「智能生成」→ `POST /api/ai/generate-tasks`（body: `storeId`，可选 `useStatsFromStoreId`、`rawDailyTable`、`metricsOverride`、`userPrompt`）→ 后端 `generateSuggestedTodosForStore(storeId, options)` 内，在「当天往前 30 天」或「系统现有最近 30 天」有数据时调用 `generateIntelligentTodosWithLLM(...)`。**Excel + 提示词入参**：可传 `rawDailyTable`（按日明细 TSV，表头同 `getRawDailyStatsForLLM` 输出）、`metricsOverride`（汇总指标）、`userPrompt`（用户补充说明，追加到 LLM userMessage）；当店铺无 DB 数据但提供了 `rawDailyTable` + `metricsOverride` 时，仍会走 LLM 生成。
- **智能体/第三方**：`POST /api/ai/bot/generate-tasks`，Header `Authorization: Bearer {BOT_API_KEY}` 或 `X-API-Key: {BOT_API_KEY}`，Body 可选 `storeId` 或 `rawDailyTable`+`metricsOverride`，可选 `userPrompt`；后端调用同一套 `generateIntelligentTodosWithLLM`/Coze，返回 `{ success, tasks }`，不写库。

### 3.2 输入：发给 LLM 的内容

- **接口**：`callLLMOnce({ systemPrompt, userMessage, temperature, maxTokens, taskType: 'todo', timeoutMs })`
- **Coze 时**：`systemPrompt` 与 `userMessage` 会拼成一条消息：`${systemPrompt}\n\n【用户请求】\n${userMessage}`，通过 Coze 的 `content.query.prompt[0].content.text` 发送（无 system/user 角色分离）。
- **OpenAI 兼容时**：`messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userMessage } ]`，`stream: false`。

**systemPrompt 要点：**

- 角色：直播电商待办助手；只生成待办，不输出分析/总结/非 JSON。
- **最近发展区**：基于店铺当下数据与直播运营逻辑，产出「当下最应投入」的可执行任务。
- **输出格式**：有且仅有一个 JSON，以 `{"tasks":[` 开头；单条 `{"title","description","priority":"urgent|normal"}`；条数由 Coze 内置规则控制；每条须有具体数字与可执行动作；只输出 JSON。

**userMessage 要点（按块）：**

- 【店铺】名称、平台、区域、类目、店铺属性（目标人群、品牌定位、价格区间等）。
- 【最近30天数据】GMV、时长、观看、订单、转化率、时均 GMV。
- 【历史对比】前 4 个 30 天区间平均 GMV/转化，或无历史。
- 【最近30天按日明细】若有：原始按日表格（TSV），供智能体直接分析。
- 【阶段与重点】阶段名、重点、趋势、异常摘要；说明为系统计算结果供参考，以模型基于明细的结论为准。
- 【时间与自然】季节、月份、即将节日、气温带、天气提示；气温待办维度按 Coze 内置逻辑。
- 【已有待办】若有：最多 15 条标题，避免重复。
- 结尾：按「最近发展区」生成待办，每条须引用具体数据并给出可执行动作。

**不交给 LLM 的：**

- 日期判定逻辑（如「最近一条数据日期是否超过 15 天」）：由系统在生成后根据 `getStoreLatestStatsDate` 判断，必要时系统追加「请上传最近30天的运营数据」待办。

### 3.3 请求参数（callLLMOnce）

- `temperature`：已有待办时 0.75，否则 0.6。
- `maxTokens`：1500。
- `taskType`：`'todo'`（Coze 分支用于区分提示/统计）。
- `timeoutMs`：40000（待办）；Coze 时用该值做一次性超时，超时后返回已收集的文本或空）。

### 3.4 Bot 回传数据的处理方式（当前实现，不走 Agent 协议）

整条链路在 **`POST /api/ai/generate-tasks` → `generateSuggestedTodosForStore` → `generateIntelligentTodosWithLLM` → `callLLMOnce`** 内完成，无单独 Agent 协议分支。

| 阶段 | 位置 | 行为 |
|------|------|------|
| 1. 请求 Coze | `scriptLLM.ts`：`callLLMOnce` → `streamCozeAgent` | 将 systemPrompt + userMessage 拼成一条 message，POST 到 Coze `stream_run`，读 SSE 流。 |
| 2. 从 SSE 提正文 | `scriptLLM.ts`：`streamCozeAgent` 内对每行 `data: {...}` | 用 `extractCozeContent(data)` 从 payload 中取正文（兼容 `type=answer` + `content.answer`、`event=message` + `message.content`、以及 `content`/`text`/`delta`/`answer` 等），逐块 yield。 |
| 3. 拼成完整字符串 | `scriptLLM.ts`：`callLLMOnce` 的 Coze 分支 | `for await (const chunk of streamCozeAgent(...)) { full += chunk }`，返回 `full.trim()`（超时则返回已收集部分或空）。 |
| 4. 抽 JSON | `ai-refactored.ts`：`generateIntelligentTodosWithLLM` | `extractTasksJsonFromText(raw)`：在完整文本中查找以 `{"tasks"` 或 `{"tasks":` 起始的 JSON，用括号平衡截取整段对象；找不到则返回 `{ tasks: [], llmEmptyReason }` 并写日志。 |
| 5. 解析与归一 | `ai-refactored.ts`：同上 | `JSON.parse(jsonStr)` 得到 `parsed.tasks`；若非数组或空则返回 `{ tasks: [], llmEmptyReason }`；否则按标题前 25 字去重，映射为 `{ title, description, priority }`，截断 50/200 字，返回 `{ tasks, llmEmptyReason? }`。 |

**说明**：Agent 协议已移除，不再提供 `/api/agent` 路由；Bot 回传数据的处理仅在系统内「智能生成」路径完成。

### 3.5 响应与解析（小结）

1. **原始返回**：`callLLMOnce` 返回完整字符串（Coze 为流式拼接；OpenAI 兼容为 `choices[0].message.content`）。未配置或请求失败/超时返回空字符串。
2. **空/未配置**：`generateIntelligentTodosWithLLM` 返回 `{ tasks: [], llmEmptyReason }`，上游用规则兜底。
3. **抽取 JSON**：`extractTasksJsonFromText(text)` 在文本中查找以 `{"tasks"` 或 `{"tasks":` 起始的 JSON 子串并截取完整对象；找不到则打日志并返回带 `llmEmptyReason` 的空结果。
4. **解析与校验**：`JSON.parse` 得到 `parsed.tasks`；若非数组或长度为 0，同样返回带原因的空结果。
5. **去重与归一**：对 `list` 按标题前 25 字去重；每条映射为 `{ title, description, priority }`，标题/描述做长度截断（50/200）。

### 3.6 上游如何使用结果

- `generateSuggestedTodosForStore` 得到 `{ tasks, llmEmptyReason? }` 后，若 `tasks` 为空则用 `generateStageBasedTasks` 规则兜底；再经去重、日期判定（最近数据日期距今天 >15 天则追加「请上传最近30天的运营数据」）、空结果兜底，返回 `{ tasks: result, llmEmptyReason }`。
- **POST /generate-tasks**：将该列表经节日合并、同主题去重、主待办条数上限等后写入 DB，并返回 `metadata.llmStatus` / `llmStatusMessage`（若 LLM 返回空则优先展示 `llmEmptyReason`）。

---

## 4. 底层调用：callLLMOnce 行为摘要（按「LLM 调用方式」选择生效）

- **配置**：`getScriptLLMConfigSync()` 为 null 时直接返回 `''`。
- **实际分支由前端「LLM 调用方式」决定**：待办/异常分析用 `getLLMModesSync().todo`，话术流式用 `getLLMModesSync().script`。
- **Coze Agent**（stream_run）：
  - 将 system + user 拼成一条 message，POST 到 Coze 地址（若 URL 为 coze.site 但未含 `stream_run` 则自动追加 `/stream_run`），流式读取 SSE，拼接全部 content 后返回。
  - 超时使用传入的 `timeoutMs`（如 40000），超时后返回当前已拼接字符串或空。
- **OpenAI 兼容**（用户选择该项时）：
  - POST 到 `buildChatCompletionsUrl(config.url)`，body 为 `messages` + `stream: false` + `temperature` + 可选 `max_tokens`。
  - 超时用 `LLM_ONCE_TIMEOUT_MS`（默认 25000），超时或失败返回 `''`。
  - 选择「OpenAI 兼容」时请确保配置的 API 地址支持 OpenAI 格式（如 OpenAI、代理或兼容网关）。

---

## 5. 小结

- **配置**：环境变量或数据库话术 LLM 配置，同步读取；未配置则所有 LLM 待办/话术调用不发起。
- **待办生成**：只把「账户里最近 30 天的数据」及阶段/趋势/异常/时间等作为输入给 LLM；不做「日期判定」说明，日期相关逻辑（如超过 15 天补上传待办）由系统在结果上处理。
- **输出约定**：单一 JSON 对象 `{"tasks":[...]}`；条数由 Coze 内置规则控制。后端兼容两种格式：① `{ title, description, priority }`（priority 为 urgent/normal）；② 电商 Agent API 格式 `{ task, expected_outcome, action_steps, priority }`（priority 为 high 时视为 urgent）。解析失败或为空则返回空数组并走规则兜底。
- **超时与失败**：callLLMOnce 超时或接口失败返回空字符串，上游视为「LLM 未返回」并走规则兜底，同时可设置 `metadata.llmStatus` / `llmStatusMessage` 供前端展示原因。

---

## 6. 相关文档

- **Agent 协议**：已废除，见《LLM与智能生成-文档索引》第四节。
