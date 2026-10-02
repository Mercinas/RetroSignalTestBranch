import { execFile } from "node:child_process";

// Discovery is read-only. Playback commands never start a stopped Lively app.
const FIND_EXECUTABLE = String.raw`
$livelyProcess = Get-Process -Name 'Lively' -ErrorAction SilentlyContinue | Select-Object -First 1
$candidates = @()
if ($livelyProcess -and $livelyProcess.Path) { $candidates += $livelyProcess.Path }
$package = Get-AppxPackage -Name '12030rocksdanister.LivelyWallpaper' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($package) { $candidates += Join-Path $package.InstallLocation 'Build\Lively.exe'; $candidates += Join-Path $package.InstallLocation 'Lively.exe' }
if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Lively Wallpaper\Lively.exe' }
$programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if ($programFilesX86) { $candidates += Join-Path $programFilesX86 'Lively Wallpaper\Lively.exe' }
if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Lively Wallpaper\Lively.exe' }
$livelyExe = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
`;

export function createLivelyController({ execute = execFile } = {}) {
  const run = command => new Promise((resolve, reject) => {
    execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, timeout: 10_000 }, (error, stdout) => {
        if (error) return reject(new Error("Lively could not be contacted. You can keep using the Manager independently."));
        try { resolve(JSON.parse(String(stdout).trim())); }
        catch { reject(new Error("Lively returned an unexpected response.")); }
      });
  });
  return Object.freeze({
    open: () => run(`${FIND_EXECUTABLE}
if (!$livelyExe) { @{ opened = $false; message = 'Lively is not installed. It is optional for wallpaper mode; the Manager and standalone player work without it.' } | ConvertTo-Json -Compress; exit }
Start-Process -FilePath $livelyExe -ErrorAction Stop
@{ opened = $true } | ConvertTo-Json -Compress`),
    setPlayback: playing => run(`
$livelyProcess = Get-Process -Name 'Lively' -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$livelyProcess) { @{ changed = $false } | ConvertTo-Json -Compress; exit }
${FIND_EXECUTABLE}
if (!$livelyExe) { @{ changed = $false } | ConvertTo-Json -Compress; exit }
& $livelyExe app --play ${playing ? "true" : "false"} | Out-Null
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { @{ changed = $false } | ConvertTo-Json -Compress; exit }
@{ changed = $true } | ConvertTo-Json -Compress`),
  });
}
