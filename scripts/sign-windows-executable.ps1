param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Fa-f0-9]{40}$')]
  [string]$CertificateThumbprint,

  [Parameter(Mandatory = $true)]
  [string[]]$Path
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$windowsConfigPath = Join-Path $repoRoot 'apps/client/src-tauri/tauri.windows.conf.json'
$windowsConfig = Get-Content -Raw $windowsConfigPath | ConvertFrom-Json
$timestampUrl = $windowsConfig.bundle.windows.timestampUrl
$certificatePath = "Cert:\CurrentUser\My\$CertificateThumbprint"

if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
  throw "Windows signing certificate was not found: $CertificateThumbprint"
}
if ([string]::IsNullOrWhiteSpace($timestampUrl)) {
  throw 'Windows timestamp URL is not configured.'
}

$certificate = Get-Item -LiteralPath $certificatePath
foreach ($item in $Path) {
  $executablePath = if ([IO.Path]::IsPathRooted($item)) { $item } else { Join-Path $repoRoot $item }
  if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
    throw "Windows executable was not found: $executablePath"
  }

  $signature = Set-AuthenticodeSignature `
    -LiteralPath $executablePath `
    -Certificate $certificate `
    -HashAlgorithm SHA256 `
    -TimestampServer $timestampUrl

  if (
    $null -eq $signature.SignerCertificate -or
    $signature.SignerCertificate.Thumbprint -ne $CertificateThumbprint
  ) {
    throw "The Windows executable was not signed with the selected certificate: $executablePath"
  }
  if ($null -eq $signature.TimeStamperCertificate) {
    throw "The Windows executable signature was not timestamped: $executablePath"
  }
}
