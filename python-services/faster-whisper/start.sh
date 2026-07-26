#!/usr/bin/env bash
# Launcher for the faster-whisper ASR sidecar (macOS / Linux). Mirrors start.bat.
# First run: creates .venv + pip install (~3-5 min) and downloads the model on first use.
#
# Env vars (all optional, see README.md 配置 section):
#   export WHISPER_MODEL=large-v3-turbo     # tiny / base / small / medium / large-v3 / large-v3-turbo
#   export WHISPER_DEVICE=cuda              # cpu / cuda
#   export WHISPER_COMPUTE_TYPE=float16     # float16 / int8_float16 (low VRAM) / int8 (CPU)
#
# Model downloads come from HuggingFace and are often throttled on zh-CN networks:
#   export HTTPS_PROXY=http://127.0.0.1:7897
#   export HF_ENDPOINT=https://hf-mirror.com
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

# Device defaults differ from start.bat on purpose: CTranslate2 (the engine behind
# faster-whisper) has CUDA and CPU backends only — there is no Metal/MPS backend, so an
# Apple Silicon Mac runs on CPU no matter what. Defaulting to cuda there would just make
# the model load blow up at import time. Linux keeps the cuda/float16 default.
if [[ "$(uname -s)" == "Darwin" ]]; then
  : "${WHISPER_DEVICE:=cpu}"
  : "${WHISPER_COMPUTE_TYPE:=int8}"
else
  : "${WHISPER_DEVICE:=cuda}"
  : "${WHISPER_COMPUTE_TYPE:=float16}"
fi
: "${WHISPER_MODEL:=medium}"
export WHISPER_MODEL WHISPER_DEVICE WHISPER_COMPUTE_TYPE

echo "[start] WHISPER_MODEL=$WHISPER_MODEL DEVICE=$WHISPER_DEVICE COMPUTE_TYPE=$WHISPER_COMPUTE_TYPE"
# Deliberately not switching to a smaller model automatically: model size changes
# transcription quality, and silently downgrading it would be a surprise. Say it instead.
if [[ "$WHISPER_DEVICE" == "cpu" && "$WHISPER_MODEL" != tiny && "$WHISPER_MODEL" != base && "$WHISPER_MODEL" != small ]]; then
  echo "[start] NOTE: running '$WHISPER_MODEL' on CPU is slow (README: ~30x vs GPU)."
  echo "[start]       If subtitle jobs crawl, try WHISPER_MODEL=small or base."
fi
echo "[start] uvicorn at http://127.0.0.1:9500"
exec python -m uvicorn server:app --host 127.0.0.1 --port 9500 --log-level info
