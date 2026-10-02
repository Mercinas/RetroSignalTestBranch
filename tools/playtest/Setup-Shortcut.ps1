param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$packageRoot = $PSScriptRoot
$launcher = Join-Path $packageRoot 'Start-RetroSignal.cmd'
$executable = Join-Path $packageRoot 'App\RetroSignal Manager.exe'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf) -or -not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw 'Extract the entire ZIP first, then run Setup.cmd from the extracted RetroSignal-Manager folder.'
}
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'RetroSignal Playtest.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $packageRoot
$shortcut.IconLocation = (Join-Path $packageRoot 'RetroSignal.ico') + ',0'
$shortcut.Description = 'RetroSignal Manager private playtest with isolated test data'
$shortcut.Save()
Write-Host "Desktop shortcut created: $shortcutPath"
Write-Host 'Keep this extracted folder in place. Run Setup.cmd again if you move it.'
if (-not $NoLaunch) {
  Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ""' + $launcher + '""') -WorkingDirectory $packageRoot -WindowStyle Hidden
}
