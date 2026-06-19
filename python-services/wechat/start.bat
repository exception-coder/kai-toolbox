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

REM Direct PyPI is unreachable on this network; use the Tsinghua mirror (domestic, no proxy,
REM confirmed to host wxautox4). Override with PIP_INDEX env var if you have your own mirror.
if not defined PIP_INDEX set PIP_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple
echo [setup] installing dependencies from %PIP_INDEX% ...
pip install -q -i %PIP_INDEX% -r requirements.txt
if errorlevel 1 (
    echo [setup] pip install failed. Check WeChat version vs requirements.txt (wxautox4 for Weixin 4.x).
    exit /b 1
)

echo [start] uvicorn at http://127.0.0.1:9700
echo [start] make sure WeChat is open and logged in, otherwise /health reports wechat_online=false
python -m uvicorn server:app --host 127.0.0.1 --port 9700 --log-level info
