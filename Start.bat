@echo off
setlocal
title Video Summaries
cd /d "%~dp0"

rem Everything this app needs stays inside this folder. Nothing is installed globally.
set "NODE_VERSION=v24.11.0"
set "RUNTIME=%~dp0.runtime"
set "npm_config_cache=%RUNTIME%\npm-cache"
set "npm_config_update_notifier=false"
set "NEXT_TELEMETRY_DISABLED=1"

echo.
echo  Video Summaries
echo  ===============
echo.
echo [1/4] Checking for Node.js...

rem 1. A private copy of Node.js downloaded on an earlier run.
if exist "%RUNTIME%\node\node.exe" (
  set "PATH=%RUNTIME%\node;%PATH%"
  echo       Using the copy of Node.js inside this folder.
  goto run
)

rem 2. The computer's own Node.js, if it is recent enough.
where node >nul 2>nul && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" && (
  echo       Using the Node.js already installed on this computer.
  goto run
)

rem 3. Otherwise download a private copy of Node.js into this folder.
call :install_node || goto failed
set "PATH=%RUNTIME%\node;%PATH%"

:run
node scripts\start.mjs
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Something went wrong. Read the messages above, then press any key to close this window.
pause >nul
exit /b 1

:install_node
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
set "NODE_DIST=node-%NODE_VERSION%-win-%ARCH%"
echo       Node.js %NODE_VERSION% or a recent version was not found on this computer.
echo       It will be downloaded into this folder only (no system install, no admin rights).
echo.
echo       DOWNLOADING Node.js %NODE_VERSION% (about 30 MB) from nodejs.org...
echo       Saving to: %RUNTIME%
if not exist "%RUNTIME%" mkdir "%RUNTIME%"
curl.exe -fL --progress-bar -o "%RUNTIME%\node.zip" "https://nodejs.org/dist/%NODE_VERSION%/%NODE_DIST%.zip" || (echo       Download failed. Check your internet connection and run this file again. & exit /b 1)
echo       VERIFYING the download...
curl.exe -fsSL -o "%RUNTIME%\SHASUMS256.txt" "https://nodejs.org/dist/%NODE_VERSION%/SHASUMS256.txt" || exit /b 1
powershell -NoProfile -Command "$hash = (Get-FileHash -LiteralPath '%RUNTIME%\node.zip' -Algorithm SHA256).Hash.ToLower(); $line = Select-String -LiteralPath '%RUNTIME%\SHASUMS256.txt' -Pattern '%NODE_DIST%.zip' -SimpleMatch; if (-not $line -or -not $line.Line.StartsWith($hash)) { exit 1 }" || (echo       The Node.js download is damaged. Run this file again. & exit /b 1)
echo       UNPACKING Node.js...
tar -xf "%RUNTIME%\node.zip" -C "%RUNTIME%" || exit /b 1
ren "%RUNTIME%\%NODE_DIST%" node || exit /b 1
del /q "%RUNTIME%\node.zip" "%RUNTIME%\SHASUMS256.txt"
echo       Node.js is ready.
exit /b 0
