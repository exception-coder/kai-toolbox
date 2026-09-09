@echo off
setlocal
call "%~dp0internal\invoke-powershell.cmd" -NoProfile -ExecutionPolicy Bypass -File "%~dp0internal\stop-supervised.ps1" %*
exit /b %ERRORLEVEL%
