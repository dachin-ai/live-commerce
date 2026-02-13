# 待办生成 - 如何确认「控制台对话」与「API 调用」行为不一致

当 Coze 控制台里用测试消息能正确返回待办 JSON，但本系统「智能生成」仍走规则兜底时，可按下面步骤确认是否是**同一 Bot 在 API 下行为不同**。

---

## 1. 用 API 发一条与控制台相同的消息

在 Coze「电商运营智能体」的**部署**页，会看到类似：

- **接口地址**：`POST https://zbmr4xq6rm.coze.site/stream_run`
- **Body 参数**：例如 `text`（输入文本），或文档里的 `content.query.prompt[0].content.text` 等

请按部署页当前展示的 **Body 参数说明** 和 **curl 示例**，把「测试消息」作为**用户输入**发一次 API 请求。

### 1.1 测试消息内容

使用 `docs/Coze待办生成-测试消息.md` 里**方式一**的整段（从「你是直播电商待办助手」到「条数按需。」），即与本系统后端发给 Coze 的 `message` 一致的那段。

### 1.2 用 curl 调用（按部署页格式填）

部署页上通常会有 curl 示例，结构可能类似下面两种之一（以你当前部署页为准）：

**格式 A：简单 query / message**

```bash
curl -X POST "https://zbmr4xq6rm.coze.site/stream_run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的API_Token>" \
  -d '{"query":"<把测试消息整段粘贴到这里>","message":"<同上>","stream":true}'
```

**格式 B：content.query.prompt（部署页若写的是这种）**

若部署页的 Body 示例是 `content.query.prompt[0].content.text`，则把测试消息放进 `text` 里，例如：

```bash
curl -X POST "https://zbmr4xq6rm.coze.site/stream_run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的API_Token>" \
  -d '{"content":{"query":{"prompt":[{"type":"text","content":{"text":"<把测试消息整段粘贴到这里>"}}]}},"type":"query","stream":true}'
```

`session_id`、`project_id` 等若为必填，按部署页示例补全。

### 1.3 看 API 返回

- 若返回的是 **待办 JSON**（`{"tasks":[...]}`）→ 说明用该 Body 格式时 API 与控制台一致，问题可能在本系统发出的 **Body 格式** 与部署页要求不一致。
- 若返回的是 **泰国电商 / mermaid** 等 → 说明即使用 API，该 Bot 在这种请求下也没有走待办逻辑，需在 Coze 侧检查 Bot 的触发条件或工作流。

---

## 2. 对比本系统后端实际发送的 Body

本系统当前在 `backend/src/services/scriptLLM.ts` 里发送的是：

```json
{
  "query": "<整段 systemPrompt + 【用户请求】 + userMessage>",
  "message": "<同上>",
  "stream": true
}
```

请对比 Coze 部署页上的 **Body 参数说明**：

- 若部署页要求的是 **`content.query.prompt[0].content.text`** 或 **`text`** 等，而**没有**写 `query`/`message`，则很可能 Coze 服务端只认 `content.query.prompt...` 或 `text`，我们的 `query`/`message` 被忽略或误解析，导致 Bot 走了默认回复（如泰国电商）。
- 这时就需要**改后端**：按部署页的格式拼 Body（例如把整段消息放进 `content.query.prompt[0].content.text` 或 `text`），再重试「智能生成」。

---

## 3. 小结：如何确认「控制台 vs API 不一致」

| 步骤 | 做法 |
|------|------|
| 1 | 在 Coze 部署页复制 curl 示例，把**测试消息**填进 Body 里用户输入字段（如 `text` 或 `content.query.prompt[0].content.text`）。 |
| 2 | 执行 curl，看返回是「待办 JSON」还是「泰国电商/mermaid」。 |
| 3 | 对比部署页 Body 说明 与 本系统 `scriptLLM.ts` 的 `body: JSON.stringify({ query, message, stream: true })` 是否一致。 |
| 4 | 若格式不一致 → 改后端请求体格式与部署页一致；若格式一致但 API 仍返回错内容 → 在 Coze 侧查 Bot 逻辑/工作流。 |

按上述步骤即可确认是否为「同一 Bot 在控制台和 API 下行为不一致」，并判断是改后端格式还是在 Coze 侧排查。
