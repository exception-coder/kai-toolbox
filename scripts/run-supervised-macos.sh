#!/usr/bin/env bash
set -u

# kai-toolbox backend supervisor for macOS.
# Usage: bash scripts/run-supervised-macos.sh

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export KAI_SUPERVISED=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

MVN_CMD="${MVN_CMD:-mvn}"
PYTHON_CMD="${PYTHON_CMD:-}"
HTTP_HOST="${HTTP_HOST:-127.0.0.1}"
HTTP_PORT="${HTTP_PORT:-18081}"
BACKEND_PORT="${BACKEND_PORT:-18080}"
RESTART_TOKEN="${TOOLBOX_SYSTEM_RESTART_TOKEN:-zhangk2026}"
CONTROL_DIR="${TMPDIR:-/tmp}/kai-toolbox-supervisor"
RESTART_FILE="$CONTROL_DIR/restart.request"
STATUS_FILE="$CONTROL_DIR/status.json"
STARTER_JAR="$REPO_ROOT/toolbox-starter/target/kai-toolbox.jar"

if [[ -z "${TOOLBOX_ARIA2_BINARY:-}" ]]; then
  if [[ -x /opt/homebrew/bin/aria2c ]]; then
    TOOLBOX_ARIA2_BINARY=/opt/homebrew/bin/aria2c
  elif [[ -x /usr/local/bin/aria2c ]]; then
    TOOLBOX_ARIA2_BINARY=/usr/local/bin/aria2c
  else
    TOOLBOX_ARIA2_BINARY=aria2c
  fi
fi

TOOLBOX_QBT_PASSWORD="${TOOLBOX_QBT_PASSWORD:-KE5RWmYs4}"
TOOLBOX_HTTP_PROXY="${TOOLBOX_HTTP_PROXY:-http://127.0.0.1:7897}"
TOOLBOX_SYSTEM_RESTART_TOKEN="${TOOLBOX_SYSTEM_RESTART_TOKEN:-$RESTART_TOKEN}"
TOOLBOX_WHISPER_MODE="${TOOLBOX_WHISPER_MODE:-asr-service}"

mkdir -p "$CONTROL_DIR"
rm -f "$RESTART_FILE"

