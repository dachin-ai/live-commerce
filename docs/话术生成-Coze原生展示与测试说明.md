# 话术生成：Coze 原生展示与测试说明

## 目标

- **使用 Coze 提示词且 LLM 返回非空时**：前端只展示 Coze 原生内容，不做「是否像话术」校验、不替换为模板、不注入「※本环节建议」「此处可停顿」等。
- **仅当 Coze 未返回内容时**：才使用模板兜底，并在后端打日志、前端可提示「已为您切换为模板话术」。

## 已做修改（代码）

1. **兜底决策可测化**（`backend/src/services/scriptOutputValidator.ts`）
   - 新增 `resolveScriptContentWithFallback(content, useCozePrompts, getTemplateContent)`：
     - `useCozePrompts === true` 且 `content` 非空 → 直接返回 `content`，不兜底。
     - 仅当 `content` 为空或（未使用 Coze 且 `!isLikelyScriptContent(content)`）时才用模板。

2. **流式路由**（`backend/src/routes/ai/script.ts`）
   - 使用 `resolveScriptContentWithFallback` 替代原先手写 if/else。
   - 诊断日志：每次请求打 `[script/stream] llmContentLen=%d useCozePrompts=%s`；若走模板兜底则再打 `[script/stream] template_fallback reason=empty|not_script`。

3. **单测**（`backend/scripts/test-script-fallback.ts`）
   - 覆盖：useCozePrompts=true 且非空 → 不兜底；空 → 兜底；useCozePrompts=false 且不像话术 → 兜底；像话术 → 保留原文。
   - 运行：`cd backend && npm run test:script-fallback`（或 `npx tsx scripts/test-script-fallback.ts`）。

## 如何验证「展示的是 Coze 原生」

### 1. 跑单测（必做）

```bash
cd backend
npm run test:script-fallback
```

应看到：`--- 全部通过：使用 Coze 且非空时必展示原生内容 ---`。

### 2. 后端日志（排查是否走了模板）

启动后端后，在执行工具里点击「生成」话术，看控制台：

- `[script/stream] llmContentLen=0 useCozePrompts=true` → Coze 未返回任何内容，会走模板兜底。
- `[script/stream] llmContentLen=1234 useCozePrompts=true` → Coze 有返回，若逻辑正确应**不会**再出现 `template_fallback`，前端应展示这段内容。
- 若出现 `[script/stream] template_fallback reason=empty` → 说明本次请求下 LLM 内容为空，已切换为模板。

### 3. 前端表现

- **Coze 有返回时**：结果区应为 Coze 原始话术，**不应**出现：
  - 「【完整销售流程话术·90-180秒】」或「·5-10分钟」等模板标题
  - 「### 可念稿」「【环节:圈人群】」等模板结构
  - 「※本环节建议」「此处可停顿」「举起来展示」等可视化注入
- **Coze 无返回/超时时**：会展示模板话术，且应出现 Toast：「生成超时或未返回内容，已为您切换为模板话术」。

### 4. 若仍看到模板文案

说明当前请求下 **Coze 未返回内容**（或未走 Coze）。请依次确认：

1. **LLM 调用方式**：管理端「LLM 调用方式」中**话术**是否选为 **Coze Agent**（否则走 OpenAI 兼容，可能未配置或返回空）。
2. **执行工具所用配置**：若执行工具有「选择工具」或 toolId，确认所选工具对应的 Coze URL/Key 正确。
3. **Coze 接口**：URL 是否为 `.../stream_run`；Bot 是否为话术生成专用；网络/超时是否导致无返回。
4. **日志**：查看 `backend/coze-debug.log`、`backend/coze-stream-debug.log`（需 `DEBUG_COZE_STREAM=1`），确认是否有请求与响应。

## MCP 浏览器测试（按模块测试流程）

按 `docs/各模块步骤总结.md` 模块 7 与 `.cursor/skills/module-test-workflow/SKILL.md`：

1. 启动后端：`cd backend && npm run dev`
2. 启动前端：`cd frontend && npm run dev`
3. 使用 MCP 浏览器：打开 `/tools` → 选店铺 → 进入「话术生成」→ 填写产品名/特点/目标人群、话术类型选「完整销售流程话术」→ 点击「生成」
4. 等待流式结束（约 30s～60s，视 Coze 配置而定）
5. 检查结果区：
   - **通过**：内容为连贯话术，且**不包含**上述模板/可视化注入特征，或明确出现「已为您切换为模板话术」且后端有 `template_fallback reason=empty`。
   - **不通过**：内容中出现「可念稿」「【环节:】」「※本环节建议」「此处可停顿」等，且**未**出现「已为您切换为模板话术」→ 说明逻辑仍用模板替换了 Coze 内容，需再查代码与日志。

## 小结

- 逻辑上：**useCozePrompts 且 content 非空 → 只展示 Coze 原生**，已由 `resolveScriptContentWithFallback` 与单测保证。
- 若线上仍为模板，优先查：Coze 是否真有返回（`llmContentLen`、Coze 日志）、话术是否选 Coze Agent、URL/Key 是否正确。
