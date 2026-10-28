# Windows installer. Normally started by INSTALL-Windows.bat (double-click).
param([string]$AdminEmail = "")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function PyOk($c) {
  try { & $c -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>$null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}
function NodeOk() {
  try { $v = (& node --version 2>$null); return ([int]($v.TrimStart('v').Split('.')[0]) -ge 20) } catch { return $false }
}
function RefreshPath() {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
function Winget($id) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "Windows Package Manager (winget) is not available. Install Python 3.12 from python.org (tick 'Add python.exe to PATH') and Node.js LTS from nodejs.org, then run this again."
  }
  winget install -e --id $id --accept-package-agreements --accept-source-agreements
}

$py = $null
if (PyOk "python") { $py = "python" } elseif (PyOk "py") { $py = "py" }
if (-not $py) {
  Write-Host "Installing Python 3.12 ..." -ForegroundColor Cyan
  Winget "Python.Python.3.12"; RefreshPath
  if (PyOk "python") { $py = "python" } elseif (PyOk "py") { $py = "py" }
}
if (-not $py) { throw "Python was installed but this window cannot see it yet. Close this window and double-click INSTALL again." }
if (-not (NodeOk)) {
  Write-Host "Installing Node.js (LTS) ..." -ForegroundColor Cyan
  Winget "OpenJS.NodeJS.LTS"; RefreshPath
}
if (-not (NodeOk)) { throw "Node.js was installed but this window cannot see it yet. Close this window and double-click INSTALL again." }

if (-not $AdminEmail) { $AdminEmail = Read-Host "Your email address (this account becomes the administrator; press Enter to skip)" }
$args2 = @("scripts\install.py"); if ($AdminEmail) { $args2 += @("--admin-email", $AdminEmail) }
& $py @args2
exit $LASTEXITCODE
