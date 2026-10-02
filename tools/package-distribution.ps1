param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$version = (Get-Content -LiteralPath (Join-Path $projectRoot "VERSION") -Raw).Trim()
$distRoot = Join-Path $projectRoot "dist"
$wallpaperArchive = Join-Path $distRoot "RetroSignal-$version.zip"
$managerInstaller = Join-Path $distRoot "RetroSignal-Manager\RetroSignal-Manager-Setup-$version.exe"
$stageRoot = Join-Path $distRoot "RetroSignal-$version-Windows-staging"
$archivePath = Join-Path $distRoot "RetroSignal-$version-Windows.zip"
$checksumPath = "$archivePath.sha256"

function Assert-WithinDist([string]$Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  $fullDist = [IO.Path]::GetFullPath($distRoot)
  if (-not $fullPath.StartsWith($fullDist + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to use a distribution target outside $fullDist."
  }
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace("-", "") }
    finally { $hasher.Dispose() }
  } finally {
    $stream.Dispose()
  }
}

foreach ($required in @($wallpaperArchive, $managerInstaller, (Join-Path $projectRoot "START HERE.txt"))) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required distribution file is missing: $required" }
}
foreach ($target in @($stageRoot, $archivePath, $checksumPath)) {
  Assert-WithinDist $target
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

$wallpaperRoot = Join-Path $stageRoot "RetroSignal Wallpaper"
New-Item -ItemType Directory -Path $wallpaperRoot -Force | Out-Null
Expand-Archive -LiteralPath $wallpaperArchive -DestinationPath $wallpaperRoot -Force
Copy-Item -LiteralPath $managerInstaller -Destination (Join-Path $stageRoot "RetroSignal Manager Setup.exe")
Copy-Item -LiteralPath (Join-Path $projectRoot "START HERE.txt") -Destination (Join-Path $stageRoot "START HERE.txt")

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
Remove-Item -LiteralPath $stageRoot -Recurse -Force
$hash = Get-Sha256 $archivePath
[IO.File]::WriteAllText($checksumPath, "$hash  $(Split-Path $archivePath -Leaf)$([Environment]::NewLine)")
Write-Output "Created $archivePath"
Write-Output "SHA256 $hash"
