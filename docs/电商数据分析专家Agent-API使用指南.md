# Cursor系统接入API使用指南

**来源**：电商数据分析专家 Agent 侧提供的接入说明（供本系统对接参考）  
**更新日期**：2026-02-13  
**同步**：已纳入 Coze 最新建议（V3.2 待办从 answer 直接输出、仅【store_data】方式，解析与话术统一）

---

## 📝 概述

本文档说明 Cursor 系统如何接入电商数据分析专家 Agent 的 API 接口，包括从旧的「店铺参数+工具名」方式迁移到新的统一 Agent 接口的方式。

---

## 🔴 旧使用方式（已废弃）

### 接口设计

之前的接口设计是通过**店铺参数+工具名**直接调用特定功能：

```json
POST /run
{
  "shop_id": "shop_123",
  "tool_name": "generate_live_script",
  "parameters": {
    "product_name": "猫笼",
    "product_category": "宠物用品",
    "product_features": "不锈钢",
    "target_audience": "多猫家庭",
    "price_range": "1299",
    "pain_points": "猫主子打架"
  }
}
```

### 特点

- ✅ 明确指定要调用的工具
- ✅ 参数固定，易于校验
- ❌ 缺乏灵活性
- ❌ 需要了解所有工具和参数
- ❌ 无法自然对话

---

## 🟢 新使用方式（推荐）

### 接口设计

现在的接口设计是**统一的 Agent 接口**，通过自然语言描述来调用功能：

```json
POST /stream_run
{
  "content": "请生成一款猫笼的完整直播话术（full_process）。产品名称：猫笼，国家：泰国，价格：1299，产品特点：不锈钢，目标人群：多猫家庭，促销活动：满1000减20，SKU信息：S码适合1-2只猫，M码适合2-3只猫，L码适合3-5只猫",
  "session_id": "cursor_session_123"
}
```

### 特点

- ✅ 自然语言描述需求
- ✅ Agent 自动选择合适的工具
- ✅ 支持多轮对话
- ✅ 灵活性强
- ✅ 用户体验好

---

## 🔄 接口说明

### 1. 流式运行接口（推荐）

**接口地址**：`POST /stream_run`

**请求参数**：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| content | string | 是 | 用户消息内容（自然语言描述） |
| session_id | string | 是 | 会话ID（用于多轮对话） |

**请求示例**：

```json
{
  "content": "请生成一款猫笼的完整直播话术（full_process）。产品名称：猫笼，国家：泰国，价格：1299，产品特点：不锈钢，目标人群：多猫家庭，促销活动：满1000减20，SKU信息：S码适合1-2只猫，M码适合2-3只猫，L码适合3-5只猫",
  "session_id": "cursor_session_123"
}
```

**响应格式**：

Server-Sent Events (SSE) 流式响应：

