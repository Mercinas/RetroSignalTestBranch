param(
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path

function Fail([string]$Message) {
  throw "Release check failed: $Message"
}

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

$requiredFiles = @(
  "index.html",
  "emulator-frame.html",
  "LivelyInfo.json",
  "LivelyProperties.json",
  "docs\VERIFICATION.md",
  "docs\SYSTEM_VALIDATION.md",
  "docs\PERFORMANCE.md",
  "README.md",
  "LICENSE",
  "LICENSES\RESTRICTED-CORE-NOTICE.txt",
  "LICENSES\ZLIB.txt",
  "THIRD_PARTY_NOTICES.md",
  "VERSION",
  "js\retrosignal.js",
  "js\emulator-host.js",
  "js\emulator-frame.js",
  "js\keyboard-shortcuts.js",
  "js\library-store.js",
  "js\navigation.js",
  "js\save-bridge.js",
  "js\play-session-bridge.js",
  "js\systems.js",
  "manager\server.js",
  "manager\electron-main.mjs",
  "manager\README.md",
  "manager\page.js",
  "tools\migrate-lively-install.mjs",
  "emulatorjs\src\nativezip.js",
  "emulatorjs\src\nativezip-worker.js",
  "emulatorjs\cores\SHA256SUMS",
  "emulatorjs\cores\RELEASE_FILES.txt"
)

foreach ($relativePath in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativePath) -PathType Leaf)) {
    Fail "missing $relativePath"
  }
}

foreach ($jsonFile in @("LivelyInfo.json", "LivelyProperties.json", "package.json", "roms\library.example.json")) {
  Get-Content -LiteralPath (Join-Path $projectRoot $jsonFile) -Raw | ConvertFrom-Json | Out-Null
}

$trackedFiles = @(& git -C $projectRoot ls-files)
if ($LASTEXITCODE -ne 0) {
  Fail "Git file list is unavailable"
}

$blockedTracked = $trackedFiles | Where-Object {
  $_ -match '(^|/)(library\.local\.json|manager\.json|manager-token\.txt|\.retrosignal-migration\.json|SaveData|User Data|WebView2|profiles?|Backups?)(/|$)' -or
  $_ -match '(?i)\.(sav|srm|state|rtc|rom|iso|chd|pbp|cue|ccd|img|z64|n64|v64|gb|gbc|dmg|gba|a26|a52|a78|nes|unf|unif|sms|sg|pce|sgx|smd|gen|j64|jag|abs|cof|32x|lnx|lyx|gg|vb|vboy|log|tmp|bak|old|orig|zip|7z)$' -or
  ($_ -match '^roms/' -and $_ -match '(?i)\.md$')
}
if ($blockedTracked.Count -gt 0) {
  Fail "blocked files are tracked: $($blockedTracked -join ', ')"
}

$allowedRomFiles = @(
  "roms/README.txt",
  "roms/library.example.json",
  "roms/gb/README.txt",
  "roms/gba/README.txt",
  "roms/atari2600/README.txt",
  "roms/snes/README.txt",
  "roms/nes/README.txt",
  "roms/psx/README.txt"
)
$unexpectedRomFiles = $trackedFiles | Where-Object { $_ -like "roms/*" -and $_ -notin $allowedRomFiles }
if ($unexpectedRomFiles.Count -gt 0) {
  Fail "unexpected tracked game files: $($unexpectedRomFiles -join ', ')"
}

$unexpectedBiosFiles = $trackedFiles | Where-Object { $_ -like "bios/*" -and $_ -ne "bios/psx/README.txt" }
if ($unexpectedBiosFiles.Count -gt 0) {
  Fail "unexpected tracked firmware files: $($unexpectedBiosFiles -join ', ')"
}

if (Test-Path -LiteralPath (Join-Path $projectRoot "tools\refresh-library.ps1")) {
  Fail "the retired manual library refresh tool is still present"
}

if (Test-Path -LiteralPath (Join-Path $projectRoot "manager\desktop-launcher.mjs")) {
  Fail "the retired browser Manager launcher is still present"
}


