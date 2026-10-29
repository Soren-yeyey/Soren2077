# 一键本地演示（不依赖网络）
# 用法：右键 -> 使用 PowerShell 运行；或在终端里执行 .\start-demo.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8795

Write-Host "启动本地服务器：$root" -ForegroundColor Cyan

# 端口被占用时换一个
$busy = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($busy) { $port = 8801 }

# 预热：先把三个页面用 Invoke-WebRequest 拉一遍，让磁盘缓存热起来（可选）
$server = Start-Process -FilePath 'python' -ArgumentList '-B', '-m', 'http.server', "$port", '--bind', '127.0.0.1' `
                        -WorkingDirectory $root -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 2
$url = "http://127.0.0.1:$port/"
Write-Host "已启动（PID $($server.Id)），地址：$url" -ForegroundColor Green
Write-Host "演示顺序：主页 -> 选车跑一段 -> 返回" -ForegroundColor Yellow
Start-Process $url

Write-Host ""
Write-Host "演示结束后关闭这个窗口即可停止服务器。" -ForegroundColor DarkGray
Read-Host "按回车停止服务器"
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
