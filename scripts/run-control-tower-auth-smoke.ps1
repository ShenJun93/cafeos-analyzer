param(
  [string]$PreviewUrl = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$previewStatePath = Join-Path $repoRoot ".vercel\cafeos-control-tower-preview-url.txt"

if ([string]::IsNullOrWhiteSpace($PreviewUrl)) {
  if (-not (Test-Path $previewStatePath)) {
    throw "No fresh Control Tower preview URL is recorded. Run npm run deploy:control-tower-preview first."
  }
  $PreviewUrl = (Get-Content $previewStatePath -Raw).Trim()
}

if ($PreviewUrl -eq "https://cafeos-analyzer.vercel.app") {
  throw "Authenticated smoke refuses the production alias."
}

$createdPublishableKeyEnv = $false
$securePublishableKey = $null
$publishableKeyPtr = [IntPtr]::Zero
$createdPasswordEnv = $false
$securePassword = $null
$passwordPtr = [IntPtr]::Zero

try {
  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_PUBLISHABLE_KEY)) {
    $securePublishableKey = Read-Host "Staging SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)" -AsSecureString
    $publishableKeyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePublishableKey)
    $env:SUPABASE_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($publishableKeyPtr)
    $createdPublishableKeyEnv = $true
  }

  if ($env:SUPABASE_PUBLISHABLE_KEY -notmatch '^sb_publishable_') {
    throw "Authenticated smoke requires a modern sb_publishable_ key."
  }

  if ([string]::IsNullOrWhiteSpace($env:CAFEOS_TEST_USER_PASSWORD)) {
    $securePassword = Read-Host "Synthetic CafeOS test-user password" -AsSecureString
    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:CAFEOS_TEST_USER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    $createdPasswordEnv = $true
  }

  node scripts/verify-control-tower-protected-preview.mjs $PreviewUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Authenticated Control Tower preview smoke failed"
  }
}
finally {
  if ($createdPasswordEnv) {
    Remove-Item Env:CAFEOS_TEST_USER_PASSWORD -ErrorAction SilentlyContinue
  }
  if ($createdPublishableKeyEnv) {
    Remove-Item Env:SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  }
  if ($passwordPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }
  if ($publishableKeyPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($publishableKeyPtr)
  }
  $securePassword = $null
  $securePublishableKey = $null
}
