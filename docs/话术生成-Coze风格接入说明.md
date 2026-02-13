# 话术生成 - Coze 风格接入说明

**更新时间**：2026-02-06

## 概述

已将 Coze 的话术生成提示词结构集成到项目中，支持多种话术类型、多语言、营销方案（promotion_info）等参数。

---

## 改动内容

### 1. 新增 Coze 风格提示词构建函数

**文件**：`backend/src/rules/scriptResearch.ts`

**新增函数**：
```typescript
export function buildCozeScriptPrompts(
  research: ScriptResearchResult, 
  promotionInfo?: string
): {
  systemPrompt: string
  userPrompt: string
}
```

**功能**：
- 按 Coze 的提示词结构生成 `systemPrompt` 和 `userPrompt`
- `systemPrompt`：定义角色（TikTok直播电商话术专家）、核心能力、输出要求、重要原则
- `userPrompt`：包含产品信息、营销方案、店铺数据参考、话术类型配置、话术要求、输出要求
- 支持 5 种话术类型：interaction、scenario、promotion、closing、full-sales（对应 Coze 的 full_process）
- 支持多语言：zh-CN（中文）、th-TH（泰语）、en-US（英语）

**话术类型配置**（`COZE_SCRIPT_TYPE_MAPPING`）：
| scriptType | script_type_name | script_type | typical_length | use_promotion_info |
|------------|------------------|-------------|----------------|-------------------|
| interaction | 人群互动话术 | interaction | 20-60秒 | false |
| scenario | 场景化塑品话术 | scenario | 30-90秒 | false |
| promotion | 促销活动话术 | promotion | 20-60秒 | true |
| closing | 逼单技巧话术 | closing | 15-45秒 | true |
| full-sales | 完整销售流程话术 | full_process | 2-4分钟 | true |

---

### 2. 后端接口更新

**文件**：`backend/src/routes/ai/script.ts`

#### 2.1 新增参数支持

`parseScriptRequestBody` 现在支持：
- `promotion_info` 或 `promotionInfo`（优先）：营销方案/促销活动信息
- `promoCopy`（向后兼容）：原有的促销文案参数
- `full_process`（scriptType）：映射到 `full-sales`

**参数说明**：
```typescript
{
  productName: string         // 产品名称（必填）
  scriptType?: string         // 话术类型，可选：interaction | scenario | promotion | closing | full-sales | full_process
  language?: string           // 语言代码，可选：zh-CN | en-US | th-TH（系统会自动推导国家代码与货币）
  price?: string              // 产品价格（可选）
  features?: string           // 产品特点（可选）
  targetAudience?: string     // 目标人群（可选）
  promotion_info?: string     // 营销方案/促销活动信息（可选，用于 promotion、closing、full-sales 类型）
  storeId?: string            // 店铺ID（可选，用于获取店铺数据、统计与国家/地区信息）
  country?: string            // 国家名称（可选，如"菲律宾"/"Philippines"，用于明确指定国家）
  countryCode?: string        // 国家代码（可选；有 storeId 时无需传，由店铺 region 推导；仅未选店铺且需指定国家时传，如 "PH"/"SG"）
  topic?: string              // 话题/标题（可选）
  duration?: number           // 时长（可选）
  style?: string              // 风格（可选）
}
```

**国家/地区与货币推导逻辑**（优先级从高到低）：

1. **前端传入 `countryCode`**（仅在不选店铺、又需指定国家时使用，优先级最高）
   - 如：`countryCode: "PH"` → 直接使用菲律宾 ₱ PHP  
   - **有选店铺时**：无需传，由店铺的 `region` 自动推导
   - 适用场景：英语市场但需区分美国/菲律宾/新加坡等

2. **前端传入 `country` 国家名**（次优先级）
   - 如：`country: "菲律宾"` 或 `country: "Philippines"` → 映射为 PH
   - 支持中英文国家名自动映射

3. **从 `storeId` 查询店铺的 `region` 字段**（次优先级）
   - 如：店铺 `region: "Manila"` → 匹配关键词推导为菲律宾 PH
   - 如：店铺 `region: "Singapore"` → 推导为新加坡 SG

4. **从 `language` 推导**（最低优先级，有歧义）
   - 如：`language: "en-US"` → 默认推导为美国 US
   - **注意**：英语（en-US）对应多个国家（美国/菲律宾/新加坡等），建议通过上述 1/2/3 方式明确指定

