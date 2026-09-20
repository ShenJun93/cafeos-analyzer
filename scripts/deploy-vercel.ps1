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
  if ($Production) {
    $vercelArgs += "--prod"
    Write-Host "Deploying production from $localSha..." -ForegroundColor Yellow
  } else {
    Write-Host "Deploying preview from $localSha..." -ForegroundColor Green
  }

  & npx @vercelArgs
  if ($LASTEXITCODE -ne 0) { throw "Vercel CLI deployment failed" }

  Write-Host "Connecting the Vercel project to the canonical GitHub remote..." -ForegroundColor Cyan
  & npx --yes "vercel@$cliVersion" git connect --yes --scope $teamSlug
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Deployment succeeded, but Git auto-deploy connection was not confirmed. Run: npx --yes vercel@$cliVersion git connect --yes --scope $teamSlug"
  }
}
finally {
  Pop-Location
}
