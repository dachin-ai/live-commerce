# LLM 问题排查 - Coze 返回 0 的根本原因

**排查日期**：2026-02-10  
**问题描述**：终端用户点击「智能生成」后，LLM 返回 0 条，走规则兜底

---

## 🔍 问题定位

### 测试结果

| 测试场景 | prompt 长度 | 耗时 | 返回内容 | 结果 |
|---------|-----------|------|---------|------|
| **短 prompt**（简单测试） | 102 字符 | 2.7s | JSON（1条待办） | ✅ 成功 |
| **长 prompt**（真实场景） | 2152 字符 | 60s | (空) | ❌ 超时 |

### 日志分析

**coze-debug.log**：
```
[request] messageLen: 2106, url: https://zbmr4xq6rm.coze.site/stream_run
[stream_done] yieldedChunks: 0, yieldedLen: 0, aborted: true
```

**coze-stream-debug.log**（历史成功记录）：
```json
{"type": "tool_request", "tool_name": "search_festival_events", ...}
{"type": "tool_response", "result": "【泰国 2025节庆活动】\n\n活动概览..."}
{"type": "answer", "content": {"answer": "# "}}
{"type": "answer", "content": {"answer": "泰国"}}
{"type": "answer", "content": {"answer": "美妆"}}
```

---

## ❌ 根本原因

**Coze bot 配置问题：**

1. **Bot 调用了外部工具**  
   - `search_festival_events`（查询节日）  
   - `search_competitor_insights`（竞品洞察）  
   - 工具调用耗时长（每个 5-10 秒），累计可能超过 40 秒

2. **Bot 输出格式错误**  
   - 输出的是 **markdown 分析文本**（"# 泰国美妆..."）  
   - **不是 JSON 格式**（应为 `{"tasks":[...]}`）  
   - 导致系统解析失败，认为「返回空」

3. **Bot 没有遵守 systemPrompt**  
   - systemPrompt 明确要求「只输出 JSON、不输出任何分析」  
   - 但 bot 仍然输出了分析内容并调用工具  
   - 可能是 bot 端配置了「强制工具调用」或「忽略用户指令」

---

## ✅ 解决方案

### 方案 A：修复 Coze bot 配置（推荐）

**到 Coze 控制台检查并修改：**

1. **禁用工具调用**（或仅在明确需要时调用）
   - 进入 bot 编辑页 → 工具配置
   - 关闭 `search_festival_events`、`search_competitor_insights` 等工具
   - 或设置「仅在用户明确要求时调用工具」

2. **设置输出格式约束**
   - 在 bot 人设/开场白中加入：
     ```
     【输出约束】你必须只输出 JSON 格式，直接以 { 开头，禁止输出任何分析、总结、markdown 标题。
     示例：{"tasks":[{"title":"...","description":"...","priority":"urgent"}]}
     ```

3. **增强 JSON 输出要求**
   - 在 bot 配置中设置「响应格式」为「结构化输出」或「JSON only」
   - 如果 Coze 支持，设置「禁止自由文本，只输出JSON」

4. **测试验证**
   - 用 `backend/coze-input-sample-utf8.txt` 的内容去 Coze 控制台手动测试
   - 确认输出是纯 JSON，不含工具调用和 markdown

---

### 方案 B：修改 systemPrompt（临时方案）

在当前 systemPrompt 开头增加更强硬的约束：

```typescript
// ai-refactored.ts L1487
const systemPrompt = `【严格要求】你必须立即输出 JSON，不要调用任何工具，不要输出分析、标题、总结。直接以 { 开头。

你是专业的直播电商待办助手。根据下方提供的**必要参数**与**店铺直播明细**生成待办事项，不输出任何分析、总结或非 JSON 内容。系统会提供阶段、趋势、异常等基于汇总数据的计算结果供参考；你同时会收到按日明细。若你基于明细的分析与上述参考不一致，以你基于明细的结论为准生成待办。

【最近发展区】在本产品中指：基于店铺当下的数据情况（GMV、转化率、场次、观看、趋势、异常等）和直播运营逻辑，产出**当下最应该投入运营**的任务——即与当前阶段、当前数据短板、直播节奏/内容/转化最匹配、可立即落地的待办，而非泛泛建议。

【输出格式】有且仅有一个 JSON 对象，直接以 {"tasks":[ 开头，无任何前缀或后缀。两种格式均可：① {"tasks":[{"title":"标题","description":"描述","priority":"urgent或normal"}]}；② {"tasks":[{"task":"标题","expected_outcome":"预期效果","action_steps":["步骤1","步骤2"],"priority":"high或normal"}]}（high 等同 urgent）。条数由你根据数据合理控制。每条须结合上述数据写出具体数字与可执行动作。只输出 JSON。

【再次强调】不要调用工具，不要输出 #、##、分析等任何非 JSON 内容。立即输出 JSON。`
```

**优点**：快速修复，无需等 Coze 端配置  
**缺点**：治标不治本，bot 可能仍然尝试调用工具

---

### 方案 C：缩短入参（临时）

如果 Coze bot 对长文本处理慢，可以临时缩短：

```typescript
// getRawDailyStatsForLLM 中限制行数
const rows = await dbAll<...>(
  `... WHERE storeId = ? AND date >= ? AND date <= ? 
   ORDER BY date DESC LIMIT 15`  // ← 只取最近 15 天
)
```

或在 systemPrompt 中去掉冗余说明，只保留核心约束。

---

## 🎯 推荐操作步骤

### 立即执行（方案 A + B）

1. **检查 Coze bot 配置**  
   - 登录 Coze 控制台  
   - 找到 project_id `7596987147106893834` 的 bot  
   - 检查是否配置了 `search_festival_events` 等工具  
   - 如果有，暂时禁用或设置「不自动调用」

2. **增强 systemPrompt**  
   - 在开头加「【严格要求】禁止调用工具，立即输出 JSON」  
   - 我可以帮您修改代码

3. **验证**  
   - 重启后端（`loadScriptLLMConfigCache` 会重新加载）  
   - 前端点击「智能生成」测试

---

## 📋 对比：成功 vs 失败

| 维度 | 短 prompt（成功） | 长 prompt（失败） |
|-----|-----------------|-----------------|
| 长度 | 102 字符 | 2152 字符 |
| 耗时 | 2.7s | 60s（超时） |
| bot 行为 | 直接输出 JSON | 调用工具 + 输出 markdown |
| 返回内容 | `{"tasks":[...]}` | 空（或只有 "# 泰国美妆..."） |

**结论**：Coze bot 在处理长 prompt 时的行为与短 prompt 完全不同，可能是 bot 内部逻辑分支（长文本触发了工具调用）。

---

## 🛠️ 临时解决方案（我可以立即实施）

**方案 1：增强 systemPrompt（2 分钟）**  
在开头加强硬约束，禁止 bot 调用工具。

**方案 2：缩短按日明细（5 分钟）**  
只传最近 15 天数据，减少 token 消耗。

**方案 3：增加超时到 90s（1 分钟）**  
给 Coze bot 更多时间完成工具调用。

---

## 📞 需要您确认

**请您确认**：
1. 是否可以到 Coze 控制台禁用工具调用？（最根本的解决方法）
2. 或者我先实施临时方案（增强 systemPrompt + 缩短数据）？

**我建议**：  
先实施**方案 1 + 方案 2**（增强 systemPrompt + 缩短数据到 15 天），然后重新测试。如果还不行，再到 Coze 端禁用工具调用。
