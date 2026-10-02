param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$version = (Get-Content -LiteralPath (Join-Path $projectRoot "VERSION") -Raw).Trim()
$distRoot = Join-Path $projectRoot "dist"
$archivePath = Join-Path $distRoot "RetroSignal-$version.zip"
$checksumPath = "$archivePath.sha256"
$stageRoot = Join-Path $distRoot "RetroSignal-$version-staging"

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace("-", "")
    } finally {
      $hasher.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-WithinRoot([string]$Path, [string]$Root, [string]$Description) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  $fullRoot = [IO.Path]::GetFullPath($Root)
  if ($fullPath -ne $fullRoot -and -not $fullPath.StartsWith($fullRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to use $Description outside $fullRoot."
  }
}

function Add-ReleaseFile([string]$RelativePath) {
  if ([IO.Path]::IsPathRooted($RelativePath) -or $RelativePath -match '(^|[\\/])\.\.([\\/]|$)') {
    throw "Invalid release file path: $RelativePath"
  }
  $sourcePath = Join-Path $projectRoot $RelativePath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required release file is missing: $RelativePath"
  }
  $destinationPath = Join-Path $stageRoot $RelativePath
  Assert-WithinRoot $destinationPath $stageRoot "release destination"
  $destinationDirectory = [IO.Path]::GetDirectoryName($destinationPath)
  if (-not (Test-Path -LiteralPath $destinationDirectory)) {
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  }
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

function Get-ArchiveEntries([string]$Path) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    return @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  } finally {
    $archive.Dispose()
  }
}

& (Join-Path $PSScriptRoot "check-release.ps1")

if (-not (Test-Path -LiteralPath $distRoot)) {
  New-Item -ItemType Directory -Path $distRoot | Out-Null
}
foreach ($target in @($archivePath, $checksumPath, $stageRoot)) {
  Assert-WithinRoot $target $distRoot "packaging target"
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}
New-Item -ItemType Directory -Path $stageRoot | Out-Null

# This is deliberately an allowlist. A release archive is never a snapshot of the
# repository: tests, tools, manager source, dependency metadata, and user data do
# not belong in a wallpaper ZIP.
$releaseFiles = @(
  "index.html",
  "emulator-frame.html",
  "LivelyInfo.json",
  "LivelyProperties.json",
  "VERSION",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "license.txt",
  "THIRD_PARTY_NOTICES.md",
  "js/color-thief.umd.js",
  "js/emulator-frame.js",
  "js/emulator-host.js",
  "js/es-module-shims.js",
  "js/keyboard-shortcuts.js",
  "js/library-store.js",
  "js/navigation.js",
  "js/retrosignal.js",
  "js/save-bridge.js",
  "js/play-session-bridge.js",
  "js/systems.js",
  "js/threejs/three.module.js",
  "js/threejs/jsm/loaders/GLTFLoader.js",
  "js/threejs/jsm/loaders/RGBELoader.js",
  "models/screen_low.glb",
  "textures/colorful_studio_1k.hdr",
  "textures/no_signal.webm",
  "bios/psx/README.txt",
  "roms/README.txt",
  "roms/library.example.json",
  "roms/atari2600/README.txt",
  "roms/gb/README.txt",
  "roms/gba/README.txt",
  "roms/nes/README.txt",
  "roms/psx/README.txt",
  "roms/snes/README.txt",
  "docs/PLATFORM_MATRIX.md",
  "docs/ARCHITECTURE.md",
  "docs/LIVELY_CONTROLS.md",
  "docs/PERFORMANCE.md",
  "docs/SYSTEM_VALIDATION.md",
  "docs/VERIFICATION.md",
  "docs/screenshots/README.md",
  "docs/screenshots/selector.png",
  "emulatorjs/EMULATORJS-LICENSE.txt",
  "emulatorjs/emulator.css",
  "emulatorjs/loader.js",
  "emulatorjs/version.json",
  "emulatorjs/compression/extract7z.js",
  "emulatorjs/compression/extractzip.js",
  "emulatorjs/compression/libunrar.js",
  "emulatorjs/compression/libunrar.wasm",
  "emulatorjs/cores/RELEASE_FILES.txt",
  "emulatorjs/src/compression.js",
  "emulatorjs/src/emulator.js",
  "emulatorjs/src/GameManager.js",
  "emulatorjs/src/gamepad.js",
  "emulatorjs/src/nativezip-worker.js",
  "emulatorjs/src/nativezip.js",
  "emulatorjs/src/nipplejs.js",
  "emulatorjs/src/shaders.js",
  "emulatorjs/src/socket.io.min.js",
  "emulatorjs/src/storage.js"
)

