# Live Commerce Platform - Startup Script
# PowerShell version

$ErrorActionPreference = "Continue"

function Show-Menu {
    Clear-Host
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Live Commerce Platform" -ForegroundColor Cyan
    Write-Host "  Startup Menu" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[1] Start All - Frontend + Backend"
    Write-Host "[2] Start Backend Only"
    Write-Host "[3] Check Status"
    Write-Host "[4] Fix Dependencies"
    Write-Host "[5] Database - Reset/Update"
    Write-Host "[6] Open Test Page"
    Write-Host "[7] Open API Terminal"
    Write-Host "[0] Exit"
    Write-Host ""
}

function Start-All {
    Write-Host ""
    Write-Host "Starting Frontend and Backend..." -ForegroundColor Green
    Write-Host ""
    
    # Kill existing processes
    Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    
    # Start services
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev"
    
    Write-Host ""
    Write-Host "Services starting..." -ForegroundColor Green
    Write-Host "Frontend: http://localhost:5173"
    Write-Host "Backend: http://localhost:3000"
    Write-Host ""
    Start-Sleep -Seconds 2
}

function Start-Backend {
    Write-Host ""
    Write-Host "Starting Backend..." -ForegroundColor Green
    Write-Host ""
    
    # Kill existing process
    Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    
    # Start backend
    $backendPath = Join-Path $PWD "backend"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm run dev"
    
    Write-Host ""
    Write-Host "Backend starting..." -ForegroundColor Green
    Write-Host "Backend: http://localhost:3000"
    Write-Host ""
    Start-Sleep -Seconds 2
}

function Check-Status {
    & ".\检查状态.bat"
    Write-Host ""
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Fix-Dependencies {
    & ".\修复npm配置并安装依赖.bat"
    Write-Host ""
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

function Show-DatabaseMenu {
    Clear-Host
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Database Management" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[1] Reset Database (delete all data)"
    Write-Host "[2] Update Seed Data (keep existing data)"
    Write-Host "[3] Backup Database"
    Write-Host "[0] Back"
    Write-Host ""
    $dbChoice = Read-Host "Select (0-3)"
    
    switch ($dbChoice) {
        "1" {
            $confirm = Read-Host "Reset database? All data will be lost! (Y/N)"
            if ($confirm -eq "Y" -or $confirm -eq "y") {
                Write-Host ""
                Write-Host "Resetting PostgreSQL database..." -ForegroundColor Yellow
                $backendPath = Join-Path $PWD "backend"
                Push-Location $backendPath
                npx tsx scripts/reset-database.ts
                Pop-Location
                Write-Host ""
                Write-Host "Database reset complete. Restart backend to apply." -ForegroundColor Green
                Start-Sleep -Seconds 3
            }
            Show-DatabaseMenu
        }
        "2" {
            Write-Host ""
            Write-Host "Updating seed data..." -ForegroundColor Green
            $backendPath = Join-Path $PWD "backend"
            Push-Location $backendPath
            npm run db:update-seed
            Pop-Location
            Write-Host ""
            Start-Sleep -Seconds 2
            Show-DatabaseMenu
        }
        "3" {
            Write-Host ""
            $pgDump = Join-Path $PWD "pgsql\bin\pg_dump.exe"
            $backupName = "live_commerce_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
            $backupPath = Join-Path $PWD "backend\$backupName"
            if (Test-Path $pgDump) {
                & $pgDump -U postgres live_commerce | Out-File $backupPath -Encoding utf8
                Write-Host "Backup created: $backupName" -ForegroundColor Green
            } else {
                Write-Host "pg_dump not found at: $pgDump" -ForegroundColor Yellow
            }
            Start-Sleep -Seconds 2
            Show-DatabaseMenu
        }
        "0" {
            return
        }
        default {
            Show-DatabaseMenu
        }
    }
}

function Open-TestPage {
    & ".\打开测试入口.bat"
}

function Open-Terminal {
    & ".\打开测试终端.bat"
}

# Main loop
Set-Location $PSScriptRoot

while ($true) {
    Show-Menu
    $choice = Read-Host "Select (0-7)"
    
    switch ($choice) {
        "1" { Start-All }
        "2" { Start-Backend }
        "3" { Check-Status }
        "4" { Fix-Dependencies }
        "5" { Show-DatabaseMenu }
        "6" { Open-TestPage }
        "7" { Open-Terminal }
        "0" { 
            Write-Host "Exiting..." -ForegroundColor Yellow
            exit 
        }
        default {
            Write-Host "Invalid option" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
