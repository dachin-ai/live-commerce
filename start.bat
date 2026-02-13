@echo off
chcp 65001 >nul
cd /d "%~dp0"

:menu
cls
echo ========================================
echo   Live Commerce Platform
echo   Startup Menu
echo ========================================
echo.
echo [1] Start All - Frontend + Backend
echo [2] Start Backend Only
echo [3] Check Status
echo [4] Fix Dependencies
echo [5] Database - Reset/Update
echo [6] Open Test Page
echo [7] Open API Terminal
echo [0] Exit
echo.
set /p choice=Select (0-7): 

if "%choice%"=="1" goto start_all
if "%choice%"=="2" goto start_backend
if "%choice%"=="3" goto check_status
if "%choice%"=="4" goto fix_deps
if "%choice%"=="5" goto db_menu
if "%choice%"=="6" goto open_test
if "%choice%"=="7" goto open_terminal
if "%choice%"=="0" goto end
echo Invalid option
timeout /t 1 >nul
goto menu

:start_all
echo.
echo Starting Frontend and Backend...
echo.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
)
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul
start "Services" cmd /k "npm run dev"
echo.
echo Services starting...
echo Frontend: http://localhost:5173
echo Backend: http://localhost:3000
echo.
timeout /t 2 >nul
goto menu

:start_backend
echo.
echo Starting Backend...
echo.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul
cd backend
start "Backend" cmd /k "npm run dev"
cd ..
echo.
echo Backend starting...
echo Backend: http://localhost:3000
echo.
timeout /t 2 >nul
goto menu

:check_status
call "检查状态.bat"
goto menu

:fix_deps
call "修复npm配置并安装依赖.bat"
goto menu

:db_menu
cls
echo ========================================
echo   Database Management
echo ========================================
echo.
echo [1] Reset Database (delete all data)
echo [2] Update Seed Data (keep existing data)
echo [3] Backup Database
echo [0] Back
echo.
set /p db_choice=Select (0-3): 

if "%db_choice%"=="1" goto db_reset
if "%db_choice%"=="2" goto db_update
if "%db_choice%"=="3" goto db_backup
if "%db_choice%"=="0" goto menu
goto db_menu

:db_reset
echo.
set /p confirm=Reset database? All data will be lost! (Y/N): 
if /i not "%confirm%"=="Y" goto db_menu
echo.
if exist "backend\data.db" (
    copy "backend\data.db" "backend\data.db.backup.%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%" >nul 2>&1
    echo Backup created
    del /f /q "backend\data.db"
    echo Database deleted
)
echo.
echo Restart backend to create new database
timeout /t 3 >nul
goto db_menu

:db_update
echo.
echo Updating seed data...
cd backend
call npm run db:update-seed
cd ..
echo.
timeout /t 2 >nul
goto db_menu

:db_backup
echo.
if exist "backend\data.db" (
    set backup_name=data.db.backup.%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
    copy "backend\data.db" "backend\%backup_name%" >nul 2>&1
    echo Backup created: %backup_name%
) else (
    echo Database not found
)
timeout /t 2 >nul
goto db_menu

:open_test
call "打开测试入口.bat"
goto menu

:open_terminal
call "打开测试终端.bat"
goto menu

:end
exit /b