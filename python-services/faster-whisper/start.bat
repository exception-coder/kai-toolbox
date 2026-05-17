@echo off
chcp 65001 > nul
REM ---------------------------------------------------------------------------
REM IMPORTANT: Keep all REM comments in this file ASCII-only.
REM Windows cmd parses the batch file using the SYSTEM ANSI codepage (GBK on
REM zh-CN Windows), regardless of `chcp`. `chcp 65001` only changes console
REM OUTPUT encoding, not how cmd reads this .bat. UTF-8 multibyte sequences
REM in CJK comments get misread as GBK doublebytes whose 2nd byte may land on
REM 0x7C (|), 0x26 (&), 0x3D (=), etc., turning comment lines into accidental
REM commands and polluting set/call/if control flow (e.g. venv never gets
REM activated, system Python ends up running uvicorn -> "No module named
REM uvicorn"). Put the human-friendly Chinese explanation in README.md.
REM ---------------------------------------------------------------------------
REM Windows launcher for the faster-whisper ASR service.
REM First run: creates .venv + pip install (~3-5 min).
REM Subsequent runs: < 10 sec (model load dominated by disk speed).
REM
REM Override model / device / compute type via env vars BEFORE running:
REM   set WHISPER_MODEL=large-v3-turbo
REM   set WHISPER_DEVICE=cuda
REM   set WHISPER_COMPUTE_TYPE=float16
REM Models auto-download from HuggingFace into %USERPROFILE%\.cache\huggingface\

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
    echo [setup] pip install failed.
    exit /b 1
)

REM Defaults: medium model + CUDA + float16
if not defined WHISPER_MODEL set WHISPER_MODEL=medium
if not defined WHISPER_DEVICE set WHISPER_DEVICE=cuda
if not defined WHISPER_COMPUTE_TYPE set WHISPER_COMPUTE_TYPE=float16

REM First-time model download from HuggingFace. Direct connect often SSL-aborts
REM on zh-CN networks; set a proxy or HF mirror before running if needed:
REM   set HTTPS_PROXY=http://127.0.0.1:7897
REM   set HF_ENDPOINT=https://hf-mirror.com

echo [start] WHISPER_MODEL=%WHISPER_MODEL% DEVICE=%WHISPER_DEVICE% COMPUTE_TYPE=%WHISPER_COMPUTE_TYPE%
if defined HTTPS_PROXY echo [start] HTTPS_PROXY=%HTTPS_PROXY%
if defined HF_ENDPOINT echo [start] HF_ENDPOINT=%HF_ENDPOINT%
echo [start] uvicorn at http://127.0.0.1:9500
python -m uvicorn server:app --host 127.0.0.1 --port 9500 --log-level info