Get-ChildItem -LiteralPath (Join-Path $projectRoot "LICENSES") -File | ForEach-Object {
  $releaseFiles += "LICENSES/$($_.Name)"
}
Get-ChildItem -LiteralPath (Join-Path $projectRoot "emulatorjs/localization") -Filter "*.json" -File | ForEach-Object {
  $releaseFiles += "emulatorjs/localization/$($_.Name)"
}
Get-ChildItem -LiteralPath (Join-Path $projectRoot "emulatorjs/cores/reports") -Filter "*.json" -File | ForEach-Object {
  $releaseFiles += "emulatorjs/cores/reports/$($_.Name)"
}

$releaseCoreNames = @(Get-Content -LiteralPath (Join-Path $projectRoot "emulatorjs/cores/RELEASE_FILES.txt") | Where-Object { $_ })
$releaseCoreSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($name in $releaseCoreNames) {
  [void]$releaseCoreSet.Add($name)
  $releaseFiles += "emulatorjs/cores/$name"
}

$releaseChecksumLines = @(Get-Content -LiteralPath (Join-Path $projectRoot "emulatorjs/cores/SHA256SUMS") | Where-Object {
  $parts = $_ -split '\s{2}', 2
  $parts.Count -eq 2 -and $releaseCoreSet.Contains($parts[1])
})
if ($releaseChecksumLines.Count -ne $releaseCoreNames.Count) {
  throw "Release core checksum matrix is incomplete."
}

foreach ($relativePath in $releaseFiles | Sort-Object -Unique) {
  Add-ReleaseFile $relativePath
}

$stagedChecksumPath = Join-Path $stageRoot "emulatorjs/cores/SHA256SUMS"
[System.IO.File]::WriteAllLines($stagedChecksumPath, $releaseChecksumLines, [Text.UTF8Encoding]::new($false))

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $stageRoot,
  $archivePath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)

$archiveEntries = Get-ArchiveEntries $archivePath
$blockedEntry = $archiveEntries | Where-Object {
  $_ -match '^(manager|tests|tools|node_modules|\.git)/' -or
  $_ -match '(^|/)(library\.local\.json|manager\.json|manager-token\.txt|\.retrosignal-migration\.json|SaveData|User Data|WebView2|profiles?|Backups?)(/|$)'
} | Select-Object -First 1
if ($blockedEntry) {
  throw "Release archive contains a blocked entry: $blockedEntry"
}
$archivedCoreNames = @($archiveEntries | Where-Object { $_ -like "emulatorjs/cores/*.data" } | ForEach-Object { [IO.Path]::GetFileName($_) } | Sort-Object)
if (($archivedCoreNames -join "`n") -ne (($releaseCoreNames | Sort-Object) -join "`n")) {
  throw "Archive core matrix does not match RELEASE_FILES.txt."
}
foreach ($requiredEntry in @("index.html", "LivelyInfo.json", "emulatorjs/cores/SHA256SUMS", "docs/screenshots/selector.png")) {
  if ($requiredEntry -notin $archiveEntries) {
    throw "Release archive is missing $requiredEntry."
  }
}

Remove-Item -LiteralPath $stageRoot -Recurse -Force

$hash = Get-Sha256 $archivePath
$checksumLine = "$hash  $(Split-Path $archivePath -Leaf)"
[System.IO.File]::WriteAllText($checksumPath, $checksumLine + [Environment]::NewLine)

Write-Output "Created $archivePath"
Write-Output "SHA256 $hash"
