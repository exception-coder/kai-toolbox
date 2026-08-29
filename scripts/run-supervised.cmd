@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0internal\run-supervised.ps1" %*
exit /b %ERRORLEVEL%
