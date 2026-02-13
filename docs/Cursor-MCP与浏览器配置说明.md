# Cursor MCP 与浏览器配置说明

根据你当前的「Tools & MCP」界面（显示 No MCP Tools），可以按下面两种方式配置，以便 Agent 能调用浏览器做待办生成测试。

---

## 方式一：使用 Cursor 内置浏览器（推荐先试）

Cursor 自带 **Browser** 能力，**不需要**在「Installed MCP Servers」里添加自定义 MCP 也能用。

### 1. 确认浏览器相关开关

1. 打开 **Cursor 设置**（`Ctrl + ,` 或 `Cmd + ,`）
2. 进入 **Tools & MCP**（或 **Features** → **MCP**）
3. 在 **Browser Automation** 区域确认：
   - **Connected to Browser Tab** 已连接（下拉里选「Browser Tab」或「Chrome」）
   - 如需自动打开 localhost，可打开 **Show Localhost Links in Browser**

### 2. 确认 Agent 能用浏览器

- 在 **Composer / Agent 对话**里，看左侧或设置里是否有 **「Browser」** 或 **「Tools」** 列表。
- 若有 **Browser** 或 **browser_navigate**、**browser_snapshot** 等，说明已启用，可直接在对话里说：「用浏览器打开 http://localhost:5173 并测试待办生成」。

### 3. 若仍显示 No MCP Tools

- 「No MCP Tools」指的是**自定义 MCP 服务器**为空，不影响 Cursor 自带的 Browser。
- 若 Agent 仍然没有浏览器相关工具，尝试：
  - 完全关闭 Cursor 后重新打开
  - 或更新 Cursor 到最新版（Browser 为较新功能）

---

## 方式二：用项目级 mcp.json 添加自定义 MCP（可选）

若要使用**自定义 MCP 服务器**（例如社区浏览器 MCP），可在项目里加一层配置。

### 1. 在项目根目录创建或编辑 `.cursor/mcp.json`

路径：`<你的项目根>/.cursor/mcp.json`  
（本项目根即 `lvbcsym` 所在目录。）

