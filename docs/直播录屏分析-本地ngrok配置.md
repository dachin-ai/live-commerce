# 直播录屏分析 - 本地 ngrok 配置（方式一）

视频分析依赖 Vision 模型远程拉取视频 URL。本地开发时视频地址为 `http://localhost:3000/...`，模型无法访问。需用 ngrok 暴露本地服务为公网地址。

## 步骤

### 0. 注册 ngrok 账号（免费）

访问 https://ngrok.com/signup 注册，登录后在 https://dashboard.ngrok.com/get-started/your-authtoken 获取 authtoken。

### 1. 安装 ngrok

**Windows：**
- 打开 https://ngrok.com/download 下载 Windows 版本
- 解压到任意目录（如 `C:\ngrok`），将该目录加入系统 PATH
- 或在解压目录打开 PowerShell，用 `.\ngrok.exe http 3000` 运行

**包管理器（若网络正常）：**
- `winget install ngrok.ngrok`（Windows）
- `choco install ngrok`（Windows，需 Chocolatey）
- `brew install ngrok`（macOS）

### 2. 启动后端

在项目 backend 目录启动后端（确保端口 3000 或你配置的 PORT 正常监听）：

```powershell
cd backend
npm run dev
```

### 3. 配置并启动 ngrok

首次使用需添加 authtoken（从 ngrok 控制台获取）：

```bash
ngrok config add-authtoken <你的authtoken>
```

**新开一个终端**，运行：

```bash
ngrok http 3000
```

会看到类似输出：

```
Forwarding    https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:3000
```

复制 `https://xxxx...ngrok-free.app` 这个地址（不要末尾斜杠）。

### 4. 配置 backend/.env

在 `backend/.env` 中添加或修改：

```
API_BASE_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app
```

保存后**重启 backend**（Ctrl+C 停止后再 `npm run dev`）。

### 5. 前端访问方式

- **方式 A**：前端仍用 `http://localhost:5173` 访问，API 代理到 `localhost:3000`。上传的视频 URL 会使用 `API_BASE_URL`（ngrok 地址），Vision 模型可访问。
- **方式 B**：若前端也通过 ngrok 访问，需单独为前端起一个 ngrok（如 `ngrok http 5173`），或使用同一 ngrok 配置多端口（付费功能）。

通常使用方式 A 即可：前端本地、后端本地、视频 URL 用 ngrok 地址。

### 6. 验证

1. 重启后端
2. 打开执行工具 → 直播录屏分析
3. 选择店铺，上传视频
4. 等待分析完成，应显示「已完成」及分析结果

---

**注意**：每次重启 ngrok，免费版会生成新的 URL，需更新 `API_BASE_URL` 并重启后端。
