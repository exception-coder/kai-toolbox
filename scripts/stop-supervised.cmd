@echo off
node "%~dp0..\forge.mjs" stop %*
exit /b %ERRORLEVEL%
