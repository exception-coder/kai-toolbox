@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0internal\stop-supervised.ps1" %*
exit /b %ERRORLEVEL%
