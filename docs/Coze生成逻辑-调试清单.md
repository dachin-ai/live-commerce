# Coze 生成逻辑 - 调试清单

本文档以 **Coze 为主体** 梳理所有与「生成」相关的调用链、配置来源与排查要点，便于统一调试。

---

## 一、生成场景总览

| 场景 | 入口 | 调用 Coze 的方式 | 配置来源 | 模式开关 |
|------|------|------------------|----------|----------|
| **话术生成** | `POST /api/ai/script/stream` | `streamScriptFromLLM` → `streamCozeAgent`（流式） | `getEffectiveToolConfigForUser(userId, toolId)` 或 `getScriptLLMConfigSync()` | `getLLMModesSync().script`（coze_agent / openai） |
| **智能待办生成** | `POST /api/ai/generate-tasks` | `generateIntelligentTodosWithLLM` → `callLLMOnce` → `streamCozeAgent`（一次性收集） | `getEffectiveToolConfigForUser(userId, toolId)` 或 `getScriptLLMConfigSync()` | `getLLMModesSync().todo`（coze_agent / openai） |
| **Bot 待办生成** | `POST /api/ai/bot/generate-tasks` | 同上，传 Excel/TSV + 可选 locale/countryCode | 同上 | 同上 |

话术与待办**共用同一套 LLM 配置**（URL、API Key、可选 model）；通过「LLM 调用方式」分别为话术、待办选择 **Coze Agent** 或 **OpenAI 兼容**。

---

## 二、Coze 调用链（scriptLLM.ts）

### 2.1 流式：话术生成

```
streamScriptFromLLM(options)
  → config = options.config ?? getScriptLLMConfigSync()
  → mode = getLLMModesSync().script
  → 若 mode === 'coze_agent':
      cozeUrl = ensureCozeStreamRunUrl(rawUrl)   // coze.site 自动追加 /stream_run
      yield* streamCozeAgent(cozeUrl, apiKey, systemPrompt, userMessage, 'script', false)
```

- **Coze Body**：`buildCozeStreamRunBody(message)`，其中 `message = systemPrompt + 【用户请求】 + userMessage`（话术任务会加「只输出话术」提醒）。
- **会话**：每次请求新 `session_id`，`project_id` 来自 `COZE_PROJECT_ID` 或默认常量。

### 2.2 一次性：待办生成

```
callLLMOnce(options)
  → config = options.config ?? getScriptLLMConfigSync()
  → taskType = options.taskType ?? 'todo'
  → mode = taskType === 'script' ? getLLMModesSync().script : getLLMModesSync().todo
  → 若 mode === 'coze_agent':
      streamCozeAgent(..., taskType, true)  // skipStats=true，由调用方统计
      → 循环收集 chunk 到 full，Promise.race(收集, timeout)
      → 超时 120000ms（待办），25s（默认）
  → 返回 full.trim()
```

- 待办生成传 `taskType: 'todo'`、`timeoutMs: 120000`，不注入话术专用提醒。

### 2.3 Coze 请求与重试

- **URL**：`SCRIPT_LLM_URL` 或库表配置的 url；若为 `coze.site` 且不含 `stream_run`，自动追加 `/stream_run`。
- **重试**：仅对**初始 fetch** 重试，次数 `COZE_MAX_RETRIES`（默认 2），退避 `COZE_RETRY_DELAY_MS * (attempt+1)`。
- **流式超时**：`COZE_STREAM_TIMEOUT_MS`（默认 60s）；一次性超时由 `timeoutMs` 控制。

---

## 三、话术生成（以 Coze 为主体）

### 3.1 流程

1. **权限**：若配置了 `script_llm_allowed_user_ids`，校验当前用户在名单内。
2. **解析**：`parseScriptRequestBody(req.body)` → userInput、storeContext、promotionInfo、countryCode。
3. **市调**：`runScriptResearch(userInput, storeContext)`。
4. **提示词**：
   - **完整销售流程** 或 有营销方案 → `buildCozeScriptPrompts(research, promotionInfo, countryCode)`（Coze 风格，仅中文、5-10 分钟、直接输出完整话术）。
   - 否则 → `buildLLMSystemPrompt` + `buildLLMUserMessage`（含「框架+可念稿」类描述，易出提纲式结果）。
5. **调用**：`streamScriptFromLLM({ systemPrompt, userMessage, temperature: 0.7, config: llmConfig })`。
6. **后处理**：
   - 仅做**长度截断**（>10 万字符截断并提示），**不**做正文提取、不注入可视化动作（Coze 原生输出）。
   - **使用 Coze 提示词且返回非空**：直接展示 Coze 原生内容，不做「是否像话术」校验。
   - **仅当**未使用 Coze 提示词时：若空内容或 `!isLikelyScriptContent(content)` → 模板兜底；模板兜底时才做可视化注入。
   - 合规不通过则追加合规提示；非 zh-CN 则翻译。

