param(
  [string]$SupabaseUrl = "https://wjatnyvdygvblirggdcm.supabase.co",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$teamSlug = "nvhoa1691993-6852s-projects"
$projectId = "prj_HG27M5PTKPJCrHUA0LPUOmsCrYIe"
$cliVersion = "59.20.0"
$productionAlias = "https://cafeos-analyzer.vercel.app"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "main") {
    throw "Control Tower preview setup only runs from canonical main. Current branch: $branch"
  }

  $dirty = git status --porcelain
  if ($dirty) {
    throw "Working tree is not clean. Commit, stash, or discard local changes first."
  }

  git fetch origin main | Out-Host
  $localSha = (git rev-parse HEAD).Trim()
  $remoteSha = (git rev-parse origin/main).Trim()
  if ($localSha -ne $remoteSha) {
    throw "Local main ($localSha) does not match origin/main ($remoteSha). Run git pull --ff-only first."
  }

  if ($SupabaseUrl -notmatch '^https://[a-z0-9]+\.supabase\.co/?$') {
    throw "SupabaseUrl must be an HTTPS Supabase project URL."
  }

  $publishableKey = $env:SUPABASE_PUBLISHABLE_KEY
  if ([string]::IsNullOrWhiteSpace($publishableKey)) {
    throw "Set SUPABASE_PUBLISHABLE_KEY in the current PowerShell session before running this launcher."
  }
  if ($publishableKey -notmatch '^sb_publishable_') {
    throw "Wave 26 requires a modern sb_publishable_ key, not a secret/service-role key."
  }

  Write-Host "Running canonical committed-dist gates before preview mutation..." -ForegroundColor Cyan
  npm run test:dist
  if ($LASTEXITCODE -ne 0) { throw "npm run test:dist failed" }

  function Set-PreviewEnv([string]$Name, [string]$Value) {
    Write-Host "Refreshing preview-only Vercel variable: $Name" -ForegroundColor Cyan

    $removeOutput = & npx --yes "vercel@$cliVersion" env rm $Name preview --yes --scope $teamSlug --project $projectId 2>&1
    $removeExit = $LASTEXITCODE
    $removeText = $removeOutput | Out-String
    if ($removeExit -ne 0 -and $removeText -notmatch '(not found|does not exist|no environment variable)') {
      $removeOutput | Out-Host
      throw "Could not safely refresh preview variable $Name"
    }

    $Value | & npx --yes "vercel@$cliVersion" env add $Name preview --scope $teamSlug --project $projectId
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to add preview variable $Name"
    }
  }

  Set-PreviewEnv "SUPABASE_URL" $SupabaseUrl.TrimEnd("/")
  Set-PreviewEnv "SUPABASE_PUBLISHABLE_KEY" $publishableKey

  if ($SkipDeploy) {
    Write-Host "Preview environment configured. Deployment skipped by request." -ForegroundColor Yellow
    return
  }

  Write-Host "Deploying a PREVIEW target only; production alias will not be promoted." -ForegroundColor Green
  $deployOutput = & npx --yes "vercel@$cliVersion" --yes --scope $teamSlug --project $projectId 2>&1
  $deployExit = $LASTEXITCODE
  $deployOutput | Out-Host
  if ($deployExit -ne 0) { throw "Vercel preview deployment failed" }

  $deployText = $deployOutput | Out-String
  $matches = [regex]::Matches($deployText, 'https://[^\s]+\.vercel\.app')
  if ($matches.Count -eq 0) {
    throw "Preview deployed but its URL could not be parsed from Vercel CLI output."
  }

  $previewUrl = $matches[$matches.Count - 1].Value.TrimEnd("/")
  if ($previewUrl -eq $productionAlias) {
    throw "Safety stop: CLI returned the production alias instead of a preview URL."
  }

  Write-Host "Running unauthenticated preview smoke against $previewUrl ..." -ForegroundColor Cyan
  node scripts/verify-control-tower-preview.mjs $previewUrl --unauth-only
  if ($LASTEXITCODE -ne 0) { throw "Unauthenticated Control Tower preview smoke failed" }

  Write-Host "PREVIEW READY: $previewUrl" -ForegroundColor Green
  Write-Host "For full authenticated smoke, set CAFEOS_TEST_USER_JWT, CAFEOS_TEST_TENANT_ID and CAFEOS_FORBIDDEN_TENANT_ID, then run:" -ForegroundColor Cyan
  Write-Host "npm run verify:control-tower-preview -- $previewUrl" -ForegroundColor Cyan
}
finally {
  Pop-Location
}
