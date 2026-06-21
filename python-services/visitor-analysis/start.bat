@echo off
chcp 65001 > nul
REM ---------------------------------------------------------------------------
REM IMPORTANT: Keep all REM comments in this file ASCII-only.
REM Windows cmd parses .bat using the SYSTEM ANSI codepage (GBK on zh-CN),
REM regardless of `chcp`. UTF-8 CJK bytes can land on |, &, =, breaking control
REM flow. Put any Chinese explanation in README.md, not here.
REM ---------------------------------------------------------------------------
REM Launcher for the visitor-analysis AgentScope sidecar.
REM First run: creates .venv + pip install. Subsequent runs: a few seconds.
REM
REM LLM mode: Java config-center 4sapi credentials take highest priority (no env needed).
REM Env vars below are FALLBACK only (used when Java does not pass llm config).
REM
REM   [fallback] Cloud LLM via 4sapi (default):
REM     set VA_LLM_BASE_URL=https://4sapi.com/v1
REM     set VA_LLM_API_KEY=sk-xxxx
REM     set VA_LLM_MODEL=gpt-4o-mini
REM   [fallback] Switch to local Ollama:
REM     set VA_LLM_BASE_URL=http://localhost:11434/v1
REM     set VA_LLM_API_KEY=ollama
REM     set VA_LLM_MODEL=qwen2.5:7b-instruct
REM   [optional] Qdrant vector DB for semantic recall:
REM     set QDRANT_URL=http://localhost:6333          (or cloud https://xyz.cloud.qdrant.io:6333)
REM     set QDRANT_API_KEY=                           (cloud API key; empty = no auth)
REM   [optional] Ollama bge-m3 embedding (for vector recall):
REM     set VA_EMBED_BASE_URL=http://localhost:11434/v1
REM   [optional] AgentScope Studio trace visualization:
REM     set AS_STUDIO_URL=http://localhost:3000

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

REM Default fallback: 4sapi cloud (Java config-center credentials take priority in practice)
if not defined VA_LLM_BASE_URL set VA_LLM_BASE_URL=https://4sapi.com/v1
if not defined VA_LLM_MODEL set VA_LLM_MODEL=gpt-4o-mini

echo [start] VA_LLM_BASE_URL=%VA_LLM_BASE_URL% VA_LLM_MODEL=%VA_LLM_MODEL%
if not defined VA_LLM_API_KEY echo [start] WARNING: VA_LLM_API_KEY not set - gray-zone classify will return UNKNOWN.
echo [start] uvicorn at http://127.0.0.1:9600
python -m uvicorn server:app --host 127.0.0.1 --port 9600 --log-level info
