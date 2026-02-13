# LLM 接入与扩展说明

为后续其他 LLM 接入和定制预留的接口与约定，路由层仅依赖 Provider 抽象，具体协议与解析由各 Provider 实现。

---

## 1. Provider 接口与注册

- **定义位置**：`backend/src/services/scriptLLMProvider.ts`
- **接口**：`IScriptLLMProvider`
  - `id: ScriptLLMProviderId`（如 `coze_agent`、`openai`，或自定义 `doubao`、`zhipu` 等）
  - `stream(config, options): AsyncGenerator<string>`：流式生成，逐块 yield 正文
  - `callOnce?(config, options): Promise<string>`：一次性调用；未实现时由调度层用 stream + 超时收集兜底
- **配置类型**：`ScriptLLMProviderConfig` = `{ url, apiKey, model? }`，与当前 LLM 配置/多工具配置一致
- **选项类型**：`ScriptLLMProviderOptions` = `systemPrompt, userMessage, taskType?, toolCallOnly?, maxTokens?, timeoutMs?, skipStats?`

**注册**：`registerScriptLLMProvider(id, provider)`  
**查询**：`getScriptLLMProvider(id)`、`listScriptLLMProviderIds()`

当前内置并在模块加载时自动注册：`coze_agent`、`openai`。

---

## 2. 如何接入新的 LLM

1. **实现** `IScriptLLMProvider`（新建文件或放在 `scriptLLM.ts` 同目录）  
   - 在 `stream()` 中按该 LLM 的流式协议发请求、解析 SSE/JSON、yield 正文块。  
   - 若有一次性接口，可实现 `callOnce()`；否则不实现，由调度层用 stream + 超时收集。

2. **注册**：在应用启动阶段（如 `backend/src/index.ts` 或单独 `providers/xxx.ts` 在 index 中 require）调用：  
   `registerScriptLLMProvider('你的 id', yourProvider)`

3. **配置选用**（二选一或后续扩展）：  
   - **当前**：话术/待办模式仍为 `coze_agent` | `openai`（`getLLMModesSync().script` / `.todo`）。若新 LLM 希望被选，需在 `scriptLLMConfig` 中扩展 mode 可选值（如增加 `doubao`）并在管理端提供选项。  
   - **后续**：可为多工具表（`llm_tools`）增加 `provider` 字段，按工具指定 provider，调用时用该工具的 `provider` 覆盖全局 mode。

4. **定制点**（均在 Provider 内部完成，不影响路由与稳定性）：  
   - 请求体格式（如 Coze 旧版 body vs Agent 格式）  
   - 请求 URL 路径（如 `/stream_run`、`/v1/chat/completions`）  
   - SSE/JSON 响应解析（如 `content.answer`、`tool_response.result`）  
   - 超时、重试、诊断日志

---

## 3. 与现有模块的关系

| 模块 | 作用 |
|------|------|
| `scriptLLMProvider.ts` | 接口定义、注册表、`getScriptLLMProvider` / `registerScriptLLMProvider` |
| `scriptLLM.ts` | 内置 Coze / OpenAI 实现，实现并注册 `coze_agent`、`openai`；对外 `streamScriptFromLLM`、`callLLMOnce` 通过 `getScriptLLMProvider(mode)` 调度 |
| `scriptLLMConfig.ts` | 单套配置（url/apiKey/model）+ 按功能选择的 mode（script/todo），当前 mode 即 provider id |
| `llmTools.ts` | 多套工具配置；调用时可按「用户选中工具」取 config，后续可在此处传入或解析 `provider` 覆盖 mode |

---

## 4. 稳定性约定

- 路由与业务层**不依赖**具体 LLM 的请求体或响应结构，只依赖「能拿到流式正文块 / 一次性全文」。  
- 新 Provider 的协议与解析变更**仅影响该 Provider 自身**；其他 Provider 与终端展示逻辑不受影响。  
- 提示词与输出格式由各 LLM/Coze 侧或调用方组参决定，不在 Provider 接口中写死「必须某种格式」，参见《LLM相关功能-稳定性检查.md》。

---

## 5. 相关文档

- **稳定性检查**：`docs/LLM相关功能-稳定性检查.md`  
- **话术系统检查清单**：`docs/话术生成-系统检查清单.md`
