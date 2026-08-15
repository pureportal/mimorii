param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Fa-f0-9]{40}$')]
  [string]$CertificateThumbprint
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$applicationPath = Join-Path $repoRoot 'apps/client/src-tauri/target/release/Mimorii.exe'
$windowsConfigPath = Join-Path $repoRoot 'apps/client/src-tauri/tauri.windows.conf.json'
$windowsConfig = Get-Content -Raw $windowsConfigPath | ConvertFrom-Json
$timestampUrl = $windowsConfig.bundle.windows.timestampUrl
$certificatePath = "Cert:\CurrentUser\My\$CertificateThumbprint"

if (-not (Test-Path -LiteralPath $applicationPath -PathType Leaf)) {
  throw "Windows application executable was not found: $applicationPath"
}
if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
  throw "Windows signing certificate was not found: $CertificateThumbprint"
}
if ([string]::IsNullOrWhiteSpace($timestampUrl)) {
  throw 'Windows timestamp URL is not configured.'
}

$certificate = Get-Item -LiteralPath $certificatePath
$signature = Set-AuthenticodeSignature `
  -LiteralPath $applicationPath `
  -Certificate $certificate `
  -HashAlgorithm SHA256 `
  -TimestampServer $timestampUrl

if ($null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $CertificateThumbprint) {
  throw 'The Windows application executable was not signed with the selected certificate.'
}
if ($null -eq $signature.TimeStamperCertificate) {
  throw 'The Windows application executable signature was not timestamped.'
}
