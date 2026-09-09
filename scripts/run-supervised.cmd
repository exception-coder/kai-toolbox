@echo off
setlocal
call "%~dp0internal\invoke-powershell.cmd" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0tests\test-powershell-compatibility.ps1"
if errorlevel 1 exit /b %ERRORLEVEL%
call "%~dp0internal\invoke-powershell.cmd" -NoProfile -ExecutionPolicy Bypass -File "%~dp0internal\run-supervised.ps1" %*
exit /b %ERRORLEVEL%