### 2. 示例：添加一个通过命令行启动的 MCP 服务

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "某个mcp包名"],
      "env": {}
    }
  }
}
```

- **command**：本机可执行的命令（如 `npx`、`node`、`python`）。
- **args**：传给该命令的参数（如 `["-y", "mcp-server-package"]`）。
- 保存后，重启 Cursor 或重新打开项目，在 **Tools & MCP** 里应能看到该 MCP。

### 3. 若使用「远程」MCP（HTTP/SSE）

```json
{
  "mcpServers": {
    "remote-browser": {
      "url": "http://localhost:端口/mcp"
    }
  }
}
```

- 需要先在本机或服务器上启动对应 MCP 服务，再把上面的 `url` 改成实际地址。

### 4. 配置位置说明（Cursor 文档）

- **项目级**：`.cursor/mcp.json` → 仅当前项目生效。
- **全局**：  
  - Windows: `%USERPROFILE%\.cursor\config\mcp.json` 或 `~/.cursor/mcp.json`  
  → 对所有项目生效。

---

## 针对「待办生成」模块 5 测试

1. **优先**用方式一：确认 **Browser Automation** 已连接，在 Composer 里直接说「用浏览器打开 http://localhost:5173，登录后点击智能生成，按 docs/模块5-待办生成-MCP调用步骤.md 测试」。
2. 若你**必须**用自定义 MCP**且**有现成的浏览器 MCP 包/地址，再按方式二在 `.cursor/mcp.json` 里添加该 MCP。
3. 前后端需已启动：后端 `cd backend && npm run dev`，前端 `cd frontend && npm run dev`。

---

## 小结

| 目标           | 建议操作 |
|----------------|----------|
| 让 Agent 用浏览器测待办 | 先确认 **Tools & MCP → Browser Automation** 已连接，在 Agent 对话里直接要求用浏览器测本地页面。 |
| 添加自己的 MCP 服务器   | 在项目根创建/编辑 `.cursor/mcp.json`，按上面格式填写 `mcpServers`，保存后重启 Cursor。 |
| 界面上一直显示 No MCP Tools | 只表示「当前没有自定义 MCP」，不影响内置 Browser；若要用自定义 MCP，按方式二添加。 |

---

## 常见问题：Chrome 选项消失 / MCP 浏览器打不开

### 可能原因与对应处理

1. **Cursor 里改成了「Browser Tab」**
   - **位置**：Cursor 设置 → **Tools & MCP** → **Browser Automation** → 「Connected to Browser Tab」旁的下拉。
   - **处理**：下拉里选 **「Chrome」**（而不是 Browser Tab），保存后再试。若选的是 Browser Tab，会用 Cursor 内置标签页，不会启动外部 Chrome。

2. **Chrome 未安装或路径不对**
   - Cursor 启动 Chrome 时依赖系统里可用的 Chrome/Chromium。
   - **处理**：确认本机已安装 Chrome，且能从命令行启动（如 `chrome` 或 `"C:\Program Files\Google\Chrome\Application\chrome.exe"`）。若装在非默认路径，有的版本 Cursor 可能找不到，可尝试重装到默认路径或查看 Cursor 是否有「浏览器可执行文件路径」设置。

3. **权限/安全软件拦截**
   - 杀毒、防火墙或系统权限可能阻止 Cursor 拉起 Chrome。
   - **处理**：临时关闭或对 Cursor 放行后再试；Windows 上可对 Cursor 以管理员身份运行一次（仅作排查用）。

4. **Cursor 或浏览器扩展更新导致异常**
   - **处理**：完全退出 Cursor（含托盘），再重新打开；或更新 Cursor 到最新版后重试。若之前能打开、最近才不能，可看 Cursor 更新日志里是否提到 Browser/Chrome。

5. **先用 Browser Tab 顶替**
   - 若暂时不需要「独立 Chrome 窗口」，可把 **Browser Automation** 选成 **Browser Tab**，在 Cursor 内嵌页里做待办测试，功能一致，只是不单独开 Chrome。

### 下拉里没有「Chrome」选项、只有 Browser Tab（或「原来有 Chrome，现在消失」）

**现象**：Tools & MCP → Browser Automation 下拉里只有 **Off** 和 **Browser Tab**，没有 **Chrome**。有的用户反馈**之前有 Chrome 选项，某次 Cursor 更新或重装后消失**。

**可能原因**（Cursor 产品侧，项目内无法修复）：
- Cursor 某次版本更新中**移除了或隐藏了「Chrome」选项**，统一改为仅提供 Browser Tab。
- 不同发行渠道/地区/账号类型下，Browser 能力展示不一致。
- 若你本机 Chrome 路径非默认或检测失败，个别版本会不显示 Chrome 而只保留 Browser Tab。

**当前可行做法**：
1. **直接用 Browser Tab**（推荐）：选 **Browser Tab**，Agent 在 Cursor 内置浏览器标签里打开页面，待办生成、前端自动化测试（browser_navigate / snapshot / click 等）**功能与原先用 Chrome 一致**，只是不单独弹出 Chrome 窗口。
2. **确认 Chrome 仍在默认路径**（若以后 Cursor 恢复 Chrome 选项时可用）：  
   - Windows：`C:\Program Files\Google\Chrome\Application\chrome.exe`  
   - 若 Cursor 后续版本在设置里提供「浏览器可执行文件路径」或「Custom browser path」，可填该路径。
3. **向 Cursor 反馈**：在 Cursor 里 **Help → Report Issue** 或到官方论坛/ Discord 说明「Browser Automation 下拉原先有 Chrome，更新后只剩 Off / Browser Tab，希望恢复 Chrome 选项」，便于官方在后续版本恢复或提供配置项。
4. **关注更新日志**：每次 Cursor 更新后可再看一次该下拉是否重新出现 Chrome；若官方说明改为「仅 Browser Tab」，则长期以 Browser Tab 为准即可。

**结论**：只要 **Browser Tab** 可选且已连接，Agent 的 MCP 浏览器测试（含待办生成、前端自动化）即可正常使用，不依赖 Chrome 选项。

### 建议排查顺序

1. 打开 **Cursor 设置 → Tools & MCP → Browser Automation**，看下拉是否有 **Chrome**：有则选 Chrome；**若只有 Off / Browser Tab（Chrome 消失）**，选 **Browser Tab** 即可完成待办与前端测试，无需纠结 Chrome。
2. 完全退出 Cursor 后重新打开，再让 Agent 用浏览器打开一个页面试一次。
3. 若选了 Chrome 仍打不开，切到 **Browser Tab** 看是否能正常打开页面；若 Browser Tab 可以而 Chrome 不行，多半是 Chrome 启动或权限问题。
4. 看 Cursor 输出/开发者工具里是否有与 browser/Chrome 相关的报错（Help → Toggle Developer Tools），把报错信息记下来便于进一步查或反馈给 Cursor。
