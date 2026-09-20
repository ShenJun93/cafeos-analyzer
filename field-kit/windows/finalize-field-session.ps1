param([Parameter(Mandatory=$true)][string]$SessionFolder)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Session = (Resolve-Path $SessionFolder).Path
$Draft = Join-Path $Session 'validation-record.draft.json'
if (-not (Test-Path $Draft)) { throw "Missing validation-record.draft.json in $Session" }

function Ask-YesNo([string]$Prompt) {
  while ($true) {
    $Value = (Read-Host "$Prompt [y/n]").Trim().ToLowerInvariant()
    if ($Value -in @('y','yes')) { return $true }
    if ($Value -in @('n','no')) { return $false }
    Write-Host 'Please answer y or n.' -ForegroundColor Yellow
  }
}

$Answers = [ordered]@{}
$Answers.reconciliationAttempted = Ask-YesNo 'Did you reconcile CafeOS totals against the source POS/report?'
$Answers.metricTrusted = Ask-YesNo 'After reconciliation, are the metrics trusted?'
$Answers.insightReviewed = Ask-YesNo 'Did the operator review at least one CafeOS insight?'
$Answers.usefulNewInsight = Ask-YesNo 'Was at least one insight useful AND new to the operator?'
$Answers.repeatUseAsked = Ask-YesNo 'Did you ask whether they want to use it again?'
$Answers.repeatUseIntent = if ($Answers.repeatUseAsked) { Ask-YesNo 'Did they want repeat use?' } else { $false }
$Answers.continuousSyncAsked = Ask-YesNo 'Did you ask whether they want continuous POS sync?'
$Answers.continuousSyncIntent = if ($Answers.continuousSyncAsked) { Ask-YesNo 'Did they want continuous sync?' } else { $false }
$Answers.valueDemonstrated = Ask-YesNo 'Was concrete product value demonstrated before the WTP question?'
$Answers.wtpAsked = if ($Answers.valueDemonstrated) { Ask-YesNo 'Did you ask willingness to pay?' } else { $false }
$Answers.willingnessToPay = if ($Answers.wtpAsked) { Ask-YesNo 'Did they express willingness to pay?' } else { $false }
if ($Answers.wtpAsked) {
  $Allowed = @('0','<500k','500k-1m','1m-2m','2m+')
  while ($true) {
    $Band = (Read-Host 'WTP band: 0 / <500k / 500k-1m / 1m-2m / 2m+').Trim()
    if ($Allowed -contains $Band) { $Answers.wtpBand = $Band; break }
    Write-Host 'Use one of the listed bands.' -ForegroundColor Yellow
  }
}
$AnswersPath = Join-Path $Session 'answers.local.json'
$CanonicalPath = Join-Path $Session 'validation-record.canonical.json'
$Answers | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $AnswersPath
& node (Join-Path $Root 'scripts/finalize-field-session.mjs') $Draft $AnswersPath $CanonicalPath
if ($LASTEXITCODE -ne 0) { throw 'Field-session finalization failed.' }
$Registry = Join-Path $Root 'field-validation-registry.json'
& node (Join-Path $Root 'scripts/field-registry.mjs') add $Registry $CanonicalPath
if ($LASTEXITCODE -ne 0) { throw 'Registry update failed.' }
Write-Host ''
Write-Host 'Current locked validation scorecard:' -ForegroundColor Green
& node (Join-Path $Root 'scripts/field-registry.mjs') score $Registry
