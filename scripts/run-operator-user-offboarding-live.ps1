$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stagingUrl = "https://wjatnyvdygvblirggdcm.supabase.co"
$createdSecretEnv = $false
$createdPublishableEnv = $false
$secretSecure = $null
$publishableSecure = $null
$secretPtr = [IntPtr]::Zero
$publishablePtr = [IntPtr]::Zero

Push-Location $repoRoot
try {
  $env:SUPABASE_URL = $stagingUrl

  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SECRET_KEY)) {
    $secretSecure = Read-Host "Staging SUPABASE_SECRET_KEY (sb_secret_...)" -AsSecureString
    $secretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
    $env:SUPABASE_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPtr).Trim()
    $createdSecretEnv = $true
  }

  if ($env:SUPABASE_SECRET_KEY -notmatch '^sb_secret_') {
    throw "Expected the modern staging sb_secret_ key."
  }

  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_PUBLISHABLE_KEY)) {
    $publishableSecure = Read-Host "Staging SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)" -AsSecureString
    $publishablePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($publishableSecure)
    $env:SUPABASE_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($publishablePtr).Trim()
    $createdPublishableEnv = $true
  }

  if ($env:SUPABASE_PUBLISHABLE_KEY -notmatch '^sb_publishable_') {
    throw "Expected the modern staging sb_publishable_ key."
  }

  & node ".\scripts\verify-operator-user-offboarding-live.mjs"
  if ($LASTEXITCODE -ne 0) {
    throw "Synthetic operator user-offboarding live acceptance failed."
  }
}
finally {
  if ($createdSecretEnv) {
    Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
  }
  if ($createdPublishableEnv) {
    Remove-Item Env:SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  }
  Remove-Item Env:CAFEOS_TARGET_USER_JWT -ErrorAction SilentlyContinue

  if ($secretPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPtr)
  }
  if ($publishablePtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($publishablePtr)
  }

  $secretSecure = $null
  $publishableSecure = $null
  Pop-Location
}