### 3.2 调试要点

- **配置**：`getScriptLLMConfigSync()` 或执行工具对应的 `getEffectiveToolConfigForUser(userId, toolId)`。
- **模式**：管理员「LLM 调用方式」中**话术**选 Coze Agent，否则走 OpenAI 兼容。
- **日志**：`backend/coze-debug.log`、`backend/coze-stream-debug.log`（若 `DEBUG_COZE_STREAM=1`）。
- **返回空**：检查 Coze 超时、Bot 是否话术专用、URL 是否为 `.../stream_run`。

---

## 四、待办生成（以 Coze 为主体）

### 4.1 流程

1. **配置**：`getEffectiveToolConfigForUser(userId, req.body?.toolId)` 或 `getScriptLLMConfigSync()`。
2. **数据**：店铺最近 30 天汇总 + 按日明细 TSV（最多 30 天）、历史对比、阶段、节日、趋势、异常摘要、已有待办标题。
3. **提示词**：`generateIntelligentTodosWithLLM` 内拼 `systemPrompt`（禁止工具调用、仅 JSON、语言/地区、直播场景要求）+ `userMessage`（店铺信息、核心指标、历史对比、按日明细、业务上下文）。
4. **调用**：`callLLMOnce({ systemPrompt, userMessage, taskType: 'todo', timeoutMs: 120000, config: llmConfig })`。
5. **解析**：从返回文本中提取 `{"tasks":[...]}`（兼容多种格式），条数 6～10；打标 `assignedRole`、`aiFeature`。
6. **兜底**：若 Coze 返回空则重试最多 2 次（间隔 1.5s）；仍空则规则兜底并写 `llmEmptyReason`。

### 4.2 调试要点

- **locale / countryCode**：`POST /api/ai/generate-tasks` 的 body 可传 `locale`、`countryCode`，会传入 `generateSuggestedTodosForStore` → `generateIntelligentTodosWithLLM`，用于要求 Coze 按语言与地区输出标题与描述。
- **模式**：管理员「LLM 调用方式」中**待办**选 Coze Agent。
- **返回空**：查 `coze-debug.log`、`generate-tasks.log`。与《Coze对接说明》一致，**推荐** Bot 在 **answer/delta** 直接输出，不依赖工具；若仍走工具需在同一条流返回 tool_response。确认返回为纯 JSON 或含 `{"tasks":` 的文本。
- **数据**：确认店铺有最近 30 天 stats，或传入了 `rawDailyTable`；按日明细会出现在 prompt 的【按日明细数据】中。

---

## 五、配置与模式统一

| 项目 | 说明 |
|------|------|
| **配置存储** | 环境变量 `SCRIPT_LLM_URL`、`SCRIPT_LLM_API_KEY`、`SCRIPT_LLM_MODEL` 或库表 `system_config`（key：script_llm_url、script_llm_api_key、script_llm_model）。 |
| **多套工具** | `getEffectiveToolConfigForUser(userId, toolId)` 可按工具返回不同 URL/Key；未配置工具时回退到上述全局话术配置。 |
| **模式** | `getLLMModesSync()` 返回 `script`、`todo` 当前选择（coze_agent / openai），存于 `system_config`（llm_mode_script、llm_mode_todo）。 |
| **默认** | 未配置时 script/todo 均为 `coze_agent`。 |

---

## 六、常见问题与排查

| 现象 | 可能原因 | 排查 |
|------|----------|------|
| 话术一直模板/无流式 | 未配置 LLM 或 URL 错 | 查「管理员」-「LLM 配置」及 `coze-debug.log` |
| 话术返回空 | Coze 超时或 Bot 非话术专用 | 提高 `COZE_STREAM_TIMEOUT_MS`；确认 Bot 为话术生成 |
| 待办 0 条且无兜底 | Coze 返回空或非 JSON | 查 `llmEmptyReason`、`coze-debug.log`、`generate-tasks.log` |
| 待办语言不对 | 未传 locale/countryCode | 前端传 body.locale、body.countryCode；后端已支持透传 |
| 话术被改写成提纲 | 使用了非 Coze 提示词（无营销方案且非完整流程） | 完整销售流程已固定走 Coze 提示词；或填写营销方案 |
| Coze 请求 4xx/5xx | URL/Key 错误或 Coze 限流 | 查 `coze-debug.log` 的 response_error、fetch_error |

---

## 七、本次调试修改

- **待办生成**：`POST /api/ai/generate-tasks` 将 body 中的 `locale`、`countryCode` 传入 `generateSuggestedTodosForStore`，Coze 按用户语言与地区输出待办标题与描述；未传时默认 zh-CN / CN。

---

**文档版本**：与当前代码一致；Coze 为主体时以本文为调试入口。
