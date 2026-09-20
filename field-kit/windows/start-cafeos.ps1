$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
  Write-Host 'CafeOS requires Node.js 20+ on this machine.' -ForegroundColor Red
  Write-Host 'Install Node.js, then run START_CAFEOS.cmd again.'
  Read-Host 'Press Enter to close'
  exit 2
}
$VersionText = (& node -p "process.versions.node").Trim()
$Major = [int]($VersionText.Split('.')[0])
if ($Major -lt 20) {
  Write-Host "Node.js $VersionText detected; CafeOS field kit requires Node.js 20+." -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 2
}
$Port = 4173
$BaseUrl = 'http://127.0.0.1:4173/'
$Process = $null
try {
  $Process = Start-Process -FilePath $Node.Source -ArgumentList 'scripts/serve.mjs' -WorkingDirectory $Root -PassThru -WindowStyle Hidden
  $Healthy = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    try {
      $Response = Invoke-WebRequest -UseBasicParsing -Uri ($BaseUrl + 'health') -TimeoutSec 1
      $Health = $Response.Content | ConvertFrom-Json
      if ($Response.StatusCode -eq 200 -and $Health.service -eq 'cafeos-analyzer') { $Healthy = $true; break }
    } catch {}
    if ($Process.HasExited) { break }
  }
  if (-not $Healthy) { throw 'CafeOS local server did not become healthy.' }
  Start-Process $BaseUrl
  Write-Host ''
  Write-Host "CafeOS Analyzer is running locally at $BaseUrl" -ForegroundColor Green
  Write-Host 'Files are processed by this local Node process; this launcher does not upload them.'
  Read-Host 'Press Enter when finished to stop CafeOS and clean up the local server'
} finally {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    try { Wait-Process -Id $Process.Id -Timeout 5 -ErrorAction SilentlyContinue } catch {}
  }
}
