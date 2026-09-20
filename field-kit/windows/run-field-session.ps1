param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) { throw 'Node.js 20+ is required.' }
$Resolved = (Resolve-Path $File).Path
$Source = Read-Host 'POS/source (e.g. kiotviet, cukcuk, sapo, ipos, pos365, other)'
$StoresRaw = Read-Host 'Number of cafe locations'
$Stores = 0
if (-not [int]::TryParse($StoresRaw, [ref]$Stores) -or $Stores -lt 1) { throw 'Store count must be a positive integer.' }
$SessionRoot = Join-Path $Root 'field-sessions'
New-Item -ItemType Directory -Force -Path $SessionRoot | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Out = Join-Path $SessionRoot $Stamp
& node (Join-Path $Root 'scripts/field-session.mjs') $Resolved "--source=$Source" "--stores=$Stores" "--out=$Out"
if ($LASTEXITCODE -ne 0) { Write-Warning 'Import failed; diagnostic session artifacts were still created.' }
Start-Process explorer.exe $Out
Write-Host "Field session created: $Out" -ForegroundColor Green