$packageManifest = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
if ($packageManifest.scripts.PSObject.Properties.Name -contains "manager:browser") {
  Fail "the retired browser Manager script is still present"
}

$sourceTextFiles = $trackedFiles | Where-Object { $_ -match '(?i)\.(md|txt|json|js|mjs|html|css|ps1)$' }
$machinePathPattern = '(?i)([A-Z]:\\' + 'Users\\|(?<![A-Z0-9:])/' + 'Users/[^/]+/)'
foreach ($relativePath in $sourceTextFiles) {
  $fullPath = Join-Path $projectRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
  if ((Get-Content -LiteralPath $fullPath -Raw) -match $machinePathPattern) {
    Fail "machine-specific user path remains in $relativePath"
  }
}

$checksumPath = Join-Path $projectRoot "emulatorjs\cores\SHA256SUMS"
$checksumNames = @()
foreach ($line in Get-Content -LiteralPath $checksumPath) {
  if ($line -notmatch '^([A-F0-9]{64})\s{2}(.+\.data)$') {
    Fail "invalid core checksum entry"
  }
  $expectedHash = $Matches[1]
  $coreName = $Matches[2]
  $checksumNames += $coreName
  $corePath = Join-Path $projectRoot ("emulatorjs\cores\" + $coreName)
  if (-not (Test-Path -LiteralPath $corePath -PathType Leaf)) {
    Fail "missing core $coreName"
  }
  $actualHash = Get-Sha256 $corePath
  if ($actualHash -ne $expectedHash) {
    Fail "core checksum mismatch for $coreName"
  }
}

$releaseCoreNames = @(Get-Content -LiteralPath (Join-Path $projectRoot "emulatorjs\cores\RELEASE_FILES.txt") | Where-Object { $_ })
if ($releaseCoreNames.Count -ne 20 -or ($releaseCoreNames | Select-Object -Unique).Count -ne 20) {
  Fail "release core matrix must contain twenty unique files"
}
foreach ($coreName in $releaseCoreNames) {
  if ($coreName -notmatch '^[a-z0-9_]+(?:-legacy)?-wasm\.data$' -or $coreName -match '-thread') {
    Fail "invalid release core $coreName"
  }
  if ($coreName -notin $checksumNames) {
    Fail "release core is missing from SHA256SUMS: $coreName"
  }
}

$publicTextFiles = @(
  "README.md",
  "CHANGELOG.md",
  "LivelyInfo.json",
  "LivelyProperties.json",
  "docs\screenshots\README.md",
  "roms\README.txt",
  "bios\psx\README.txt"
)
$blockedText = '(?i)Music TV 64|ChatGPT|Codex|OpenAI|recovered save|recovery work|debugging history|AI tools?'
foreach ($relativePath in $publicTextFiles) {
  $fullPath = Join-Path $projectRoot $relativePath
  if ((Get-Content -LiteralPath $fullPath -Raw) -match $blockedText) {
    Fail "internal wording remains in $relativePath"
  }
}

if (-not $SkipTests) {
  Push-Location $projectRoot
  try {
    foreach ($script in @("js/systems.js", "js/emulator-host.js", "js/emulator-frame.js", "js/keyboard-shortcuts.js", "js/library-store.js", "js/navigation.js", "js/save-bridge.js", "js/play-session-bridge.js", "manager/running-session-union.mjs", "js/retrosignal.js", "manager/server.js", "manager/page.js", "manager/electron-main.mjs", "emulatorjs/src/nativezip.js", "emulatorjs/src/nativezip-worker.js", "emulatorjs/src/compression.js", "tests/catalog-harness.js", "tests/lifecycle-harness.js", "tools/migrate-lively-install.mjs", "tools/sanitize-tv-model.mjs")) {
      & node --check $script
      if ($LASTEXITCODE -ne 0) { Fail "syntax check failed for $script" }
    }
    & node --test
    if ($LASTEXITCODE -ne 0) { Fail "tests failed" }
  } finally {
    Pop-Location
  }
}

Write-Output "RetroSignal release checks passed."
