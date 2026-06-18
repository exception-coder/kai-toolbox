@echo off
chcp 65001 > nul
REM ---------------------------------------------------------------------------
REM IMPORTANT: Keep all REM comments in this file ASCII-only (same reason as
REM faster-whisper/start.bat: cmd parses .bat in the system ANSI codepage; CJK
REM UTF-8 bytes can land on |, &, = and corrupt control flow). Chinese notes
REM live in README.md.
REM ---------------------------------------------------------------------------
REM Windows launcher for the Kokoro TTS service.
REM First run: creates .venv + pip install (a few min).
REM
REM Model files (NOT auto-downloaded) must sit in this folder:
REM   kokoro-v1.0.onnx     (~310MB)
REM   voices-v1.0.bin      (~26MB)
REM Download URLs are in README.md.
REM
REM Override voice / lang before running:
REM   set KOKORO_VOICE=zf_xiaobei
REM   set KOKORO_LANG=zh

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

if not defined KOKORO_VOICE set KOKORO_VOICE=zf_xiaobei
if not defined KOKORO_LANG set KOKORO_LANG=zh

echo [start] KOKORO_VOICE=%KOKORO_VOICE% KOKORO_LANG=%KOKORO_LANG%
echo [start] uvicorn at http://127.0.0.1:9600
python -m uvicorn server:app --host 127.0.0.1 --port 9600 --log-level info
