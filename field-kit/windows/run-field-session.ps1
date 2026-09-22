param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) { throw 'Node.js 20+ is required.' }

function Ask-YesNo([string]$Prompt) {
  while ($true) {
    $Value = (Read-Host "$Prompt [y/n]").Trim().ToLowerInvariant()
    if ($Value -in @('y','yes')) { return $true }
    if ($Value -in @('n','no')) { return $false }
    Write-Host 'Please answer y or n.' -ForegroundColor Yellow
  }
}

Write-Host 'Participant role:' -ForegroundColor Cyan
Write-Host '  1. Owner/operator'
Write-Host '  2. Other'
$RoleChoice = (Read-Host 'Choose 1 or 2').Trim()
$Role = switch ($RoleChoice) {
  '1' { 'owner_operator' }
  '2' { 'other' }
  default { throw 'Role must be 1 or 2.' }
}

$Permissioned = Ask-YesNo 'Do we have explicit permission to process this merchant export for this validation session?'
if (-not $Permissioned) {
  Write-Host 'Permission declined. No merchant file was read and no validation session was created.' -ForegroundColor Yellow
  return
}

Write-Host 'POS/source class:' -ForegroundColor Cyan
Write-Host '  1. kiotviet'
Write-Host '  2. cukcuk'
Write-Host '  3. sapo_fnb'
Write-Host '  4. ipos'
Write-Host '  5. pos365'
Write-Host '  6. generic_excel_csv'
Write-Host '  7. other_pos'
Write-Host '  8. unknown'
$SourceChoice = (Read-Host 'Choose 1-8').Trim()
$Source = switch ($SourceChoice) {
  '1' { 'kiotviet' }
  '2' { 'cukcuk' }
  '3' { 'sapo_fnb' }
  '4' { 'ipos' }
  '5' { 'pos365' }
  '6' { 'generic_excel_csv' }
  '7' { 'other_pos' }
  '8' { 'unknown' }
  default { throw 'Source must be a numbered choice from 1 to 8.' }
}

$StoresRaw = Read-Host 'Number of cafe locations'
$Stores = 0
if (-not [int]::TryParse($StoresRaw, [ref]$Stores) -or $Stores -lt 1) {
  throw 'Store count must be a positive integer.'
}

$Resolved = (Resolve-Path $File).Path
$SessionRoot = Join-Path $Root 'field-sessions'
New-Item -ItemType Directory -Force -Path $SessionRoot | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Out = Join-Path $SessionRoot $Stamp

& node (Join-Path $Root 'scripts/field-session.mjs') $Resolved "--source=$Source" "--stores=$Stores" "--role=$Role" "--permissioned=true" "--out=$Out"
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'Import failed; diagnostic session artifacts were still created.'
}
Start-Process explorer.exe $Out
Write-Host "Field session created: $Out" -ForegroundColor Green
