# 如何给 AI 前端测试权限

这样配置后，我（AI Agent）才能用浏览器工具自动打开你的前端页面、点击按钮、填写表单并验证结果。

---

## 一、在 Cursor 里启用 MCP 浏览器

### 1. 打开 MCP 设置

1. 点击左下角 **齿轮图标**（或 `File` → `Preferences` → `Cursor Settings`）
2. 进入 **Features** → **MCP**
3. 确认 **MCP 已开启**（开关为 On）

### 2. 确认浏览器 MCP 已添加

在 MCP 列表里应能看到类似：

- **cursor-ide-browser**：在 Cursor 内嵌浏览器里操作页面
- **cursor-browser-extension**：通过浏览器扩展操作页面

若没有，需要添加：

1. 点击 **"+ Add New MCP Server"** 或 **"Add new"**
2. 选择 **Cursor 自带的浏览器服务器**（名称可能是 `cursor-ide-browser` 或 `Browser`）
3. 保存

### 3. 使用 Composer / Agent 对话

- MCP 浏览器工具**只在 Composer（Agent）里可用**，普通聊天里没有。
- 在 **Composer** 里输入需求，例如：
  - “用浏览器打开 http://localhost:5173 并测试登录”
  - “打开前端，测试创建店铺和品牌策略生成”
- 我会自动调用 `browser_navigate`、`browser_snapshot`、`browser_click` 等工具进行测试。

---

## 二、你需要提前做好的事

### 1. 前端服务已启动

测试前请先跑起前端，例如：

```bash
cd frontend
npm run dev
```

保证浏览器能访问：**http://localhost:5173**（或你实际用的端口）。

### 2. 后端已启动（若要测登录、接口）

若测试登录、创建店铺等，需要后端也跑起来，例如：

```bash
cd backend
npm run dev
```

保证 **http://localhost:3000** 可访问（或你实际配置的端口）。

### 3. 使用 Composer 而不是普通 Chat

- 在 Cursor 里用 **Composer**（Ctrl+I 或 Cmd+I）发起对话。
- 在 Composer 里说：“请用浏览器测试前端：打开 http://localhost:5173，测试登录和店铺管理。”
- 我会在有权限的情况下自动使用浏览器工具。

---

## 三、若没有 MCP 或无法用浏览器

可以改用「你操作 + 我指导」的方式：

1. **你**在浏览器打开：http://localhost:5173  
2. **你**按 `完整功能测试指南.md` 逐步操作（登录、创建店铺、点按钮等）  
3. 把现象发给我，例如：
   - “点击创建店铺没反应”
   - “登录后白屏”
   - “品牌策略生成报错：……”
4. 我根据你的描述排查代码、改逻辑、写修复方案。

---

## 四、检查 MCP 是否生效

在 **Composer** 里可以这样问我：

- “列出当前可用的 MCP 工具”
- “用浏览器打开 http://localhost:5173 并做一个 snapshot”

若我能成功调用浏览器并返回页面结构（snapshot），说明前端测试权限已生效。

---

## 五、小结

| 步骤 | 操作 |
|------|------|
| 1 | Cursor Settings → Features → MCP → 开启 MCP |
| 2 | 确认已添加 **cursor-ide-browser**（或 Cursor 自带浏览器 MCP） |
| 3 | 启动前端：`cd frontend && npm run dev`，必要时也启动后端 |
| 4 | 在 **Composer** 里让我“用浏览器测试前端” |

按以上做完后，我就可以在 Composer 里用前端权限进行测试；若你那边没有 MCP 或工具不可用，就按第三节由你操作、我指导排查。
