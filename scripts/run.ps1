# Run LearnHarness from source as a desktop window (Windows).
#
#   powershell -ExecutionPolicy Bypass -File scripts\run.ps1
#
# Installs dependencies on first run (npm ci), starts the Next dev server
# on 127.0.0.1:3000 in the background unless one is already answering
# there, then opens the Electron window against it. Closing the window
# leaves the server running so the next launch is fast; stop it from Task
# Manager (the node.exe running "next dev"). Server log: %TEMP%\lh-dev.log.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$url  = 'http://127.0.0.1:3000'
$log  = Join-Path $env:TEMP 'lh-dev.log'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js is not installed (https://nodejs.org, version 22 or newer).' }
Set-Location $root

if (-not (Test-Path node_modules)) {
	Write-Host 'Installing dependencies (first run)...'
	npm ci
	if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}

function Test-Up { try { (Invoke-WebRequest -Uri "$url/api/settings" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false } }

if (-not (Test-Up)) {
	Write-Host "Starting the dev server (log: $log)..."
	# Detached through cmd so the server outlives this window and logs to a file.
	Start-Process -FilePath cmd.exe -ArgumentList '/c', "npx next dev -H 127.0.0.1 -p 3000 > `"$log`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
	$ready = $false
	for ($i = 0; $i -lt 120 -and -not $ready; $i++) { Start-Sleep -Seconds 1; $ready = Test-Up }
	if (-not $ready) { throw "The dev server did not start within 2 minutes; see $log" }
}

# An inherited ELECTRON_RUN_AS_NODE turns Electron into plain Node.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:LH_DEV_URL = $url
Write-Host 'Opening the LearnHarness window...'
npx electron .
