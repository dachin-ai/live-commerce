# LLM 相关功能 · 稳定性检查

目标：**LLM/Coze 内置规则或输出形态变更时，不破坏终端用户使用**。本文档列出依赖点与降级策略，便于日后规则变更时评估影响。

---

## 1. 话术生成（流式）

### 1.1 我们「依赖」的（协议/结构，非业务规则）

| 依赖项 | 说明 | 若 LLM 侧变更 | 终端影响 |
|--------|------|----------------|----------|
| 请求体格式 | *.coze.site 用旧版 body（content.query + project_id）；非 coze.site 用 content+session_id | 服务端改协议则需同步改 buildCozeStreamRunBody | 可能空响应 → 模板兜底 |
| SSE 结构 | event: message，data 为 JSON；type 含 message_start / answer / tool_request / tool_response / message_end | 若事件名或 data 结构大变 | 0 yield → 模板兜底，有诊断日志 |
| 正文来源 | type=answer 时 content.answer；tool_response 时 content.tool_response.result（JSON 内 script/content 或 tasks）。与《Coze对接说明》一致，推荐 answer/delta 直接输出，tool_response 为兼容 | 若字段名或嵌套变更 | 需扩展 extractCozeContent / extractScriptFromToolResponse |

### 1.2 我们「不依赖」的（已隔离，规则变更不影响）

| 项目 | 说明 |
|------|------|
| 话术环节格式 | 不要求「### 【圈人群】」等固定标题；提示词只传参数，不写输出格式 |
| 环节数量/顺序 | 不解析「必须 6 环节」；由 Coze 侧工具维护 |
| 正文后处理 | 流式路由**仅**：trim、超长截断、空时模板、非中文时翻译；无格式规范化、无按标题裁剪 |

### 1.3 可视化分段（segmentForVisual）与规则变更

- **逻辑**：按 `scriptVisualRules` 的 `startMarker`（如「第一步：圈人群 + 塑品」「【完整销售流程话术」）在正文中查找并分段。
- **若 LLM 改标题/格式**：匹配不到则 `parts.length === 0`，**整段作为「正文」展示**，不报错、不断流。
- **结论**：分段为增强体验，非强依赖；规则变更仅影响「是否多段着色」，不影响「能否看到话术」。

---

## 2. 话术生成（同步）与「像话术」校验

- **resolveScriptContentWithFallback / isLikelyScriptContent**：仅在**非 Coze 提示词**且**同步路径**使用，用于识别「分析报告/行业趋势」等跑题内容并切换模板。
- **流式路由未使用**：流式话术不做「是否像话术」校验，直接展示 LLM 输出。
- **extractScriptBodyForDisplay**：当前仅定义在 scriptOutputValidator，**流式/同步路由均未调用**；若日后启用，依赖 SCRIPT_BODY_START_MARKERS（如 ### 【圈人群】），LLM 改格式会回退为全文展示（startIndex=-1 时 return s）。

---

## 3. 待办生成（LLM 分支）

- **依赖**：期望 LLM 返回含 `tasks` 数组的 JSON（title、description、priority）；解析失败或非数组时走规则兜底。
- **规则变更**：若 Coze/LLM 改为不同 JSON 结构或字段名，需同步调整解析；否则会走规则兜底，**终端仍有待办列表**，只是来源从 LLM 变为规则。

---

## 4. 稳定性原则汇总

| 原则 | 当前实现 |
|------|----------|
| 提示词只传参数 | buildScriptToolCallMessage 仅拼接产品名、国家、话术类型、价格等；无输出格式、无 V3.1 等规则性描述 |
| 后端不改写正文（除翻译） | 流式：trim + 截断 + 空→模板 + 非中文→翻译；无 normalize、无按标题裁剪 |
| 协议与结构可配置/可扩展 | coze.site 用旧版 body；SSE 解析支持 data:/裸 JSON/分两行；answer 与 tool_response 多路径取正文 |
| 降级明确 | 空/超时/抛错 → 模板兜底；0 yield 有诊断日志；分段匹配不到 → 整段展示 |

---

## 5. 日后 LLM 规则变更时的检查清单

- [ ] **协议/事件结构**：若 Coze 调整 SSE 的 type 或 content 结构，检查 scriptLLM 的 extractCozeContent / extractScriptFromToolResponse / isCozeToolCallEvent，必要时扩展兼容新字段或新 type，避免 0 yield。
- [ ] **请求体**：与《Coze 对接协议》一致，*.coze.site 默认用旧版 body（content.query.prompt）。若自建 Agent 仅支持 `{ content, session_id }`，可设 **AGENT_API_BODY=1**；若需强制旧版可设 **COZE_LEGACY_BODY=1**。
- [ ] **可视化分段**：若希望新环节标题也被分段，在 scriptVisualRules（或 config）中增加/修改 startMarker，**不要**在话术正文上做替换或裁剪。
- [ ] **「像话术」校验**：若流式也需跑题检测，再引入 resolveScriptContentWithFallback；OFF_TOPIC_PATTERNS / SCRIPT_LIKE_PATTERNS 可根据实际跑题样本更新，避免误杀正常话术。

---

## 6. Provider 抽象与多 LLM 接入

- **接口**：`IScriptLLMProvider`（`backend/src/services/scriptLLMProvider.ts`），约定 `stream(config, options)` 与可选 `callOnce(config, options)`，路由层仅依赖此接口。
- **调度**：`streamScriptFromLLM` / `callLLMOnce` 通过 `getLLMModesSync().script` 或 `.todo` 得到 mode（即 provider id），再 `getScriptLLMProvider(mode)` 调用对应实现；协议与解析封闭在各 Provider 内。
- **扩展**：新增 LLM 时实现接口并 `registerScriptLLMProvider(id, impl)`，配置侧支持该 id 即可选用；详见 `docs/LLM接入与扩展说明.md`。
- **稳定性**：某一家 LLM 的协议或规则变更只需改该 Provider，不影响其他 Provider 与终端展示。

---

## 7. 相关文件

- **Provider 接口与注册**：`backend/src/services/scriptLLMProvider.ts`
- 请求/SSE/重试/内置 Coze·OpenAI：`backend/src/services/scriptLLM.ts`
- 提示词/参数：`backend/src/rules/scriptResearch.ts`
- 流式路由/只翻译不改写：`backend/src/routes/ai/script.ts`
- 可视化分段（降级为整段）：`backend/src/rules/scriptVisualRules.ts`
- 跑题检测（仅同步/非 Coze 提示词）：`backend/src/services/scriptOutputValidator.ts`
- 系统检查清单：`docs/话术生成-系统检查清单.md`
- **LLM 接入与扩展**：`docs/LLM接入与扩展说明.md`

---

**结论**：当前设计上，**话术的环节格式、环节数、标题样式等「内置规则」均由 LLM/Coze 侧决定，本端只传参数并原样展示正文（+ 翻译）**；协议层（body、SSE 事件与字段）有兼容与诊断，规则变更时仅可能影响分段展示效果，不阻塞终端用户看到话术内容。
