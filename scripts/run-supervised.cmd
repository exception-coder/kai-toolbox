@echo off
node "%~dp0..\forge.mjs" start %*
exit /b %ERRORLEVEL%
