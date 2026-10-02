@echo off
setlocal
set "LOCALAPPDATA=%~dp0TestData\Local"
set "APPDATA=%~dp0TestData\Roaming"
if not exist "%LOCALAPPDATA%" mkdir "%LOCALAPPDATA%"
if not exist "%APPDATA%" mkdir "%APPDATA%"
start "" "%~dp0App\RetroSignal Manager.exe" --user-data-dir="%~dp0TestData\Chromium"
endlocal
