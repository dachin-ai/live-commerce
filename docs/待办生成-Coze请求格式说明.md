# 待办生成 - 后端发往 Coze 的请求格式

以下为后端在「智能生成」时对 Coze `stream_run` 的**实际请求格式**（代码依据：`scriptLLM.ts` + `ai-refactored.ts`）。  
与 **《Coze 对接协议 - 最终落地方案》** 入参约定一致：`content.query.prompt[0].content.text` = 整条 message。

---

## 1. HTTP 请求

| 项目 | 值 |
|------|-----|
| **Method** | `POST` |
| **URL** | 管理员配置的 API 地址，例如 `https://zbmr4xq6rm.coze.site/stream_run` |
| **Headers** | `Content-Type: application/json`<br/>`Authorization: Bearer <API Key>`（若已配置） |

---

## 2. Request Body（JSON）

后端已按 Coze 发布站点**官方格式**发送，与部署页 curl 示例一致：

```json
{
  "content": {
    "query": {
      "prompt": [
        { "type": "text", "content": { "text": "<下面 3 的 message 全文>" } }
      ]
    }
  },
  "type": "query",
  "session_id": "<每次请求生成的 UUID>",
  "project_id": 7596987147106893834
}
```

- 用户输入（整段 systemPrompt + 【用户请求】 + userMessage）放在 **`content.query.prompt[0].content.text`**。
- `project_id` 默认与「电商运营智能体」一致，可通过环境变量 **`COZE_PROJECT_ID`** 覆盖。
- 待办生成时后端用流式接口收集完整回复后再解析 JSON。**响应约定**：与《Coze对接说明-待办与话术入参出参》一致，正文须在 **answer/delta** 等流式事件中输出，推荐 Coze 在 answer/delta 直接输出 JSON，不依赖 tool。

---

## 3. `message` 的拼装方式（scriptLLM.ts）

当 **taskType = 'todo'** 时，在 `streamCozeAgent` 内：

```text
message = systemPrompt + "\n\n【用户请求】\n" + userMessage
```

- **systemPrompt**：来自 `ai-refactored.ts` 的 `generateIntelligentTodosWithLLM`，强调仅输出 JSON、严禁 markdown/mermaid，并含数据来源与店铺平台一致等要求（详见该文件）。

- **userMessage**：同一函数内拼接，格式固定、内容随店铺与统计数据变化，**含可选【店铺属性】与【已有待办】**：

```text
【店铺】${storeName}（${storePlatform}）| 区域：${region} | 类目：${categories}
【店铺属性】（若有）目标人群、品牌定位、价格区间、品牌策略、店铺说明等

【本周数据】GMV / 时长 / 观看 / 订单 / 转化率 / 时均GMV
【历史对比】平均GMV、平均转化 或「无历史数据」
【时间与节日】季节、月份、即将节日
【阶段与重点】阶段名、重点、趋势、异常摘要
【已有待办】（若有）以下标题已存在，请勿重复生成：标题1；标题2；…

请结合上述**店铺属性与数据**，按不同维度生成若干条差异化待办（与已有待办不重复）。仅输出一个 JSON 对象，不要 markdown、不要代码块、不要 mermaid。
```

即：**后端发给 Coze 的整段内容 = 上面这段 systemPrompt + 换行 + 「【用户请求】」 + 换行 + 上面这段 userMessage（变量已替换为当前店铺/数据）**。

---

## 4. 诊断日志（排查「返回空」）

每次调用 Coze 时，后端会写入 **`backend/coze-debug.log`**（与 DEBUG 环境变量无关）：

| phase | 含义 |
|-------|------|
| `request` | 发送前：messageLen、url、taskType |
| `response_error` | 非 2xx 时：status、bodyPreview（前 500 字） |
| `response_skip` | res 不 ok 或 body 为空时：ok、hasBody |
| `fetch_error` | fetch 抛错时：error 信息 |
| `stream_done` | 流结束：yieldedChunks、yieldedLen、aborted |

若出现「LLM 返回空」，查看该文件最近几条即可判断：是请求未发出、接口报错、还是流式 0 字节。

---

## 5. 代码位置

| 步骤 | 文件 | 说明 |
|------|------|------|
| 拼 systemPrompt / userMessage | `backend/src/routes/ai-refactored.ts` | `generateIntelligentTodosWithLLM` 内 |
| 拼 message、发请求 | `backend/src/services/scriptLLM.ts` | `streamCozeAgent`：`message = systemPrompt + "\n\n【用户请求】\n" + userMessage`；`body: JSON.stringify({ query: message, message, stream: true })` |
| 待办走 Coze 一次性 | `backend/src/services/scriptLLM.ts` | `callLLMOnce` 内 `isCozeStreamRun` 分支，循环消费 `streamCozeAgent` 得到完整字符串再返回 |

---

## 5. 与你在 Coze 里测试的对应关系

你在 Coze 里用的「一条完整测试消息」= **systemPrompt + "\n\n【用户请求】\n" + userMessage**（其中 userMessage 用了示例店铺/数据）。  
后端实际请求里的 **message** 与之一致，只是 **userMessage** 部分会随当前店铺、本周数据、历史、节日、阶段、趋势、异常等变量变化。  
若 Coze 在测试消息下能稳定只回 JSON，同一 Bot、同一接口在应用内「智能生成」时也应收到相同结构的 message，便于只回 JSON。
