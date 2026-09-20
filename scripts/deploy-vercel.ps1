param(
  [switch]$Production
)

$ErrorActionPreference = "Stop"
$teamSlug = "nvhoa1691993-6852s-projects"
$cliVersion = "59.20.0"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  $branch = (git branch --show-current).Trim()
  if ($branch -ne "main") {
    throw "Deploy only from canonical main. Current branch: $branch"
  }

  $dirty = git status --porcelain
  if ($dirty) {
    throw "Working tree is not clean. Commit, stash, or discard local changes before deploy."
  }

  git fetch origin main | Out-Host
  $localSha = (git rev-parse HEAD).Trim()
  $remoteSha = (git rev-parse origin/main).Trim()
  if ($localSha -ne $remoteSha) {
    throw "Local main ($localSha) does not match origin/main ($remoteSha). Run git pull --ff-only first."
  }

  Write-Host "Running canonical committed-dist and deployment gates..." -ForegroundColor Cyan
  npm run test:dist
  if ($LASTEXITCODE -ne 0) { throw "npm run test:dist failed" }

  npm run verify:deploy
  if ($LASTEXITCODE -ne 0) { throw "npm run verify:deploy failed" }

  $vercelArgs = @("--yes", "vercel@$cliVersion", "--yes", "--scope", $teamSlug)
  $isLinked = Test-Path (Join-Path $repoRoot ".vercel\project.json")
  if ($Production) {
    $vercelArgs += "--prod"
    Write-Host "Deploying production from $localSha..." -ForegroundColor Yellow
  } elseif ($isLinked) {
    Write-Host "Deploying preview from $localSha..." -ForegroundColor Green
  } else {
    Write-Host "Deploying initial Vercel release from $localSha (Vercel may assign the first deployment to production)..." -ForegroundColor Yellow
  }

  & npx @vercelArgs
  if ($LASTEXITCODE -ne 0) { throw "Vercel CLI deployment failed" }

  Write-Host "Connecting the Vercel project to the canonical GitHub remote..." -ForegroundColor Cyan
  $gitConnectOutput = & npx --yes "vercel@$cliVersion" git connect --yes --scope $teamSlug 2>&1
  $gitConnectExit = $LASTEXITCODE
  $gitConnectOutput | Out-Host
  $gitConnectText = $gitConnectOutput | Out-String
  if ($gitConnectExit -ne 0 -and $gitConnectText -notmatch "already connected") {
    Write-Warning "Deployment succeeded, but Git auto-deploy connection was not confirmed. Run: npx --yes vercel@$cliVersion git connect --yes --scope $teamSlug"
  } elseif ($gitConnectText -match "already connected") {
    Write-Host "Git auto-deploy connection already exists." -ForegroundColor Green
  }
}
finally {
  Pop-Location
}
