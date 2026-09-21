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

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_PUBLISHABLE_KEY)) {
  throw "SUPABASE_PUBLISHABLE_KEY is not set in this PowerShell session."
}

$createdPasswordEnv = $false
$securePassword = $null
$passwordPtr = [IntPtr]::Zero

try {
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
  if ($passwordPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }
  $securePassword = $null
}
