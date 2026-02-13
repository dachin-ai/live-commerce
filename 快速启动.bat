@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Checking port usage...
REM Free port 3000 (backend) and 5173 (frontend)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 >nul

echo.
echo Starting services...
start "Frontend" cmd /k "cd /d ^"%~dp0frontend^" && npm run dev"
start "Backend" cmd /k "cd /d ^"%~dp0backend^" && npm run dev"
echo.
echo Started in new windows:
echo   Frontend http://localhost:5173
echo   Backend  http://localhost:3000
echo.
pause
