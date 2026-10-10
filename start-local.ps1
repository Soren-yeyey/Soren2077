$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonPath = @(
    "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonPath) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) { $pythonPath = $pythonCommand.Source }
}
if (-not $pythonPath) { Write-Host 'Python 3 is required. Install Python, then run this file again.'; Read-Host 'Press Enter to exit'; exit 1 }
Start-Process 'http://127.0.0.1:8767/'
& $pythonPath -m http.server 8767 --bind 127.0.0.1 --directory $PSScriptRoot
Read-Host 'Server stopped. Press Enter to exit'