| 国家代码 | 国家 | 货币 | 符号 | 文化表达要点 |
|---------|------|------|------|------------|
| CN | 中国 | 人民币 CNY | ¥ | 使用「元」，强调性价比、品质、实用性 |
| TH | 泰国 | 泰铢 THB | ฿ | 使用「บาท」，重视礼貌、微笑、快乐氛围 |
| VN | 越南 | 越南盾 VND | ₫ | 大数字价格，重视家庭、实用、性价比 |
| US | 美国 | 美元 USD | $ | 使用「dollar/buck」，直接、热情、高效 |
| MY | 马来西亚 | 令吉 MYR | RM | 多元文化，兼顾不同族群习惯 |
| SG | 新加坡 | 新元 SGD | S$ | 重视效率、品质、实用 |
| ID | 印尼 | 印尼盾 IDR | Rp | 大数字价格，重视礼貌、尊重、社区 |
| PH | 菲律宾 | 比索 PHP | ₱ | 热情、友好、重视家庭 |

#### 2.2 流式接口 (`POST /api/ai/script/stream`)

- 自动检测是否有 `promotion_info` 参数
- 如果有 `promotion_info`，使用 `buildCozeScriptPrompts` 生成 Coze 风格提示词
- 否则使用原有的 `buildLLMSystemPrompt` 和 `buildLLMUserMessage`

#### 2.3 返回格式扩展

返回的 `script` 对象增加了 Coze 兼容字段（不影响现有 UI）：
```typescript
{
  // ... 现有字段（id, title, content, duration, style, storeId, createdAt, ...）
  
  // Coze 兼容字段（新增）
  language: string            // 语言代码
  script_type: string         // 话术类型（full-sales 映射为 full_process）
  product_name: string        // 产品名称
  meta?: {                    // 元信息（仅当使用 Coze 提示词时才有）
    length: number            // 话术字符长度
    estimated_duration: string // 预估时长
    has_cta: boolean          // 是否包含行动召唤
    use_promotion_info: boolean // 是否使用促销信息
  }
}
```

---

## 使用示例

### 示例 1：人群互动话术（泰语，泰国市场）

**请求**：
```bash
curl -X POST http://localhost:3000/api/ai/script/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "productName": "珍珠美白精华",
    "scriptType": "interaction",
    "language": "th-TH",
    "price": "299บาท",
    "features": "สารสกัดจากธรรมชาติ, บำรุงผิว, ขาวกระจ่าง",
    "targetAudience": "ผู้หญิงอายุ 20-40 ปี",
    "storeId": "store-123"
  }'
```

**传给 Coze 的提示词包含**：
```
## 国家/地区
- 国家：泰国
- 国家代码：TH
- 货币：泰铢 (THB)
- 货币符号：฿
- 文化表达：使用「บาท」（泰铢）作单位，价格用「X บาท」表达；泰国文化重视礼貌、微笑、sanuk（快乐）氛围

**重要**：请在话术中使用 ฿ 作为货币符号（如价格为"299บาท"），并根据泰国的文化习惯调整表达方式、称呼、语气。
```

**响应**（流式 SSE）：
```
data: {"content":"ทุกคนครับ วันนี้มีผลิตภัณฑ์..."}
data: {"content":" ราคาแค่ 299฿ เท่านั้น..."}
...
data: {"done":true,"script":{...}}
```

**注**：Coze 会根据国家代码自动使用 ฿ 符号，并用泰国本地化的表达风格。

---

### 示例 2：完整销售流程话术（中文，带促销信息，中国市场）

**请求**：
```bash
curl -X POST http://localhost:3000/api/ai/script/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "productName": "珍珠美白精华",
    "scriptType": "full_process",
    "language": "zh-CN",
    "price": "299元",
    "features": "天然珍珠提取物，深层滋养，美白提亮",
    "targetAudience": "25-40岁女性",
    "promotion_info": "限时优惠2小时，买一送一，库存仅剩100件，包邮",
    "storeId": "store-123"
  }'
```

**传给 Coze 的提示词包含**：
```
## 国家/地区
- 国家：中国
- 国家代码：CN
- 货币：人民币 (CNY)
- 货币符号：¥
- 文化表达：使用「元」作单位，价格可用「X元X角」或「XX块」等口语化表达；强调性价比、品质、实用性

**重要**：请在话术中使用 ¥ 作为货币符号（如价格为"299元"），并根据中国的文化习惯调整表达方式、称呼、语气。

## 营销方案/促销活动信息
限时优惠2小时，买一送一，库存仅剩100件，包邮

请将以上促销信息自然融入话术中，特别是在【促销活动】和【逼单技巧】环节。
```

