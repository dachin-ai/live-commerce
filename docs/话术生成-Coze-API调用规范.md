# 话术生成 - Coze API 调用规范（对齐 Coze 最新规范）

本文档说明如何正确调用 Coze 生成话术、确保输出符合标准格式，以及**本系统（Cursor 项目）**如何满足该规范。

---

## 一、Coze 规范要点

### 1.1 常见问题：输出格式不正确（5 环节旧格式）

**错误输出示例**：出现【开场】【人群互动】【场景化塑品】【促销活动】【逼单技巧】五环节。

**原因**：Agent 未调用 `generate_live_script` 工具，而是直接用自身能力生成话术。

**解决**：请求中明确为「generate_live_script」话术生成任务，并传递完整必需参数。

### 1.2 正确调用方式（Coze 侧）

- **明确指定工具**：在提示中写明「请调用 generate_live_script 工具」。
- **传递完整参数**：至少包含 product_name、script_type、country、price。
- **使用标准术语**：话术类型使用 full_process、interaction、scenario、promotion、closing。

### 1.3 生成话术的必需/可选参数（Coze）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| product_name | string | ✅ | 产品名称 |
| script_type | string | ✅ | 话术类型（full_process / interaction / scenario / promotion / closing） |
| country | string | ✅ | 国家/地区（泰国/印尼/马来西亚/菲律宾/新加坡/越南/中国/美国等） |
| price | string | ✅ | 产品价格（如 ฿2990、¥199） |
| features | string | ⚠️ 可选 | 产品特点 |
| target_audience | string | ⚠️ 可选 | 目标人群 |
| promotion_info | string | ⚠️ 可选 | 促销活动信息 |
| sku_info | string | ⚠️ 可选 | SKU 信息 |
| custom_requirements | string | ⚠️ 可选 | 自定义要求 |

### 1.4 话术类型说明（Coze）

| 话术类型 | 英文标识 | 环节数 | 时长 |
|---------|---------|--------|------|
| 完整流程 | full_process | 6 个环节 | 5–10 分钟 |
| 互动话术 | interaction | 1 个环节 | 1–2 分钟 |
| 场景话术 | scenario | 1 个环节 | 2–3 分钟 |
| 促销话术 | promotion | 1 个环节 | 1–2 分钟 |
| 逼单话术 | closing | 1 个环节 | 1–2 分钟 |

### 1.5 标准输出格式（完整流程 full_process）

- 6 个环节：圈人群、塑品、打消顾虑、利益点、售后、逼单。
- 每环节含：`### N. 环节名(建议时长)`、`💡小白主播提示`、可念话术正文。
- 塑品环节含 **Before（使用前）/ After（使用后）** 对比。

---

## 二、本系统（Cursor 项目）如何满足规范

### 2.1 调用方式说明

本系统**不直接调用 Coze 的「工具」接口**，而是：

1. 前端：话术生成表单收集 **product_name、country、price、script_type、features、target_audience、promotion_info、sku_info** 等。
2. 后端：将上述参数组装成 **系统指令 + 用户请求**，通过 **Coze stream_run** 单条消息发送。
3. 在消息中**标明本请求为 generate_live_script 话术生成任务**，并请 Coze 按当前话术生成标准格式输出（具体版式由 Coze 侧定义，避免本系统写死版本号）。

### 2.2 参数对应关系

| Coze 参数 | 本系统来源 |
|-----------|------------|
| product_name | 表单「产品名称」→ body.productName |
| script_type | 表单「话术类型」→ body.scriptType（full-sales 映射为 full_process） |
| country | 表单「国家」→ body.country；或由店铺 region 推导 |
| price | 表单「价格」→ body.price |
| features | 表单「产品特点」→ body.features |
| target_audience | 表单「目标人群」→ body.targetAudience |
| promotion_info | 表单「营销方案/促销活动」→ body.promotion_info / body.promoCopy |
| sku_info | 表单「产品 SKU」→ body.productSku |
| custom_requirements | 可选，body.custom_requirements |

### 2.3 后端实现位置

- **入参解析**：`backend/src/routes/ai/script.ts` 的 `parseScriptRequestBody`（支持 country、countryCode、productName、scriptType、price、features、targetAudience、promotion_info、productSku、custom_requirements）。
- **提示词组装**：`backend/src/rules/scriptResearch.ts` 的 `buildCozeScriptPrompts`（生成含上述入参的 systemPrompt + userPrompt）。
- **发往 Coze**：`backend/src/services/scriptLLM.ts` 的 `streamCozeAgent`，在话术任务首段标明「generate_live_script」及「按你方当前话术生成标准」输出。

### 2.4 建议

- **国家**：尽量在表单中填写「国家」，与 Coze 必需参数一致；未填时由后端按店铺 region 或语言推导。
- **完整流程**：选择「完整销售流程话术」时，script_type 会以 full_process 形式传给 Coze，输出格式由 Coze 侧标准决定。

---

## 三、错误示例与最佳实践（与 Coze 文档一致）

### 错误示例

- 仅传「生成话术」或仅传 product_name，未传 country、price、script_type → 易导致不调用工具或输出不符合标准。
- 话术类型使用非标准表述（如「生成个完整话术」）→ 应使用 full_process 等标准标识。

### 最佳实践

1. **明确任务**：在请求中标明为 generate_live_script 话术生成任务（本系统已在系统/首段提示中体现）。
2. **参数完整**：至少提供 product_name、country、price、script_type（本系统表单与 API 均支持）。
3. **标准术语**：话术类型使用 full_process、interaction、scenario、promotion、closing（本系统 scriptType 与 Coze 对齐）。

---

## 四、相关文档

- 本系统与 Coze 入参对齐：`docs/话术生成-Coze入参对齐说明.md`
- Coze 调用修复与「按你方标准」说明：`docs/话术生成-Coze-V3.1调用修复说明.md`
- 话术生成与 Coze V3.1 对齐说明：`docs/话术生成-与Coze-V3.1对齐说明.md`

---

**文档依据**：Coze 最新 Cursor API 调用规范（必需参数、话术类型、标准输出格式）。  
**最后更新**：按 Coze 规范更新并同步本系统实现说明。
