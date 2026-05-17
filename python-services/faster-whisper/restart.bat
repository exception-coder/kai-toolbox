@echo off
chcp 65001 > nul
REM Keep this file ASCII-only -- see start.bat header for why.
REM Restart helper: kill any process listening on :9500, then call start.bat.

cd /d %~dp0

echo [restart] looking for process listening on :9500 ...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":9500 "') do (
    echo [restart] killing PID %%a
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)
if "%FOUND%"=="0" echo [restart] no process on :9500, going straight to start.

call start.bat
