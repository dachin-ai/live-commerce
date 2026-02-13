@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Reset Database - Stop, Reset, Start
echo ========================================
echo.

REM Step 1: Kill process on port 3000
echo [1/3] Stopping backend on port 3000...
set killed=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  if %%a GTR 0 taskkill /PID %%a /F >nul 2>&1
  if %%a GTR 0 set killed=1
)
if !killed!==0 echo        No backend process found.
timeout /t 2 /nobreak >nul
echo        Done.
echo.

REM Step 2: Reset database
echo [2/3] Resetting database...
cd backend
call npx tsx scripts/reset-database.ts
if errorlevel 1 (
  cd ..
  echo.
  echo Reset failed.
  pause
  exit /b 1
)
cd ..
echo.

REM Step 3: Start backend in new window (path with spaces must be quoted)
echo [3/3] Starting backend in new window...
start "Backend" cmd /k "cd /d ""%~dp0backend"" && npm run dev"
timeout /t 3 /nobreak >nul
echo.
echo ========================================
echo   Done. Database reset. Backend started.
echo ========================================
echo.
pause
