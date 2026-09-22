param(
  [string]$SupabaseUrl = "https://wjatnyvdygvblirggdcm.supabase.co",
  [string]$ExpectedCommit = "",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$teamId = "team_kVjgE7Q1dpEiDcANdPZqYEaS"
$teamSlug = "nvhoa1691993-6852s-projects"
$projectId = "prj_HG27M5PTKPJCrHUA0LPUOmsCrYIe"
$cliVersion = "59.20.0"
$productionAlias = "https://cafeos-analyzer.vercel.app"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$previewStatePath = Join-Path $repoRoot ".vercel\cafeos-control-tower-preview-url.txt"
$securePublishableKey = $null
$publishableKeyPtr = [IntPtr]::Zero
Push-Location $repoRoot
try {
  $branch = [string](git branch --show-current)
  $branch = $branch.Trim()

  $dirty = git status --porcelain
  if ($dirty) {
    throw "Working tree is not clean. Commit, stash, or discard local changes first."
  }

  $localSha = (git rev-parse HEAD).Trim().ToLowerInvariant()
  if ($localSha -notmatch '^[0-9a-f]{40}$') {
    throw "Could not resolve the local HEAD to a full Git commit SHA."
  }

  if ($branch -eq "main") {
    git fetch origin main | Out-Host
    $remoteSha = (git rev-parse origin/main).Trim().ToLowerInvariant()
    if ($localSha -ne $remoteSha) {
      throw "Local main ($localSha) does not match origin/main ($remoteSha). Run git pull --ff-only first."
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedCommit)) {
      $expectedSha = $ExpectedCommit.Trim().ToLowerInvariant()
      if ($expectedSha -notmatch '^[0-9a-f]{40}$' -or $localSha -ne $expectedSha) {
        throw "ExpectedCommit must exactly match the current full main SHA."
      }
    }
    Write-Host "Preview source verified: canonical main $localSha" -ForegroundColor Green
  }
  else {
    if ([string]::IsNullOrWhiteSpace($ExpectedCommit)) {
      throw "Non-main preview requires -ExpectedCommit with the exact 40-character merge-candidate SHA."
    }
    $expectedSha = $ExpectedCommit.Trim().ToLowerInvariant()
    if ($expectedSha -notmatch '^[0-9a-f]{40}$') {
      throw "ExpectedCommit must be a full 40-character hexadecimal Git SHA."
    }
    if ($localSha -ne $expectedSha) {
      throw "Local HEAD ($localSha) does not match ExpectedCommit ($expectedSha)."
    }

    git fetch origin --prune | Out-Host
    $remoteContainingBranches = @(
      git branch -r --contains $localSha |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -like 'origin/*' }
    )
    if ($remoteContainingBranches.Count -eq 0) {
      throw "Preview candidate $localSha is not present on any origin branch. Push the exact candidate before deploying."
    }

    $sourceLabel = if ([string]::IsNullOrWhiteSpace($branch)) { "detached HEAD" } else { "branch $branch" }
    Write-Host "Preview source verified: $sourceLabel at exact pushed candidate $localSha" -ForegroundColor Green
  }

  if ($SupabaseUrl -notmatch '^https://[a-z0-9]+\.supabase\.co/?$') {
    throw "SupabaseUrl must be an HTTPS Supabase project URL."
  }

  $publishableKey = $env:SUPABASE_PUBLISHABLE_KEY
  if ([string]::IsNullOrWhiteSpace($publishableKey)) {
    $securePublishableKey = Read-Host "Staging SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)" -AsSecureString
    $publishableKeyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePublishableKey)
    $publishableKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($publishableKeyPtr)
  }

  $publishableKey = $publishableKey.Trim()
  if (
    ($publishableKey.StartsWith('"') -and $publishableKey.EndsWith('"')) -or
    ($publishableKey.StartsWith("'") -and $publishableKey.EndsWith("'")) -or
    ($publishableKey.StartsWith('`') -and $publishableKey.EndsWith('`'))
  ) {
    $publishableKey = $publishableKey.Substring(1, $publishableKey.Length - 2).Trim()
  }

  if ($publishableKey -notmatch '^sb_publishable_') {
    $enteredLength = $publishableKey.Length
    throw "Invalid publishable key format after normalization (length=$enteredLength). Paste the full staging sb_publishable_ key, not masked stars, quotes, or a secret/service-role key."
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
    try {
      $ErrorActionPreference = "Continue"
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
    }

    return [pscustomobject]@{
      ExitCode = $exitCode
      Output = @($output)
      Text = ($output | Out-String)
    }
  }

  function Write-RedactedVercelOutput($Result) {
    $safeText = $Result.Text
    if (-not [string]::IsNullOrWhiteSpace($publishableKey)) {
      $safeText = $safeText -replace [regex]::Escape($publishableKey), "[REDACTED_PUBLISHABLE_KEY]"
    }
    Write-Host $safeText
  }

  function Set-PreviewEnv([string]$Name, [string]$Value) {
    Write-Host "Upserting preview-only Vercel variable via authenticated API: $Name" -ForegroundColor Cyan

    # Use the Vercel REST API through `vercel api` instead of `vercel env add`.
    # The preview env CLI has had non-interactive/all-Preview-branches regressions.
    # --input - keeps the value on stdin rather than command-line arguments.
    $requestBody = @{
      key = $Name
      value = $Value
      type = "encrypted"
      target = @("preview")
    } | ConvertTo-Json -Compress

    $endpoint = "/v10/projects/$projectId/env?teamId=$teamId&upsert=true"
    $upsert = Invoke-VercelCli -Arguments @(
      "api", $endpoint,
      "-X", "POST",
      "--input", "-",
      "--raw"
    ) -InputText $requestBody -HasInput

    if ($upsert.ExitCode -ne 0) {
      Write-RedactedVercelOutput $upsert
      throw "Failed to upsert preview variable $Name via Vercel API"
    }

    Write-Host "Preview variable upserted: $Name" -ForegroundColor Green
  }

  Set-PreviewEnv "SUPABASE_URL" $SupabaseUrl.TrimEnd("/")
  Set-PreviewEnv "SUPABASE_PUBLISHABLE_KEY" $publishableKey

  Write-Host "Verifying required Preview environment variable names via Vercel API..." -ForegroundColor Cyan
  $envEndpoint = "/v10/projects/$projectId/env?teamId=$teamId&target=preview"
  $envList = Invoke-VercelCli -Arguments @(
    "api", $envEndpoint,
    "--raw"
  )
  if ($envList.ExitCode -ne 0) {
    Write-RedactedVercelOutput $envList
    throw "Could not list Vercel preview environment variables via API"
  }

  $returnedKeys = @(
    [regex]::Matches($envList.Text, '"key"\s*:\s*"([^"]+)"') |
      ForEach-Object { $_.Groups[1].Value } |
      Sort-Object -Unique
  )

  foreach ($requiredName in @("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY")) {
    if ($returnedKeys -notcontains $requiredName) {
      $safeKeys = if ($returnedKeys.Count -gt 0) { $returnedKeys -join ", " } else { "(none)" }
      throw "Required Vercel preview variable is missing after API upsert: $requiredName. Returned Preview keys: $safeKeys"
    }
  }
  Write-Host "PASS required Preview environment variable names are present" -ForegroundColor Green

  if ($SkipDeploy) {
    Write-Host "Preview environment configured. Deployment skipped by request." -ForegroundColor Yellow
    return
  }

  Write-Host "Deploying a PREVIEW target only; production alias will not be promoted." -ForegroundColor Green
  $deploy = Invoke-VercelCli -Arguments @(
    "deploy", "--yes",
    "--scope", $teamSlug,
    "--project", $projectId
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
  if ($publishableKeyPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($publishableKeyPtr)
  }
  $securePublishableKey = $null
  Pop-Location
}