**响应**：
```json
{
  "done": true,
  "script": {
    "id": "uuid",
    "title": "珍珠美白精华 · 话术",
    "content": "【开场】(20-30秒)\n家人们大家好，欢迎来到XXX直播间...\n\n【促销活动】(20-40秒)\n今天299元，买一送一！库存仅剩100件，手慢无！...",
    "duration": 120,
    "style": "专业",
    "storeId": "store-123",
    "createdAt": "2026-02-06T...",
    "dataSource": "llm",
    "language": "zh-CN",
    "script_type": "full_process",
    "product_name": "珍珠美白精华",
    "meta": {
      "length": 1234,
      "estimated_duration": "2-4分钟",
      "has_cta": true,
      "use_promotion_info": true
    }
  }
}
```

**注**：
- 系统从 `storeId` 查询店铺的 `region` 字段推导国家代码（如"中国"→CN，"泰国"→TH）
- 若店铺 `region` 为空，则从 `language` 推导（zh-CN→CN，th-TH→TH，en-US→US）
- Coze 会根据国家代码自动使用正确的货币符号（¥/฿/$）和文化表达

---

### 示例 3：促销活动话术（英语，美国市场）

**请求**：
```bash
curl -X POST http://localhost:3000/api/ai/script/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "productName": "Pearl Whitening Serum",
    "scriptType": "promotion",
    "language": "en-US",
    "price": "$29.99",
    "features": "Natural pearl extract, deep nourishment, whitening effect",
    "targetAudience": "Women aged 20-40",
    "promotion_info": "Flash sale for 2 hours only! Buy 1 Get 1 Free! Limited stock of 100 units!",
    "storeId": "store-123"
  }'
```

**传给 Coze 的提示词包含**：
```
## 国家/地区
- 国家：美国
- 国家代码：US
- 货币：美元 (USD)
- 货币符号：$
- 文化表达：使用「dollar」或「buck」，价格用「$X.XX」表达；美国文化偏好直接、热情、高效的销售风格

**重要**：请在话术中使用 $ 作为货币符号（如价格为"$29.99"），并根据美国的文化习惯调整表达方式、称呼、语气。

## 营销方案/促销活动信息
Flash sale for 2 hours only! Buy 1 Get 1 Free! Limited stock of 100 units!
```

**响应示例**：
```
Hey everyone! Today we have something AMAZING for you - Pearl Whitening Serum, just $29.99!
Natural pearl extract for deep nourishment... Flash sale for 2 hours ONLY! 
Buy 1 Get 1 FREE! We only have 100 units left! Click the cart NOW!
```

**注**：Coze 会根据 US 国家代码使用 $ 符号，并采用美国直播带货的热情、直接、高效风格。

---

### 示例 4：英语话术（菲律宾市场，明确指定国家代码）

**背景**：菲律宾使用英语，但货币是菲律宾比索 ₱ PHP，而非美元。需要明确指定 `countryCode: "PH"`。

**请求**：
```bash
curl -X POST http://localhost:3000/api/ai/script/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "productName": "Pearl Whitening Serum",
    "scriptType": "promotion",
    "language": "en-US",
    "price": "₱499",
    "features": "Natural pearl extract, deep nourishment, whitening effect",
    "targetAudience": "Women aged 20-40",
    "promotion_info": "Limited time offer! Buy 2 Get 1 Free! Only 50 left!",
    "countryCode": "PH",
    "storeId": "store-philippines"
  }'
```

**传给 Coze 的提示词包含**：
```
## 国家/地区
- 国家：菲律宾
- 国家代码：PH
- 货币：菲律宾比索 (PHP)
- 货币符号：₱
- 文化表达：使用「piso」，价格用「₱X」表达；菲律宾文化热情、友好、重视家庭

**重要**：请在话术中使用 ₱ 作为货币符号（如价格为"₱499"），并根据菲律宾的文化习惯调整表达方式、称呼、语气。
```

**响应示例**：
```
Hello everyone! Today we have Pearl Whitening Serum, only ₱499!
Natural pearl extract... Buy 2 Get 1 FREE! We only have 50 units left!
Grab yours NOW! Click the cart button below!
```

**注**：
- 如果不传 `countryCode: "PH"`，仅传 `language: "en-US"`，系统会默认推导为美国（US），货币符号会错误地显示为 $
- **建议**：对于英语市场，明确传入 `countryCode`（PH/SG/MY 等）或在店铺 `region` 中填写国家名

---

### 示例 5：英语话术（新加坡市场，从店铺 region 推导）

**请求**：
```bash
curl -X POST http://localhost:3000/api/ai/script/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "productName": "Pearl Whitening Serum",
    "scriptType": "interaction",
    "language": "en-US",
    "price": "S$39.90",
    "storeId": "store-singapore"
  }'
```

