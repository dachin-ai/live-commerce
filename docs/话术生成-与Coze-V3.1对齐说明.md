# 话术生成 - 与 Coze V3.1 对齐说明

## 一、前端结果与 Coze V3.1 测试不一致的原因

### 1. 只出现「框架」、没有完整话术正文

- **原因**：当**营销方案/促销活动**为空时，系统原先只在使用 `promotionInfo` 时才走 **Coze 风格提示词**（`buildCozeScriptPrompts`）；否则走「标准提示词」（`buildLLMSystemPrompt` + `buildLLMUserMessage`）。标准提示词里含有「设计话术框架、5～15 分钟循环」等描述，模型容易只返回**六段式框架**（【圈人群】【塑品】…）的概要，而不返回可照念的**完整话术正文**。
- **修复**：**完整销售流程话术**（`full-sales` / `full_process`）改为**始终使用 Coze 风格提示词**（与 Coze V3.1 一致），不论是否填写营销方案。未填营销方案时，Coze 侧会强调性价比并用括号建议搭配购买，不会编造促销。

### 2. 时长显示 90-180 秒，与 Coze 文档 5-10 分钟不符

- **原因**：系统内多处将完整销售流程话术的时长写死为「90-180秒」或「2-4分钟」，与 Coze 话术工具文档中的「5-10分钟」不一致。
- **修复**：统一改为 **5-10 分钟**：
  - 路由层模板与 `typicalLengthMap`（`script.ts`）
  - 市调层 Coze 话术类型配置 `typical_length`（`scriptResearch.ts`）
  - 完整流程模板与使用建议（`fullSalesScript.ts`、`script.ts` 内联模板）
  - 话术类型元数据 `duration`（`scriptGeneration.ts`）

### 3. 其他说明

- **产品名称**：截图中的「个锈钢」多为「不锈钢」的笔误，不影响逻辑；系统会按输入的产品名、特点、目标人群生成话术。
- **入参**：country、price、features、target_audience、sku_info、custom_requirements 等已与 Coze 入参对齐；国家可由店铺 region 推导，前端表单已支持产品名、特点、目标人群、话术类型、营销方案、店铺等，其余可选参数可通过后续表单项或 API 传入。

---

## 二、已做修改汇总

| 修改项 | 文件 | 说明 |
|--------|------|------|
| 完整流程话术始终用 Coze 提示词 | `routes/ai/script.ts` | `useCozePrompts = Boolean(promotionInfo) \|\| safeScriptType === 'full-sales'`，并传入 `promotionInfo ?? undefined` |
| 完整流程时长改为 5-10 分钟 | `routes/ai/script.ts` | 模板标题、使用建议、`typicalLengthMap['full-sales']` |
| Coze 话术类型时长 | `rules/scriptResearch.ts` | `typical_length: '5-10分钟'`（full-sales） |
| 完整流程模板时长 | `rules/fullSalesScript.ts` | 标题与文末使用建议改为 5-10 分钟 |
| 话术类型元数据 | `rules/scriptGeneration.ts` | `duration: '5-10分钟'` |

---

## 三、预期效果

- 选择「完整销售流程话术」并点击生成时，**无论是否填写营销方案**，都会按 Coze V3.1 的 5-10 分钟、仅中文、六环节话术来请求与展示。
- 系统直接展示 Coze 原生返回的完整内容（含优化说明、产品信息表等），仅做长度截断（超过 10 万字符时截断并提示）。
- 界面与文档中的时长描述统一为 **5-10 分钟**，与 Coze 话术工具文档一致。
