[CmdletBinding()]
param(
  [switch]$Silent,
  [string]$Repository = 'almoretti/CrunchyMurmur-Windows'
)

$ErrorActionPreference = 'Stop'
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($architecture -notin @('x64', 'arm64')) { throw "Unsupported Windows architecture: $architecture" }

$api = "https://api.github.com/repos/$Repository/releases/latest"
$release = Invoke-RestMethod -Uri $api -Headers @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'CrunchyMurmur-Installer' }
$assetName = "CrunchyMurmur-win-$architecture.exe"
$asset = $release.assets | Where-Object name -eq $assetName | Select-Object -First 1
$checksums = $release.assets | Where-Object name -eq 'SHA256SUMS' | Select-Object -First 1
if (-not $asset -or -not $checksums) { throw "Release assets $assetName and SHA256SUMS were not found." }

$temp = Join-Path ([IO.Path]::GetTempPath()) ("CrunchyMurmur-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $installerPath = Join-Path $temp $assetName
  $checksumPath = Join-Path $temp 'SHA256SUMS'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath
  Invoke-WebRequest -Uri $checksums.browser_download_url -OutFile $checksumPath

  $line = Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match "^[a-fA-F0-9]{64}\s+\*?$([regex]::Escape($assetName))$" } | Select-Object -First 1
  if (-not $line) { throw "No checksum was published for $assetName." }
  $expected = ($line -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "SHA-256 verification failed for $assetName." }

  Write-Host "Verified $assetName ($actual)"
  $arguments = if ($Silent) { @('/S') } else { @() }
  $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