if [[ -z "$PYTHON_CMD" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD=python3
  elif command -v python >/dev/null 2>&1 && python -c 'import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)' >/dev/null 2>&1; then
    PYTHON_CMD=python
  else
    echo "[supervisor] python3 is required for HTTP control" >&2
    exit 1
  fi
fi

backend_pid=""
http_pid=""
last_start=""

quote_json() {
  "$PYTHON_CMD" -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"
}

write_status() {
  local up=false
  local pid_json=null
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    up=true
    pid_json="$backend_pid"
  fi
  cat > "$STATUS_FILE" <<EOF
{"backendUp":$up,"pid":$pid_json,"lastStart":$(quote_json "$last_start")}
EOF
}

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

stop_port_holders() {
  local port="$1"
  local pid
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    echo "[supervisor] takeover: stop process on :$port PID=$pid"
    kill_tree "$pid"
  done
  sleep 1
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    kill -KILL "$pid" 2>/dev/null || true
  done
}

start_backend() {
  stop_port_holders "$BACKEND_PORT"
  last_start="$(date '+%Y-%m-%dT%H:%M:%S')"
  echo "[supervisor] $(date '+%H:%M:%S') package and start backend..."
  (
    "$MVN_CMD" -pl toolbox-starter -am -Dskip.frontend=true package
    if [[ $? -ne 0 ]]; then
      exit 1
    fi
    exec java \
      "-DTOOLBOX_ARIA2_BINARY=$TOOLBOX_ARIA2_BINARY" \
      "-DTOOLBOX_QBT_PASSWORD=$TOOLBOX_QBT_PASSWORD" \
      "-DTOOLBOX_HTTP_PROXY=$TOOLBOX_HTTP_PROXY" \
      "-DTOOLBOX_SYSTEM_RESTART_TOKEN=$TOOLBOX_SYSTEM_RESTART_TOKEN" \
      -Dfile.encoding=UTF-8 \
      -Dstdout.encoding=UTF-8 \
      -Dstderr.encoding=UTF-8 \
      "-Dtoolbox.whisper.mode=$TOOLBOX_WHISPER_MODE" \
      -jar "$STARTER_JAR"
  ) &
  backend_pid=$!
  write_status
}

stop_backend() {
  if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
    kill_tree "$backend_pid"
    wait "$backend_pid" 2>/dev/null || true
  fi
  backend_pid=""
  write_status
}

start_http_control() {
  export SUPERVISOR_HTTP_HOST="$HTTP_HOST"
  export SUPERVISOR_HTTP_PORT="$HTTP_PORT"
  export SUPERVISOR_RESTART_TOKEN="$RESTART_TOKEN"
  export SUPERVISOR_RESTART_FILE="$RESTART_FILE"
  export SUPERVISOR_STATUS_FILE="$STATUS_FILE"
  "$PYTHON_CMD" - <<'PY' &
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

host = os.environ["SUPERVISOR_HTTP_HOST"]
port = int(os.environ["SUPERVISOR_HTTP_PORT"])
restart_token = os.environ["SUPERVISOR_RESTART_TOKEN"]
restart_file = os.environ["SUPERVISOR_RESTART_FILE"]
status_file = os.environ["SUPERVISOR_STATUS_FILE"]

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def send_json(self, code, obj):
        data = json.dumps(obj, separators=(",", ":")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Restart-Token, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_GET(self):
        if self.path != "/status":
            self.send_json(404, {"error": "not found"})
            return
        try:
            with open(status_file, "r", encoding="utf-8") as fh:
                self.send_json(200, json.load(fh))
        except FileNotFoundError:
            self.send_json(200, {"backendUp": False, "pid": None, "lastStart": None})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/restart":
            self.send_json(404, {"error": "not found"})
            return
        token = self.headers.get("X-Restart-Token") or parse_qs(parsed.query).get("token", [""])[0]
        if not restart_token:
            self.send_json(503, {"error": "RestartToken is not configured"})
            return
        if token != restart_token:
            self.send_json(403, {"error": "token mismatch"})
            return
        with open(restart_file, "w", encoding="utf-8") as fh:
            fh.write("restart\n")
        self.send_json(200, {"ok": True, "message": "restart triggered, backend will return soon"})

ThreadingHTTPServer((host, port), Handler).serve_forever()
PY
  http_pid=$!
}

cleanup() {
  stop_backend
  if [[ -n "$http_pid" ]]; then
    kill "$http_pid" 2>/dev/null || true
  fi
  rm -f "$RESTART_FILE"
}
trap cleanup EXIT INT TERM

write_status
start_http_control
echo "[supervisor] HTTP control http://$HTTP_HOST:$HTTP_PORT/  (POST /restart, GET /status)"
echo "[supervisor] repo=$REPO_ROOT  mvn=$MVN_CMD"

start_backend

while true; do
  if [[ -f "$RESTART_FILE" ]]; then
    rm -f "$RESTART_FILE"
    echo "[supervisor] $(date '+%H:%M:%S') /restart received, taking over port and restarting"
    stop_backend
    stop_port_holders "$BACKEND_PORT"
    start_backend
  elif [[ -z "$backend_pid" ]] || ! kill -0 "$backend_pid" 2>/dev/null; then
    echo "[supervisor] $(date '+%H:%M:%S') backend exited, restart after 2s"
    if [[ -n "$backend_pid" ]]; then
      wait "$backend_pid" 2>/dev/null || true
    fi
    backend_pid=""
    write_status
    sleep 2
    start_backend
  else
    write_status
  fi
  sleep 1
done
