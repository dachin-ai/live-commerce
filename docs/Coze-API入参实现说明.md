# Coze API 入参实现说明（Coze 侧反馈）

**来源**：Coze 侧提供的 API 入参实现说明  
**更新日期**：2026-02-13

---

## 一、当前实现方式

**实现方式**：Bot 可用「用户消息」调用工具（**可选**；与《Coze对接说明》一致，**推荐**在 answer/delta 直接流式输出 JSON，不依赖工具）。

### 调用流程

```
用户发送查询 → POST /stream_run → Agent 收到消息 → Agent 解析并决定调用工具
→ Agent 提取参数 → 调用 generate_todo_tasks(store_data="...") → 工具解析 JSON
```

---

## 二、工具参数要求（store_data）

### generate_todo_tasks 工具

**参数**：`store_data: str`

**要求**：

1. 必须是 **JSON 字符串**格式
2. 若用户消息包含 **【store_data】** 标签，**直接提取标签后的整段 JSON**
3. 若用户消息中包含 JSON（以 `{` 开头、`}` 结尾），直接提取
4. **禁止**从自然语言中拼凑 JSON

### 推荐字段（与 Coze 示例一致）

本系统在【store_data】后发送的 JSON 包含以下字段（与 Coze 示例对齐，并增加扩展字段）：

| 字段 | 类型 | 说明 |
|------|------|------|
| conversion_rate | number | 转化率（%） |
| daily_views | number | 日均观看（总观看/30） |
| avg_order_value | number | 客单价（GMV/订单） |
| daily_orders | number | 日均订单 |
| live_duration_hours | number | 直播总时长（小时） |
| weekly_sessions | number | 周场次（暂无则 0） |
| platform | string | 平台，如 TikTok |
| country | string | 国家/区域，如 泰国 |
| store_name | string | 店铺名称（扩展） |
| categories | string | 类目（扩展） |
| currency | string | 货币名（扩展） |
| existing_tasks | string[] | 已有待办标题（扩展） |

---

## 三、本系统实现

- **位置**：`backend/src/routes/ai-refactored.ts` → `generateIntelligentTodosWithLLM`
- **格式**：userMessage 首行为 `【store_data】` + 上述 JSON 字符串（无换行、无多余字符），供 Coze Bot 直接提取后传入 `generate_todo_tasks(store_data=...)`。
- **解析**：本系统从 SSE `tool_response.result` 聚合 JSON 后解析 `tasks` 数组，见 `scriptLLM.ts` → `extractScriptFromToolResponse`。

---

## 四、与《Coze对接说明》表格的对应

- 待办出参与流式要求以 **`docs/Coze对接说明-待办与话术入参出参.md`** 为准。
- **推荐** Coze 在 **answer/delta** 中直接流式输出 JSON（`{"tasks":[...]}`），不依赖工具；若 Bot 使用工具，需保证 **tool_response 在同一条 SSE 流**中返回，否则本系统会收不到正文。

## 五、相关文档

- 本系统入参文档：`docs/LLM待办生成-给Coze的输入参数.md`
- 待办返回空排查：`docs/待办生成返回空-排查说明.md`
- 对接总约定（入参/出参/流式/是否依赖 tool）：`docs/Coze对接说明-待办与话术入参出参.md`
