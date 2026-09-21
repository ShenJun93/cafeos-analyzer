param(
  [string]$PreviewUrl = "https://cafeos-analyzer-nzb1i2njx-nvhoa1691993-6852s-projects.vercel.app"
)

$ErrorActionPreference = "Stop"

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