```json
event: message
data: {"type": "message_start", "session_id": "...", "reply_id": "...", ...}

event: message
data: {"type": "answer", "session_id": "...", "answer": "###", ...}

event: message
data: {"type": "answer", "session_id": "...", "answer": " ", ...}

event: message
data: {"type": "answer", "session_id": "...", "answer": "【", ...}

...

event: message
data: {"type": "message_end", "session_id": "...", "time_cost_ms": 23456, ...}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 消息类型：message_start、answer、tool_request、tool_response、message_end |
| content | object | 消息内容 |
| content.answer | string | Agent 回答内容（流式输出） |
| content.tool_request | object | 工具调用请求 |
| content.tool_response | object | 工具调用响应 |
| content.time_cost_ms | number | 总耗时（毫秒） |

### 2. 同步运行接口

**接口地址**：`POST /run`

**请求参数**：与流式接口相同

**响应格式**：一次性返回完整结果

```json
{
  "status": "success",
  "answer": "### 【圈人群】(60秒)...",
  "run_id": "run_id_123"
}
```

---

## 📖 使用场景与示例

### 场景1：话术生成

**请求**：

```json
POST /stream_run
{
  "content": "请生成一款猫笼的完整直播话术（full_process）。产品名称：猫笼，国家：泰国，价格：1299，产品特点：不锈钢，目标人群：多猫家庭，促销活动：满1000减20，SKU信息：S码适合1-2只猫，M码适合2-3只猫，L码适合3-5只猫",
  "session_id": "cursor_script_001"
}
```

**响应**：SSE 流式，`type: "answer"` 时 `answer` 为逐字/逐块内容。

**首字响应**：约 2 秒  
**总耗时**：约 25 秒

### 场景2：待办事项生成

**V3.2**：待办生成**优先直接生成，不再调用工具**；与话术使用**同一套解析逻辑**（聚合 `answer` 后解析）。**旧方案**（仅自然语言描述、或仅裸 JSON 无标签）已废弃，本系统仅采用下方一种方式。

**推荐方式（本系统唯一采用）**：使用 **【store_data】标签**，标签后紧跟 JSON（无换行、无空格）；可同时带【store_attributes】、【raw_daily_table】等块，见《Coze对接说明-待办与话术入参出参》。

**请求示例**：

```json
POST /stream_run
{
  "content": "请为店铺生成待办事项：【store_data】{\"conversion_rate\":2.5,\"daily_views\":800,\"avg_order_value\":40,\"daily_orders\":50,\"live_duration_hours\":5,\"weekly_sessions\":3,\"platform\":\"TikTok\",\"country\":\"泰国\"}",
  "session_id": "cursor_todo_001"
}
```

**响应**：从 `type: "answer"` 的 `content.answer` 流式输出；拼接后为 JSON 字符串 `{"tasks":[...]}`。

**解析方式（与话术统一）**：

```typescript
let todoJson = "";
for (const event of sseEvents) {
  if (event.type === "answer" && event.content?.answer) {
    todoJson += event.content.answer;
  }
}
const todoData = JSON.parse(todoJson);
console.log(todoData.tasks);
```

**本系统实际**：传入**完整 message**（含 systemPrompt + 【store_data】+ 【store_attributes】+ 【raw_daily_table】+ 店铺基本信息、核心指标、历史对比、业务上下文），Agent 在 **answer** 中直接输出 JSON，不依赖工具。

### 场景3：节日营销

**请求**：

```json
POST /stream_run
{
  "content": "最近泰国有什么节日适合做促销活动？",
  "session_id": "cursor_festival_001"
}
```

### 场景4：数据分析

**请求**：

```json
POST /stream_run
{
  "content": "帮我分析一下供应链数据，当前库存情况如何？",
  "session_id": "cursor_analysis_001"
}
```

### 场景5：多轮对话

使用相同 `session_id` 可进行多轮对话。

---

## 🛠️ 集成示例代码

### JavaScript/TypeScript

```typescript
// 流式调用
async function callAgentStream(content: string, sessionId: string) {
  const response = await fetch('http://localhost:8000/stream_run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, session_id: sessionId }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullAnswer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'answer') {
          const answer = data.content?.answer ?? data.answer;
          fullAnswer += answer;
          console.log('流式输出:', answer);
        } else if (data.type === 'message_end') {
          console.log('总耗时:', data.content?.time_cost_ms + 'ms');
        }
      }
    }
  }
  return fullAnswer;
}
```

### Python

见原文档：使用 `sseclient` 解析 SSE，从 `type === 'answer'` 的 `content.answer` 或 `answer` 拼接全文。

---

## 📊 支持的功能列表

| 功能 | 使用方式 | 关键词 |
|------|----------|--------|
| 话术生成 | 「生成话术」「直播话术」 | full_process、interaction、scenario、promotion、closing |
| 待办事项 | 「生成待办」「今日待办」 | 新开店铺、日常运营、节日活动 |
| 节日营销 | 「节日营销」「促销活动」 | 节日、促销、活动 |
| 数据分析 | 「分析数据」「供应链分析」 | 供应链、物流、定价、盈利 |
| 文档生成 | 「生成报告」「生成Excel」 | 报告、Excel、PPT |
| 信息搜索 | 「搜索规则」「搜索趋势」 | 规则、趋势、竞品 |

---

## ⚠️ 注意事项

1. **首字响应时间**：话术生成约 2 秒，待办（V3.2 从 answer 输出）更快。
2. **流式输出**：推荐使用 `/stream_run`，体验更好。
3. **Session 管理**：相同 `session_id` 支持多轮对话。
4. **错误处理**：监听 `message_end`，检查 `code` 字段。
5. **超时**：接口超时 900 秒（15 分钟）。

---

## 🆘 常见问题（Coze 侧）

- **如何知道 Agent 调用了哪个工具？** 监听 `tool_request` 事件，查看 `content.tool_request.tool_name`。
- **如何取消正在执行的请求？** 调用取消接口 `POST /cancel/{run_id}`。
- **多国家**：在 content 中指定国家即可，如「请为印尼市场生成话术」。

---

## 📞 技术支持

- API 日志：`/app/work/logs/bypass/app.log`
- 健康检查：`GET /health`

---

## 🔗 本系统（Cursor 店铺管理）对接说明

当本系统（待办生成、话术生成）要调用**电商数据分析专家 Agent** 时，请按以下方式配置，与本文档接口一致。

### 1. 请求体格式

- **Coze 最新建议**：请求体为 **`{ "content": "用户消息", "session_id": "..." }`**（Agent 体）。若电商数据分析专家 Agent（或自建部署）**要求该格式**，可在本系统后端设置 **`AGENT_API_BODY=1`**，本系统将改为发送该格式。
- **本系统默认**：对 **\*.coze.site** 当前使用 **legacy 体**（`content.query.prompt[0].content.text` = 整条 message），以兼容部分发布站点；与《Coze 对接协议》一致。若对接的 Agent 明确要求 `content`+`session_id`，再设 `AGENT_API_BODY=1`。

### 2. URL 配置

- 在「LLM 配置」中填写的 API 地址应为 Agent 的 **stream_run** 地址，例如：
  - 自建：`http://localhost:8000` 或 `http://your-host:8000`（本系统会自动补全 `/stream_run`）
  - 若 Agent 部署在 Coze 发布站点，填写完整地址如 `https://xxx.coze.site/stream_run`
- 本系统会在 URL 未含 `stream_run` 时自动追加 `/stream_run`。

### 3. 响应解析

- 本系统已按本文档解析 SSE：`type: "answer"` 时优先读取**顶层 `answer`**，其次 `content.answer`；并支持 `message_start`、`message_end`、`tool_request`、`tool_response` 等。
- **V3.2 统一逻辑**：话术与待办均从 **answer/delta** 聚合流式 chunk；待办再将拼接结果 `JSON.parse` 得到 `tasks`。tool 路径已废弃，本系统不再解析 tool_response。
- 与《Coze对接说明-待办与话术入参出参》一致：待办/话术**须**在 **answer/delta** 中直接输出。

### 4. 相关文档

- 待办/话术入参与出参约定：`docs/Coze对接说明-待办与话术入参出参.md`
- 环境变量：`AGENT_API_BODY=1` 仅当自建 Agent 只支持 `{ content, session_id }` 时启用；`COZE_LEGACY_BODY=1` 强制使用 Coze 旧版 body（与《Coze 对接协议》一致）。

---

**版本**：V3.2（待办从 answer 直接输出，仅【store_data】方式；解析与话术统一）
