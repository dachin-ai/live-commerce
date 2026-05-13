# 直播电商中台管理系统

## 🚀 快速开始

### 启动项目 ⭐

**最简单方式：双击 `快速启动.bat`**
- 会自动打开两个窗口分别启动前端和后端
- 无需选择菜单，直接启动
- **推荐日常使用**

**其他方式：**
- PowerShell菜单：右键 `启动.ps1` → "使用PowerShell运行"（功能完整）
- 命令行：`npm run dev`（最可靠）

### 菜单选项

- **[1] Start All** - 启动前端和后端服务
- **[2] Start Backend Only** - 仅启动后端服务
- **[3] Check Status** - 检查项目状态
- **[4] Fix Dependencies** - 修复npm配置并安装依赖
- **[5] Database** - 数据库管理
  - Reset Database - 重置数据库（删除所有数据）
  - Update Seed Data - 更新种子数据（保留现有数据）
  - Backup Database - 备份数据库
- **[6] Open Test Page** - 打开测试入口页面
- **[7] Open API Terminal** - 打开API测试终端
- **[0] Exit** - 退出

## 📋 常用操作

### 首次启动
1. **双击 `快速启动.bat`**（最简单）
2. 如果依赖未安装，运行 `修复npm配置并安装依赖.bat`
3. 然后再次双击 `快速启动.bat`

### 日常启动
**双击 `快速启动.bat`** 即可

### 更新数据库分类
1. 修改 `backend/src/db.ts` 中的种子数据
2. 打开 PowerShell，执行：`cd backend && npm run db:update-seed`
3. 完成（保留业务数据）

## 🔧 数据库

系统使用 **PostgreSQL 18**（自 2026-04-30 起从 SQLite 迁移）。连接参数通过 `backend/.env` 配置（`PG_HOST`、`PG_PORT`、`PG_DATABASE`、`PG_USER`、`PG_PASSWORD`）。

### 更新种子数据（不丢失业务数据）⭐ 推荐

1. 修改 `backend/src/db.ts` 中的种子数据
2. 执行：`cd backend && npm run db:update-seed`
3. 完成（保留所有业务数据）

### 重置数据库

使用 psql 命令重建，详见 [启动与数据库操作指南](docs/启动与数据库操作指南.md)。

## 📝 注意事项

- 服务启动后，窗口必须保持打开
- 前端地址：http://localhost:5173
- 后端地址：http://localhost:3000
- 如果端口被占用，脚本会自动清理

## 📚 更多文档

详细文档请查看 `docs/` 目录
