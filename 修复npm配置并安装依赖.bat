@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================
echo   修复 npm 配置并安装后端依赖
echo ========================================
echo.
echo 此脚本用于修复以下问题：
echo   - Cannot find module 'multer'
echo   - npm 离线模式问题
echo   - npm 代理配置问题
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Node.js 未安装
    pause
    exit /b 1
)

echo [1] 清除所有代理和离线配置...
:: 清除环境变量
set npm_config_offline=
set npm_config_cache=
set npm_config_proxy=
set npm_config_https_proxy=
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set NO_PROXY=
set no_proxy=

:: 清除 npm 配置
call npm config delete proxy 2>nul
call npm config delete https-proxy 2>nul
call npm config delete offline 2>nul
call npm config delete cache 2>nul
call npm config delete http-proxy 2>nul
call npm config delete https-proxy 2>nul

:: 设置正确的配置
call npm config set registry https://registry.npmmirror.com
call npm config set fetch-retries 3
call npm config set fetch-retry-factor 2

echo ✅ npm 配置已修复
echo.

echo [2] 清除 npm 缓存...
call npm cache clean --force
echo ✅ 缓存已清除
echo.

echo [3] 安装后端依赖...
cd backend

:: 检查是否已安装 multer
if exist "node_modules\multer" (
    echo ✅ multer 已安装
    cd ..
    goto :verify
)

echo [安装] 正在安装 multer 和其他依赖...
call npm install --prefer-online --no-offline --registry https://registry.npmmirror.com --proxy false --https-proxy false

if %errorlevel% neq 0 (
    echo.
    echo [错误] 安装失败，尝试使用系统默认配置...
    call npm config delete registry
    call npm install multer@^1.4.5-lts.1
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 依赖安装失败
        echo.
        echo 请尝试：
        echo 1. 检查网络连接
        echo 2. 检查防火墙设置
        echo 3. 手动运行: cd backend && npm install
        cd ..
        pause
        exit /b 1
    )
)

cd ..

:verify
echo.
echo [4] 验证安装...
if exist "backend\node_modules\multer" (
    echo ✅ multer 安装成功
) else (
    echo ❌ multer 未找到
    echo 请手动运行: cd backend && npm install multer
)

echo.
echo ========================================
echo   完成
echo ========================================
echo.
echo [下一步] 运行"单独启动后端.bat"启动后端服务
echo.
pause
