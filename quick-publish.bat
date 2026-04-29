@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0quick-publish.ps1" %*
if errorlevel 1 (
  echo.
  echo Publish failed.
  exit /b 1
)
echo.
echo Publish completed.
exit /b 0
