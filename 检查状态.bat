@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   项目状态检查
echo ========================================
echo.

echo [1] Node.js 环境
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装
) else (
    echo ✅ Node.js 已安装
    node --version
    npm --version
)
echo.

echo [2] npm 配置
echo 注册表: 
npm config get registry
echo 离线模式:
npm config get offline
echo.

echo [3] 依赖安装状态
if exist "node_modules" (
    echo ✅ 根目录依赖已安装
) else (
    echo ❌ 根目录依赖未安装
)

if exist "frontend\node_modules" (
    echo ✅ 前端依赖已安装
) else (
    echo ❌ 前端依赖未安装
)

if exist "backend\node_modules" (
    echo ✅ 后端依赖已安装
) else (
    echo ❌ 后端依赖未安装
)
echo.

echo [4] 端口状态
netstat -ano | findstr ":3000" >nul
if %errorlevel%==0 (
    echo ⚠️  端口 3000 已被占用
) else (
    echo ✅ 端口 3000 可用
)

netstat -ano | findstr ":5173" >nul
if %errorlevel%==0 (
    echo ⚠️  端口 5173 已被占用
) else (
    echo ✅ 端口 5173 可用
)
echo.

echo ========================================
echo   检查完成
echo ========================================
echo.
echo 如果依赖未安装，请运行：
echo   - 一键修复并启动.bat（推荐）
echo   - 以管理员身份安装.bat
echo.
pause
