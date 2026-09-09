@echo off
setlocal
where pwsh.exe >nul 2>nul
if errorlevel 1 goto windows_powershell
pwsh.exe %*
exit /b %ERRORLEVEL%

:windows_powershell
powershell.exe %*
exit /b %ERRORLEVEL%
