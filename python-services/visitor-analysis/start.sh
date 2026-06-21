#!/usr/bin/env bash
# Launcher for the visitor-analysis AgentScope sidecar (macOS / Linux). Mirrors start.bat.
# First run: creates .venv + pip install. Subsequent runs: a few seconds.
#
# LLM mode: Java config-center 4sapi credentials take highest priority (no env needed).
# Env vars below are FALLBACK only (used when Java does not pass llm config).
#
#   [fallback] Cloud LLM via 4sapi (default):
#     export VA_LLM_BASE_URL=https://4sapi.com/v1
#     export VA_LLM_API_KEY=sk-xxxx
#     export VA_LLM_MODEL=gpt-4o-mini
#   [fallback] Switch to local Ollama:
#     export VA_LLM_BASE_URL=http://localhost:11434/v1
#     export VA_LLM_API_KEY=ollama
#     export VA_LLM_MODEL=qwen2.5:7b-instruct
#   [optional] Qdrant vector DB for semantic recall:
#     export QDRANT_URL=http://localhost:6333          # or cloud https://xyz.cloud.qdrant.io:6333
#     export QDRANT_API_KEY=                           # cloud API key; empty = no auth
#   [optional] Ollama bge-m3 embedding (for vector recall):
#     export VA_EMBED_BASE_URL=http://localhost:11434/v1
#   [optional] AgentScope Studio trace visualization:
#     export AS_STUDIO_URL=http://localhost:3000
set -e
cd "$(dirname "$0")"

PY="${PYTHON_CMD:-python3}"

if [[ ! -d .venv ]]; then
  echo "[setup] creating venv..."
  "$PY" -m venv .venv || { echo "[setup] failed to create venv. Need Python 3.10+ in PATH."; exit 1; }
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "[setup] installing/upgrading dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt || { echo "[setup] pip install failed."; exit 1; }

# Default fallback: 4sapi cloud (Java config-center credentials take priority in practice)
: "${VA_LLM_BASE_URL:=https://4sapi.com/v1}"
: "${VA_LLM_MODEL:=gpt-4o-mini}"
export VA_LLM_BASE_URL VA_LLM_MODEL

echo "[start] VA_LLM_BASE_URL=$VA_LLM_BASE_URL VA_LLM_MODEL=$VA_LLM_MODEL"
[[ -n "${VA_LLM_API_KEY:-}" ]] || echo "[start] WARNING: VA_LLM_API_KEY not set - gray-zone classify will return UNKNOWN."
echo "[start] uvicorn at http://127.0.0.1:9600"
exec python -m uvicorn server:app --host 127.0.0.1 --port 9600 --log-level info
