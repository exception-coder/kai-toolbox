#!/usr/bin/env bash
# Launcher for the visitor-analysis AgentScope sidecar (macOS / Linux). Mirrors start.bat.
# First run: creates .venv + pip install. Subsequent runs: a few seconds.
#
# Set env vars BEFORE running (required / optional as noted):
#   [required] LLM key for gray-zone classify:
#     export VA_LLM_BASE_URL=https://your-platform/v1
#     export VA_LLM_API_KEY=sk-xxxx
#     export VA_LLM_MODEL=your-model-name
#   [optional] Qdrant vector DB for semantic recall:
#     export QDRANT_URL=http://localhost:6333          # or cloud https://xyz.cloud.qdrant.io:6333
#     export QDRANT_API_KEY=                           # cloud API key; empty = no auth
#   [optional] Ollama bge-m3 embedding:
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

: "${VA_LLM_BASE_URL:=https://api.deepseek.com/v1}"
: "${VA_LLM_MODEL:=deepseek-chat}"
export VA_LLM_BASE_URL VA_LLM_MODEL

echo "[start] VA_LLM_BASE_URL=$VA_LLM_BASE_URL VA_LLM_MODEL=$VA_LLM_MODEL"
[[ -n "${VA_LLM_API_KEY:-}" ]] || echo "[start] WARNING: VA_LLM_API_KEY not set - gray-zone classify will return UNKNOWN."
echo "[start] uvicorn at http://127.0.0.1:9600"
exec python -m uvicorn server:app --host 127.0.0.1 --port 9600 --log-level info
