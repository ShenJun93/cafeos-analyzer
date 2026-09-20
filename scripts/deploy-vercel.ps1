param(
  [switch]$Production
)

$ErrorActionPreference = "Stop"

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

  Write-Host "Running canonical test and deployment gates..." -ForegroundColor Cyan
  npm test
  if ($LASTEXITCODE -ne 0) { throw "npm test failed" }

  npm run verify:deploy
  if ($LASTEXITCODE -ne 0) { throw "npm run verify:deploy failed" }

  $vercelArgs = @("--yes", "vercel@59.20.0", "--yes", "--scope", "nvhoa1691993-6852s-projects")
  if ($Production) {
    $vercelArgs += "--prod"
    Write-Host "Deploying production from $localSha..." -ForegroundColor Yellow
  } else {
    Write-Host "Deploying preview from $localSha..." -ForegroundColor Green
  }

  & npx @vercelArgs
  if ($LASTEXITCODE -ne 0) { throw "Vercel CLI deployment failed" }
}
finally {
  Pop-Location
}
