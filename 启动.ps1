# 启动脚本 - PowerShell版本
# 使用方法：
# 1. 右键点击此文件，选择"使用 PowerShell 运行"
# 2. 或在 PowerShell 中执行: .\启动.ps1

# 设置执行策略（仅当前进程）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force -ErrorAction SilentlyContinue

# 切换到脚本所在目录
Set-Location $PSScriptRoot

# 运行主脚本
& "$PSScriptRoot\start.ps1"
