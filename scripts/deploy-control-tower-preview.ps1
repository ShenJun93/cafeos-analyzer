param(
  [string]$SupabaseUrl = "https://wjatnyvdygvblirggdcm.supabase.co",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$teamId = "team_kVjgE7Q1dpEiDcANdPZqYEaS"
$projectId = "prj_HG27M5PTKPJCrHUA0LPUOmsCrYIe"
$cliVersion = "59.20.0"
$productionAlias = "https://cafeos-analyzer.vercel.app"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$previewStatePath = Join-Path $repoRoot ".vercel\cafeos-control-tower-preview-url.txt"
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

  function Invoke-VercelCli {
    param(
      [string[]]$Arguments,
      [AllowNull()][string]$InputText = $null,
      [switch]$HasInput
    )

    # Windows PowerShell can surface a native process stderr line as NativeCommandError
    # when ErrorActionPreference=Stop, even when the process exit code is 0.
    # Vercel/npx may write informational npm notices to stderr, so capture native output
    # with Continue and make the actual pass/fail decision from LASTEXITCODE.
    $previousErrorActionPreference = $ErrorActionPreference
    $previousOrgId = $env:VERCEL_ORG_ID
    $previousProjectId = $env:VERCEL_PROJECT_ID
    try {
      $ErrorActionPreference = "Continue"

      # Pin every Vercel CLI subprocess to the canonical CafeOS project using
      # Vercel's documented environment-variable targeting. This avoids
      # depending on stale/missing local .vercel project-link state.
      $env:VERCEL_ORG_ID = $teamId
      $env:VERCEL_PROJECT_ID = $projectId

      if ($HasInput) {
        $output = $InputText | & npx --yes "vercel@$cliVersion" @Arguments 2>&1
      }
      else {
        $output = & npx --yes "vercel@$cliVersion" @Arguments 2>&1
      }
      $exitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
      if ([string]::IsNullOrEmpty($previousOrgId)) {
        Remove-Item Env:VERCEL_ORG_ID -ErrorAction SilentlyContinue
      }
      else {
        $env:VERCEL_ORG_ID = $previousOrgId
      }
      if ([string]::IsNullOrEmpty($previousProjectId)) {
        Remove-Item Env:VERCEL_PROJECT_ID -ErrorAction SilentlyContinue
      }
      else {
        $env:VERCEL_PROJECT_ID = $previousProjectId
      }
    }

    return [pscustomobject]@{
      ExitCode = $exitCode
      Output = @($output)
      Text = ($output | Out-String)
    }
  }

  function Set-PreviewEnv([string]$Name, [string]$Value) {
    Write-Host "Refreshing preview-only Vercel variable: $Name" -ForegroundColor Cyan

    $remove = Invoke-VercelCli -Arguments @(
      "env", "rm", $Name, "preview", "--yes"
    )
    if ($remove.ExitCode -ne 0 -and $remove.Text -notmatch '(not found|does not exist|no environment variable)') {
      $remove.Output | Out-Host
      throw "Could not safely refresh preview variable $Name"
    }

    $add = Invoke-VercelCli -Arguments @(
      "env", "add", $Name, "preview"
    ) -InputText $Value -HasInput
    if ($add.ExitCode -ne 0) {
      $add.Output | Out-Host
      throw "Failed to add preview variable $Name"
    }

    Write-Host "Preview variable configured: $Name" -ForegroundColor Green
  }

  Set-PreviewEnv "SUPABASE_URL" $SupabaseUrl.TrimEnd("/")
  Set-PreviewEnv "SUPABASE_PUBLISHABLE_KEY" $publishableKey

  Write-Host "Verifying required Preview environment variable names..." -ForegroundColor Cyan
  $envList = Invoke-VercelCli -Arguments @(
    "env", "ls", "preview",
    "--format", "json"
  )
  if ($envList.ExitCode -ne 0) {
    $envList.Output | Out-Host
    throw "Could not list Vercel preview environment variables"
  }
  foreach ($requiredName in @("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")) {
    $jsonKeyPattern = '"key"\s*:\s*"' + [regex]::Escape($requiredName) + '"'
    if ($envList.Text -notmatch $jsonKeyPattern) {
      $envList.Output | Out-Host
      throw "Required Vercel preview variable is missing after refresh: $requiredName"
    }
  }
  Write-Host "PASS required Preview environment variable names are present" -ForegroundColor Green

  if ($SkipDeploy) {
    Write-Host "Preview environment configured. Deployment skipped by request." -ForegroundColor Yellow
    return
  }

  Write-Host "Deploying a PREVIEW target only; production alias will not be promoted." -ForegroundColor Green
  $deploy = Invoke-VercelCli -Arguments @(
    "deploy", "--yes"
  )
  $deploy.Output | Out-Host
  if ($deploy.ExitCode -ne 0) { throw "Vercel preview deployment failed" }

  $deployText = $deploy.Text
  $matches = [regex]::Matches($deployText, 'https://[^\s]+\.vercel\.app')
  if ($matches.Count -eq 0) {
    throw "Preview deployed but its URL could not be parsed from Vercel CLI output."
  }

  $previewUrl = $matches[$matches.Count - 1].Value.TrimEnd("/")
  if ($previewUrl -eq $productionAlias) {
    throw "Safety stop: CLI returned the production alias instead of a preview URL."
  }

  Write-Host "Running unauthenticated protected-preview smoke against $previewUrl ..." -ForegroundColor Cyan
  node scripts/verify-control-tower-protected-preview.mjs $previewUrl --unauth-only
  if ($LASTEXITCODE -ne 0) {
    throw "Unauthenticated Control Tower protected-preview smoke failed"
  }

  $previewStateDir = Split-Path -Parent $previewStatePath
  New-Item -ItemType Directory -Force -Path $previewStateDir | Out-Null
  Set-Content -Path $previewStatePath -Value $previewUrl -NoNewline -Encoding utf8

  Write-Host "PREVIEW READY: $previewUrl" -ForegroundColor Green
  Write-Host "Saved current preview URL to .vercel/cafeos-control-tower-preview-url.txt" -ForegroundColor Green
  Write-Host "Run npm run verify:control-tower-auth-smoke for the authenticated Tenant A/B gate." -ForegroundColor Cyan
}
finally {
  Pop-Location
}