**假设店铺信息**：
```sql
-- stores 表中该店铺的 region 字段
region: "Singapore"  -- 或 "新加坡" 或 "SG"
```

**系统推导**：
- 从 `region: "Singapore"` 匹配关键词 → 国家代码 SG
- 匹配到货币：新加坡元 S$ SGD

**传给 Coze 的提示词包含**：
```
## 国家/地区
- 国家：新加坡
- 国家代码：SG
- 货币：新加坡元 (SGD)
- 货币符号：S$
- 文化表达：使用「Singapore dollar」，价格用「S$X」表达；新加坡文化重视效率、品质、实用
```

**注**：即使 `language` 是 `en-US`，只要店铺 `region` 明确为"Singapore"，系统会正确推导为 SG 并使用 S$ 货币符号。

---

## ⚠️ 英语与多国：语言 vs 地区

### 核心结论

- **菲律宾英语、美国英语、新加坡英语都是「英语」**，不需要在语言选项里再拆成「英语(美国)」「英语(菲律宾)」等。
- **国家/货币由店铺的 region 决定**：创建店铺时填好 `region`（如「菲律宾」「Singapore」「泰国」），话术生成时传 `storeId`，系统用店铺的 `region` 自动推导国家代码与货币符号，**无需在话术表单里再选国家或语言细分**。

### 推导逻辑（话术生成时）

1. **有选店铺**（传了 `storeId`）  
   从该店铺的 `region` 推导国家 → 再推导货币与文化表达。  
   例如：店铺 region 为「Philippines」或「Manila」→ 国家 PH → 货币 ₱、菲律宾文化表达。

2. **未选店铺**（如直接调 API、无 storeId）  
   才退回到用 `language` 推导（en-US 默认 US）。此时若需菲律宾等，可传 `countryCode: "PH"`。

### 建议：创建店铺时填好 region

在创建店铺时把 **地区/国家** 填清楚，后续话术生成即可自动用对货币和表达：

| 目标市场 | region 建议填写 |
|---------|----------------|
| 菲律宾 | Philippines / 菲律宾 / Manila |
| 新加坡 | Singapore / 新加坡 |
| 马来西亚 | Malaysia / 马来西亚 / Kuala Lumpur |
| 美国 | USA / United States |
| 泰国 | Thailand / 泰国 / Bangkok |
| 中国 | China / 中国 / 北京 |

### 各国家/语言与货币（参考）

| 国家 | 语言 | 货币 |
|------|------|------|
| 美国 | 英语 | $ USD |
| 菲律宾 | 英语 | ₱ PHP |
| 新加坡 | 英语 | S$ SGD |
| 马来西亚 | 英语 | RM MYR |
| 泰国 | 泰语 | ฿ THB |
| 越南 | 越南语 | ₫ VND |
| 中国 | 中文 | ¥ CNY |
| 印尼 | 印尼语 | Rp IDR |

同一门「英语」，在不同国家由 **店铺 region** 区分货币与文化，无需在语言上再做选择。

---

## 前端集成

### 更新前端话术生成表单

**文件**：`frontend/src/components/AIFeatures.tsx`

#### 1. 增加「营销方案」输入框（可选）

```tsx
const [promotionInfo, setPromotionInfo] = useState('')

// 在表单中增加
<textarea
  value={promotionInfo}
  onChange={(e) => setPromotionInfo(e.target.value)}
  placeholder="营销方案（可选）：库存余量、限时优惠、赠品等促销信息"
  rows={3}
/>
```

#### 2. 提交时传入参数

```tsx
// 提交时传入（无需单独传 countryCode）
await generateScriptStream({
  productName,
  scriptType,
  language,
  price,
  features,
  targetAudience,
  promotion_info: promotionInfo,
  storeId: selectedStore?.id,  // 有店铺时，国家/货币由店铺的 region 自动推导
})
```

**说明**：创建店铺时已填写 `region`（如「菲律宾」「Singapore」「泰国」），话术生成时只需传 `storeId`，系统会从店铺的 `region` 自动推导国家与货币，**无需在话术表单里再选国家或语言细分**。菲律宾英语、美国英语、新加坡英语都是「英语」这一种语言，区别仅在于店铺所在地区（region）决定的货币符号与文化表达。

---

## 对比：Coze 提示词 vs 原有提示词

### Coze 风格（新）

**优势**：
- 提示词结构清晰，分为 system 和 user
- 话术类型配置明确（key_elements、typical_length、cta_requirement）
- 支持营销方案（promotion_info）专用字段
- 多语言适配更完善（语言名称映射）
- **国家与货币自动识别**：从店铺或语言推导国家代码，自动匹配货币符号与文化表达
- 输出要求明确（语言、长度、风格、格式、行动召唤）

