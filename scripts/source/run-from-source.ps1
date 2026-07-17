# CrunchyMurmur source bootstrap for Windows PowerShell.
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/a-streetcoder/CrunchyMurmur/main/scripts/source/run-from-source.ps1)))
#
# Downloads an exact commit archive from GitHub, installs locked dependencies,
# validates the checkout, and launches CrunchyMurmur. Git is not required.

[CmdletBinding()]
param(
  [string]$Ref = $(if ($env:CRUNCHYMURMUR_REF) { $env:CRUNCHYMURMUR_REF } else { 'main' }),
  [string]$Directory = $(if ($env:CRUNCHYMURMUR_SOURCE_DIR) { $env:CRUNCHYMURMUR_SOURCE_DIR } else { Join-Path $env:LOCALAPPDATA 'CrunchyMurmur\source' }),
  [switch]$NoLaunch,
  [switch]$SkipChecks,
  [string]$Repository = $(if ($env:CRUNCHYMURMUR_REPOSITORY) { $env:CRUNCHYMURMUR_REPOSITORY } else { 'a-streetcoder/CrunchyMurmur' })
)

$ErrorActionPreference = 'Stop'

function Invoke-CheckedCommand {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath exited with code $LASTEXITCODE." }
}

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd,npm -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $node) { throw 'Node.js 22.12 or newer is required: https://nodejs.org/' }
if (-not $npm) { throw 'npm is required.' }
$version = (& $node.Source -p 'process.versions.node').Trim().Split('.')
if ([int]$version[0] -lt 22 -or ([int]$version[0] -eq 22 -and [int]$version[1] -lt 12)) {
  throw "Node.js 22.12 or newer is required (found v$($version -join '.'))."
}

$destination = [IO.Path]::GetFullPath($Directory)
$homePath = [IO.Path]::GetFullPath($HOME).TrimEnd([IO.Path]::DirectorySeparatorChar)
if ($destination.TrimEnd([IO.Path]::DirectorySeparatorChar) -eq $homePath -or $destination -eq [IO.Path]::GetPathRoot($destination)) {
  throw "Refusing unsafe source directory: $destination"
}
$parent = Split-Path -Parent $destination
New-Item -ItemType Directory -Force -Path $parent | Out-Null
$stage = Join-Path $parent ('.crunchymurmur-source.new.' + [guid]::NewGuid())
$backup = Join-Path $parent ('.crunchymurmur-source.backup.' + [guid]::NewGuid())
$work = Join-Path ([IO.Path]::GetTempPath()) ('crunchymurmur-source.' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $stage,$work | Out-Null

try {
  Write-Host 'CrunchyMurmur source bootstrap'
  Write-Host "  Resolving $Repository@$Ref"
  $encodedRef = [Uri]::EscapeDataString($Ref)
  $headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'CrunchyMurmur-Source-Bootstrap' }
  $commitInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/commits/$encodedRef" -Headers $headers
  $commit = [string]$commitInfo.sha
  if ($commit -notmatch '^[a-f0-9]{40}$') { throw "Could not resolve $Ref to a commit." }

  Write-Host "  Downloading commit $commit"
  $archive = Join-Path $work 'source.zip'
  $expanded = Join-Path $work 'expanded'
  Invoke-WebRequest -Uri "https://api.github.com/repos/$Repository/zipball/$commit" -Headers $headers -OutFile $archive
  Expand-Archive -LiteralPath $archive -DestinationPath $expanded
  $archiveRoot = Get-ChildItem -LiteralPath $expanded -Directory | Select-Object -First 1
  if (-not $archiveRoot -or -not (Test-Path -LiteralPath (Join-Path $archiveRoot.FullName 'package-lock.json'))) {
    throw 'Downloaded archive is not a CrunchyMurmur source tree.'
  }
  Get-ChildItem -LiteralPath $archiveRoot.FullName -Force | Move-Item -Destination $stage

  Push-Location $stage
  try {
    Write-Host '  Installing locked dependencies'
    Invoke-CheckedCommand $npm.Source @('ci')
    if (-not $SkipChecks) {
      Write-Host '  Running project validation'
      Invoke-CheckedCommand $npm.Source @('run', 'check')
      Invoke-CheckedCommand $npm.Source @('run', 'release:check')
    }
    Set-Content -LiteralPath (Join-Path $stage '.source-commit') -Value $commit -NoNewline
  } finally {
    Pop-Location
  }

  if (Test-Path -LiteralPath $destination) { Move-Item -LiteralPath $destination -Destination $backup }
  Move-Item -LiteralPath $stage -Destination $destination
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }

  Write-Host "`nSource build ready."
  Write-Host "  Commit: $commit"
  Write-Host "  Directory: $destination"
  if (-not $NoLaunch) {
    Write-Host '  Launching CrunchyMurmur'
    Push-Location $destination
    try { Invoke-CheckedCommand $npm.Source @('start') } finally { Pop-Location }
  } else {
    Write-Host "  Launch later: Set-Location '$destination'; npm start"
  }
} catch {
  if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $destination)) {
    Move-Item -LiteralPath $backup -Destination $destination
  }
  throw
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
