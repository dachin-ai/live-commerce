# Cursor MCP 配置说明

## 概述

本目录包含 Cursor MCP (Model Context Protocol) 相关配置，用于在 Cursor 中启用和配置浏览器自动化工具，以便 Agent 能够执行前端测试和待办生成等任务。

## 配置文件

### .cursor/mcp.json

这是主要的 MCP 配置文件，用于定义和配置 MCP 服务器。

#### 基本配置

```json
{
  "mcpServers": {
    "vefaas-browser": {
      "command": "npx",
      "args": [
        "@faas-mcp/browser@latest"
        // 可根据需要添加参数
      ]
    }
  }
}
```

#### 可用参数

以下是可添加到 `args` 数组中的参数：

| 参数 | 描述 | 示例 |
|------|------|------|
| `--allowed-origins <origins>` | 允许浏览器请求的源列表，用分号（;）分隔。默认允许所有源。 | `"--allowed-origins", "http://localhost:5173;http://localhost:3000"` |
| `--blocked-origins <origins>` | 阻止浏览器请求的源列表，用分号（;）分隔。阻止列表优先级高于允许列表。 | `"--blocked-origins", "example.com;test.com"` |
| `--block-service-workers` | 阻止 Service Worker。 | `"--block-service-workers"` |
| `--browser <browser>` | 要使用的浏览器或 Chrome 频道。 | `"--browser", "chrome"` |
| `--caps <caps>` | 要启用的额外功能列表。支持 vision 和 pdf 两种类型。 | `"--caps", "vision,pdf"` |
| `--cdp-endpoint <endpoint>` | 要连接的客户数据平台（CDP）端点。 | `"--cdp-endpoint", "ws://example.com/ws"` |
| `--config <path>` | 浏览器配置文件的路径。 | `"--config", "path/to/config"` |
| `--device <device>` | 要模拟的设备。 | `"--device", "iPhone 15"` |
| `--executable-path <path>` | 浏览器可执行文件的路径。 | `"--executable-path", "path/to/browser.exe"` |
| `--headless` | 以无头模式运行浏览器。 | `"--headless"` |
| `--host <host>` | 服务器绑定的主机，默认为 localhost。 | `"--host", "localhost"` |
| `--ignore-https-errors` | 忽略 HTTPS 错误。 | `"--ignore-https-errors"` |
| `--isolated` | 将浏览器配置文件保存在内存中，不保存到磁盘。 | `"--isolated"` |
| `--image-responses <mode>` | 是否向客户端发送图像响应。取值：allow（默认）、omit。 | `"--image-responses", "allow"` |
| `--no-sandbox` | 禁用沙箱。 | `"--no-sandbox"` |
| `--output-dir <path>` | 输出文件的目录路径。 | `"--output-dir", "path/to/output"` |
| `--port <port>` | Server-Sent Events（SSE）传输协议监听的端口。 | `"--port", "8080"` |
| `--proxy-bypass <bypass>` | 要绕过代理的域名列表，用逗号（,）分隔。 | `"--proxy-bypass", ".com,chromium.org"` |
| `--proxy-server <proxy>` | 指定代理服务器。 | `"--proxy-server", "http://myproxy:3128"` |
| `--save-trace` | 将会话的 Playwright 跟踪保存到输出文件的目录。 | `"--save-trace"` |
| `--storage-state <path>` | 隔离会话的存储状态文件路径。 | `"--storage-state", "path/to/state.json"` |
| `--user-agent <ua string>` | 指定用户代理字符串。 | `"--user-agent", "Mozilla/5.0..."` |
| `--user-data-dir <path>` | 用户数据目录路径。如果未指定，将创建临时目录。 | `"--user-data-dir", "path/to/user-data"` |
| `--viewport-size <size>` | 指定浏览器视口大小（像素）。 | `"--viewport-size", "1280,720"` |

## 使用方法

1. **启用浏览器自动化**：
   - 打开 Cursor 设置（`Ctrl + ,` 或 `Cmd + ,`）
   - 进入 **Tools & MCP**（或 **Features** → **MCP**）
   - 在 **Browser Automation** 区域确认已连接

2. **测试浏览器功能**：
   - 在 Composer / Agent 对话中，输入类似命令："用浏览器打开 http://localhost:5173 并测试待办生成"
   - 确保前端和后端服务已启动（可通过 `快速启动.bat` 启动）

3. **调整配置**：
   - 根据需要修改 `.cursor/mcp.json` 文件中的参数
   - 保存后重启 Cursor 以使配置生效

## 常见问题

### 浏览器无法启动

- 确保已安装 Chrome 浏览器
- 检查浏览器可执行文件路径是否正确
- 尝试添加 `--no-sandbox` 参数

### MCP 服务器未显示

- 保存配置文件后重启 Cursor
- 确保 `npx` 命令可在系统中正常执行
- 检查网络连接是否正常

### 浏览器测试失败

- 确保前端服务已启动（默认地址：http://localhost:5173）
- 检查防火墙设置是否阻止了浏览器请求
- 尝试添加 `--ignore-https-errors` 参数（如果使用 HTTPS）

## 示例配置

### 完整配置示例

```json
{
  "mcpServers": {
    "vefaas-browser": {
      "command": "npx",
      "args": [
        "@faas-mcp/browser@latest",
        "--allowed-origins", "http://localhost:5173;http://localhost:3000",
        "--browser", "chrome",
        "--caps", "vision,pdf",
        "--headless",
        "--ignore-https-errors",
        "--no-sandbox",
        "--viewport-size", "1280,720"
      ]
    }
  }
}
```

### 远程浏览器配置示例

```json
{
  "mcpServers": {
    "remote-browser": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

## 注意事项

- 修改配置后需要重启 Cursor 以使更改生效
- 某些参数可能需要根据系统环境和浏览器版本进行调整
- 如需更多帮助，请参考 Cursor 官方文档或联系技术支持