**适用场景**：
- 需要营销方案/促销信息的话术（promotion、closing、full-sales）
- 多语言生成（尤其泰语、英语）
- 完整销售流程话术（full_process）
- 跨国店铺（泰国/越南/美国等不同货币市场）

### 原有提示词（旧）

**优势**：
- 整合了店铺数据、平台合规、品类实践（scriptResearch）
- 支持市调摘要（summaryForLLM）
- 有禁词、慎词、品类框架等规则

**适用场景**：
- 需要深度整合店铺/品类/合规信息的话术
- 不需要 promotion_info 的简单话术

---

## 兼容性说明

1. **向后兼容**：不传 `promotion_info` 时，仍使用原有提示词
2. **参数映射**：
   - `full_process` → `full-sales`
   - `promotion_info` / `promotionInfo` → `promoCopy`（内部）
3. **返回格式**：新增字段为可选，不影响现有 UI

---

## 🌍 国家/货币统一机制（新增）

**问题背景**：不同国家/地区的直播带货使用不同货币符号和文化表达，如果 Coze 不知道目标市场，可能混用货币或使用不符合当地习惯的表达。

**解决方案**：在传给 Coze 的提示词中明确包含：
- 国家名称与代码（如"泰国 TH"）
- 货币全称、代码、符号（如"泰铢 THB ฿"）
- 文化表达要点（如"泰国重视礼貌、微笑、sanuk氛围"）

**推导逻辑**：
1. 优先从 `storeId` 查询店铺的 `region` 字段（如"泰国"/"Thailand"/"TH"）
2. 若 `region` 为空，从 `language` 推导（zh-CN→CN，th-TH→TH，en-US→US）
3. 匹配 `COUNTRY_CURRENCY_MAP` 获取货币与文化信息

**支持的国家与货币**（8 个）：
- 🇨🇳 中国（CN）：人民币 ¥ CNY
- 🇹🇭 泰国（TH）：泰铢 ฿ THB
- 🇻🇳 越南（VN）：越南盾 ₫ VND
- 🇺🇸 美国（US）：美元 $ USD
- 🇲🇾 马来西亚（MY）：令吉 RM MYR
- 🇸🇬 新加坡（SG）：新元 S$ SGD
- 🇮🇩 印尼（ID）：印尼盾 Rp IDR
- 🇵🇭 菲律宾（PH）：比索 ₱ PHP

**效果**：
- ✅ 泰国店铺生成的话术自动使用 ฿ 而非 ¥
- ✅ 美国店铺的话术自动使用 $ 并采用美式热情风格
- ✅ 越南/印尼的大数字价格自动适配（如 ₫299,000、Rp299,000）
- ✅ 文化表达自动本地化（如中国强调"性价比"，美国强调"value"）

---

## 测试建议

### 1. 单元测试

在 `backend/src/rules/scriptResearch.test.ts` 中增加：
- `buildCozeScriptPrompts` 各话术类型的输出格式验证
- `promotion_info` 有无时的提示词差异验证
- 多语言映射验证

### 2. 接口测试

使用 Postman 或 curl 测试：
- 各话术类型 + 各语言的组合
- 带 `promotion_info` 与不带的对比
- `full_process` 类型的完整销售流程话术

### 3. 前端集成测试

- 在「执行工具」-「话术生成」中增加「营销方案」输入框
- 测试泰语、英语、中文的话术生成
- 验证返回的 meta 字段

---

## 相关文件

- **提示词构建**：`backend/src/rules/scriptResearch.ts`（新增 `buildCozeScriptPrompts`）
- **后端路由**：`backend/src/routes/ai/script.ts`（支持 `promotion_info` 和 `full_process`）
- **前端服务**：`frontend/src/services/ai.ts`（已有 `GenerateScriptParams` 类型，可扩展）
- **前端组件**：`frontend/src/components/AIFeatures.tsx`（话术生成表单）
- **Coze 原始代码**：用户提供的 Python 工具函数（参考）

---

## 下一步

1. **前端增加「营销方案」输入框**（可选，根据需求）
2. **测试 Coze 智能体 API**：确认项目的 Coze 配置能正确调用（URL、API Key、model）
3. **多语言话术验证**：尤其泰语（th-TH）的本地化表达
4. **完整销售流程话术验证**：确认 full_process 类型的输出结构符合 Coze 规范

---

**完成时间**：2026-02-06  
**测试状态**：后端编译通过，待前端集成与接口测试
