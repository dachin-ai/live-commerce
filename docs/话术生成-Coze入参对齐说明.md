# 话术生成与 Coze 入参对齐说明

本文档说明终端系统与 Coze 话术生成工具入参的对应关系，以及「仅中文 + 终端翻译」的约定。

## 1. 与 Coze 文档的对应关系

Coze 话术生成工具使用文档中的入参与系统实现对应如下：

| Coze 入参 | 类型 | 终端请求字段 | 说明 |
|-----------|------|--------------|------|
| `product_name` | string 必填 | `productName` | 产品名称 |
| `script_type` | string 必填 | `scriptType` | 支持 `full_process`、`interaction`、`scenario`、`promotion`、`closing`；内部 `full-sales` 映射为 `full_process` |
| `country` | string 必填 | `country`（国家名）或 `countryCode`（如 TH/CN） | 目标国家，系统从店铺 region 或 language 推导，也可前端显传 |
| `price` | string 可选 | `price` | 产品价格，可带货币符号（如 ฿2990） |
| `features` | string 可选 | `features` | 产品特点 |
| `target_audience` | string 可选 | `targetAudience` | 目标人群 |
| `promotion_info` | string 可选 | `promotion_info` / `promotionInfo` / `promoCopy` | 促销活动信息 |
| `custom_requirements` | string 可选 | `custom_requirements` / `customRequirements`，或由 `topic`、`style` 合并 | 自定义要求 |
| `sku_info` | string 可选 | `productSku` | SKU 信息，格式参考：S码(尺寸,适用场景);M码(...) |

## 2. 话术类型（script_type）

| 类型 | 说明 | 典型时长 |
|------|------|----------|
| `full_process` | 完整销售流程（6 环节） | 2-4 分钟 |
| `interaction` | 人群互动话术 | 20-60 秒 |
| `scenario` | 场景化塑品话术 | 30-90 秒 |
| `promotion` | 促销活动话术 | 20-60 秒 |
| `closing` | 逼单技巧话术 | 15-45 秒 |

## 3. 语言与翻译约定（与 Coze 文档一致）

- **Coze 侧**：仅生成**纯中文话术**。不生成泰语、英语等非中文正文；本地化元素用中文描述（如「热带气候」「宋干节」），价格处可使用该国货币符号（如 ฿2990）。
- **终端侧**：收到中文话术后，若用户选择的目标语言不是 `zh-CN`，由终端调用翻译服务（`translateLongText`）将话术翻译为目标语言再展示。
- 这样可降低 Coze Token 消耗、提高生成速度，并便于统一翻译与质检。

## 4. 支持的国家与货币

系统已支持 Coze 文档中的 8 个国家，国家名与代码、货币在 `scriptResearch.ts` 的 `getStoreCountry`、`deriveCountryCode`、`COUNTRY_CURRENCY_MAP` 中维护：

- 泰国 TH ฿、印尼 ID Rp、马来西亚 MY RM、菲律宾 PH ₱、新加坡 SG S$、越南 VN ₫、中国 CN ¥、美国 US $

## 5. 实现要点

- **构建 Coze 提示词**：`buildCozeScriptPrompts(research, promotionInfo, countryCode)` 会生成 systemPrompt + userPrompt，其中已按上述入参命名标注（如 product_name、script_type、country、promotion_info、custom_requirements、sku_info），并明确「仅输出纯中文话术」。
- **请求体解析**：`/api/ai/script` 的 `parseScriptRequestBody` 支持 Coze 风格字段（如 `promotion_info`、`custom_requirements`、`country`、`countryCode`），并做国家名→国家代码映射。
- **流式返回**：当使用 Coze 提示词且生成成功时，响应中的 `script.meta` 包含 `localized: true`，与 Coze 返回格式对齐。

## 6. 参考

- Coze 话术生成工具使用文档（产品/运营提供）
- 后端实现：`backend/src/rules/scriptResearch.ts`（`buildCozeScriptPrompts`）、`backend/src/routes/ai/script.ts`（解析与流式）、`backend/src/utils/translate.ts`（终端翻译）
