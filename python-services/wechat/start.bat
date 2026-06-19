@echo off
chcp 65001 > nul
REM ---------------------------------------------------------------------------
REM IMPORTANT: Keep all REM comments in this file ASCII-only.
REM Windows cmd parses .bat using the SYSTEM ANSI codepage (GBK on zh-CN),
REM regardless of `chcp`. UTF-8 CJK bytes can land on |, &, =, breaking control
REM flow. Put any Chinese explanation in README.md, not here.
REM ---------------------------------------------------------------------------
REM Launcher for the wechat (wxauto) sidecar.
REM PRECONDITION: WeChat desktop client must be RUNNING and LOGGED IN on this PC.
REM First run: creates .venv + pip install. Subsequent runs: a few seconds.

cd /d %~dp0

if not exist .venv (
    echo [setup] creating venv...
    python -m venv .venv
    if errorlevel 1 (
        echo [setup] failed to create venv. Need Python 3.10+ in PATH.
        exit /b 1
    )
)

call .venv\Scripts\activate.bat

echo [setup] installing/upgrading dependencies...
pip install -q --upgrade pip
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [setup] pip install failed. If it is wxauto/wxautox, check your WeChat version vs requirements.txt.
    exit /b 1
)

echo [start] uvicorn at http://127.0.0.1:9700
echo [start] make sure WeChat is open and logged in, otherwise /health reports wechat_online=false
python -m uvicorn server:app --host 127.0.0.1 --port 9700 --log-level info
