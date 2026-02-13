# 模块 5：待办事项生成 — MCP 调用步骤（按 module-test-workflow）

以下步骤需在 **Cursor 中启用 MCP**（cursor-ide-browser 或 cursor-browser-extension）后，使用 **call_mcp_tool** 依次执行。若当前 Agent 无 MCP 权限，请在新对话中 @ 本文件并说明「按此文档调用 MCP 测试模块 5」。

---

## 前置条件

- 后端已启动：`cd backend && npm run dev`（端口 3000）
- 前端已启动：`cd frontend && npm run dev`（端口 5173）
- 可选快速规则路径（免 LLM 等待）：后端启动前设置 `SKIP_TODO_LLM=1`

---

## MCP 调用顺序（cursor-ide-browser）

### 1. 列出当前标签页

- **server**: `cursor-ide-browser`
- **toolName**: `browser_tabs`
- **arguments**: `{ "action": "list" }`
- 若有已打开的前端页（如 http://localhost:5173），下一步可先 `browser_lock` 再操作；否则先 `browser_navigate`。

### 2. 打开前端页

- **toolName**: `browser_navigate`
- **arguments**: `{ "url": "http://localhost:5173" }`
- 然后等待约 **2 秒** 再执行下一步（等待策略见 skill）。

### 3. 锁定标签页（若步骤 1 无对应 tab，可先 navigate 再 lock）

- **toolName**: `browser_lock`
- **arguments**: 按 schema 传入（通常需指定 tab 或留空使用当前 tab）。

### 4. 获取页面结构

- **toolName**: `browser_snapshot`
- **arguments**: `{}` 或按 schema。
- 用于确认是否在登录页；若在登录页，继续步骤 5。

### 5. 登录（若当前在登录页）

- 用 **browser_snapshot** 得到的 `ref` 或选择器，在邮箱输入框 **browser_fill**：`admin@example.com`
- 在密码输入框 **browser_fill**：`123456`
- **browser_click** 登录按钮。
- 等待约 **2 秒** → 再 **browser_snapshot**，确认进入 Dashboard / 店铺管理。

### 6. 进入待处理任务区域

- **browser_snapshot** 获取当前页结构。
- 找到「待处理任务」卡片或「智能生成」按钮的 ref，**browser_click** 展开（若可折叠）。
- 若有店铺下拉框且未选店，先选择店铺（如 greenpet）。

### 7. 点击「智能生成」

- **browser_click**「智能生成」按钮（用 snapshot 返回的对应 ref）。
- 等待：规则路径约 **2–5 秒**；LLM 路径约 **15–30 秒**。建议先等 **2 秒** → **browser_snapshot** → 若按钮仍为「生成中…」则再等 **3 秒** → 再 snapshot，直到出现 Toast 或任务列表更新。

### 8. 验证结果

- **browser_snapshot**：确认任务列表有卡片、有「全部/紧急/普通」Tab、有任务标题与描述。
- **toolName**: `browser_console_messages`（若该 MCP 提供）：检查无报错。
- **toolName**: `browser_network_requests`（若该 MCP 提供）：确认 `/api/ai/generate-tasks` 返回 200。

### 9. 解锁

- **toolName**: `browser_unlock`
- **arguments**: `{}`

---

## 严苛检查项（步骤 2 必须覆盖）

按 skill 要求，步骤 2 中至少完成：

- 至少 **3 次** browser 相关调用（如 navigate + snapshot + click）。
- 调用 **browser_console_messages** 检查控制台。
- 调用 **browser_network_requests** 检查接口。

---

## 工具 schema 位置

调用前请先查看对应 MCP 的 tool schema（若存在）：

- `mcps/cursor-ide-browser/tools/*.json`
- `mcps/cursor-browser-extension/tools/*.json`

（路径可能在 Cursor 项目目录 `C:\Users\<用户>\.cursor\projects\d-Work-space-lvbcsym\mcps\` 下。）

---

## 与测试报告对应关系

- 本文件的「步骤 7–8」对应 `docs/归档/历史模块报告/模块5-待办事项生成-测试报告.md` 中「测试步骤与结果」表：步骤 1（点击智能生成）、步骤 2–4（验证标题、描述、优先级）。
- 执行完 MCP 调用后，将结果填入该报告的「MCP 调用记录」并更新「最终结论」。
