#!/usr/bin/env bash
set -u

# kai-toolbox one-click supervisor for macOS (backend + frontend).
# Frees the target ports first (kills holders of 18080 / 5173 / 18081), then starts
# OUR backend (packaged jar on :18080) and frontend (Vite dev on :5173) together,
# supervising both and restarting whichever exits.
# Usage: bash scripts/run-supervised-macos.sh

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
export KAI_SUPERVISED=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── 工具路径解析：配置文件(run-tools.conf, 同目录) → 自动探测 → 交互式 → 写回 ──
TOOLS_CONF="$SCRIPT_DIR/run-tools.conf"

# 从 conf 读取某 KEY 的值（KEY=路径；# 注释、空行忽略）。无则输出空。
conf_get() {
  [[ -f "$TOOLS_CONF" ]] || return 0
  local line key
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"            # 去前导空白
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"               # 去尾空白
    key="${key#"${key%%[![:space:]]*}"}"               # 去前空白
    if [[ "$key" == "$1" ]]; then printf '%s' "${line#*=}"; return 0; fi
  done < "$TOOLS_CONF"
}

# upsert 一个 KEY=值 到 conf（不存在则创建文件带表头）。
conf_set() {
  local key="$1" val="$2" tmp
  if [[ ! -f "$TOOLS_CONF" ]]; then
    {
      echo '# kai-toolbox 本机工具路径配置（脚本自动维护，可手改）'
      echo '# 形如 KEY=路径；缺失或失效时脚本会交互式询问并写回这里。'
      echo '# 机器相关，建议不要提交到仓库。'
      echo ''
    } > "$TOOLS_CONF"
  fi
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$TOOLS_CONF" 2>/dev/null; then
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$val" '
      { t=$0; sub(/^[[:space:]]+/,"",t)
        if (t ~ /^#/ || t=="") { print; next }
        ep=index(t,"="); if(ep==0){ print; next }
        kk=substr(t,1,ep-1); sub(/[[:space:]]+$/,"",kk)
        if (kk==k) print k"="v; else print
      }' "$TOOLS_CONF" > "$tmp" && mv "$tmp" "$TOOLS_CONF"
  else
    printf '%s=%s\n' "$key" "$val" >> "$TOOLS_CONF"
  fi
  echo "[supervisor] 已写回 $(basename "$TOOLS_CONF")：$key=$val" >&2
}

# 把路径规整成真正的可执行文件：已是可执行文件→原样；是目录→在 <dir> 和 <dir>/bin 下
# 找 <name>（这样用户填 Maven 主目录也能自动定位到 bin/mvn）。找不到打印空。
resolve_exe() {
  local p="$1" name="$2" d c
  [[ -z "$p" ]] && return 0
  [[ -f "$p" && -x "$p" ]] && { printf '%s' "$p"; return 0; }
  if [[ -d "$p" ]]; then
    for d in "$p" "$p/bin"; do
      c="$d/$name"
      [[ -f "$c" && -x "$c" ]] && { printf '%s' "$c"; return 0; }
    done
  fi
  return 0
}

# resolve_tool <显示名> <KEY> <PATH命令名> [optional]
# 顺序：conf（文件或主目录都规整成 exe，命中写回）→ 环境变量/PATH → 可选则空 → 交互式（填入写回）。
# 路径打印到 stdout；用户放弃 return 1（调用方 `|| exit 1`）。
resolve_tool() {
  local display="$1" key="$2" onpath="$3" optional="${4:-}" v auto envval ans r
  v="$(conf_get "$key")"
  if [[ -n "$v" ]]; then
    r="$(resolve_exe "$v" "$onpath")"
    [[ -z "$r" ]] && command -v "$v" >/dev/null 2>&1 && r="$(command -v "$v")"
    if [[ -n "$r" ]]; then [[ "$r" != "$v" ]] && conf_set "$key" "$r"; printf '%s' "$r"; return 0; fi
    echo "[supervisor] 配置中的 $key 不是可用可执行文件，重新探测：$v" >&2
  fi
  eval "envval=\${$key:-}"
  auto=""
  if [[ -n "$envval" ]]; then
    r="$(resolve_exe "$envval" "$onpath")"
    [[ -z "$r" ]] && command -v "$envval" >/dev/null 2>&1 && r="$(command -v "$envval")"
    [[ -n "$r" ]] && auto="$r"
  fi
  [[ -z "$auto" ]] && command -v "$onpath" >/dev/null 2>&1 && auto="$(command -v "$onpath")"
  if [[ -n "$auto" ]]; then conf_set "$key" "$auto"; echo "$auto"; return 0; fi
  [[ "$optional" == optional ]] && return 0
  while true; do
    printf '\n[supervisor] 未找到必需的 %s。\n' "$display" >&2
    printf '[supervisor]   输入可执行文件或其所在主目录的完整路径；或加入 PATH 后直接回车重新探测；输入 q 退出（填入后写回 %s）: ' "$key" >&2
    read -r ans || return 1
    [[ "$ans" == q ]] && return 1
    if [[ -z "$ans" ]]; then
      if command -v "$onpath" >/dev/null 2>&1; then auto="$(command -v "$onpath")"; conf_set "$key" "$auto"; echo "$auto"; return 0; fi
      echo "[supervisor] 仍未探测到 $display。" >&2; continue
    fi
    r="$(resolve_exe "$ans" "$onpath")"
    [[ -z "$r" ]] && command -v "$ans" >/dev/null 2>&1 && r="$(command -v "$ans")"
    if [[ -n "$r" ]]; then conf_set "$key" "$r"; echo "$r"; return 0; fi
    echo "[supervisor] 没找到可执行文件（已试 $ans 及其 bin 下的 $onpath）: $ans" >&2
  done
}

MVN_CMD="$(resolve_tool 'Maven (mvn)' MVN_CMD mvn)" || { echo "[supervisor] 已取消启动。" >&2; exit 1; }
JAVA_CMD="$(resolve_tool 'Java (java)' JAVA_CMD java)" || { echo "[supervisor] 已取消启动。" >&2; exit 1; }
# Java 版本软提示：低于 17 仅警告（Spring Boot 3.4 需 17+，项目用 21）。
java_ver_line="$("$JAVA_CMD" -version 2>&1 | head -n1)"
if [[ "$java_ver_line" =~ \"1\.([0-9]+) ]]; then jmaj="${BASH_REMATCH[1]}"
elif [[ "$java_ver_line" =~ \"([0-9]+) ]]; then jmaj="${BASH_REMATCH[1]}"
else jmaj=0; fi
if [[ "$jmaj" -gt 0 && "$jmaj" -lt 17 ]]; then
  echo "[supervisor] 注意：当前 java 版本为 $jmaj，过低（需 17+，项目用 21）。可在 run-tools.conf 把 JAVA_CMD 指向 Java 21 再启动。" >&2
fi
# mvn 构建用 JAVA_HOME（不是上面解析的 java）。据 JAVA_CMD 反推并覆盖，避免用旧 JDK 编译 Java 21 项目。
case "$JAVA_CMD" in
  */bin/java) export JAVA_HOME="$(dirname "$(dirname "$JAVA_CMD")")"; echo "[supervisor] JAVA_HOME=$JAVA_HOME （供 mvn 构建使用 JDK 21）" >&2 ;;
esac
# npm：前端 dev 与 sidecar 初始化都要它；解析后把其目录前置进 PATH，让子进程也找得到。
NPM_BIN="$(resolve_tool 'npm' NPM_CMD npm)" || { echo "[supervisor] 已取消启动。" >&2; exit 1; }
case ":$PATH:" in *":$(dirname "$NPM_BIN"):"*) ;; *) PATH="$(dirname "$NPM_BIN"):$PATH"; export PATH ;; esac

PYTHON_CMD="${PYTHON_CMD:-}"
HTTP_HOST="${HTTP_HOST:-127.0.0.1}"
HTTP_PORT="${HTTP_PORT:-18081}"
BACKEND_PORT="${BACKEND_PORT:-18080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
RESTART_TOKEN="${TOOLBOX_SYSTEM_RESTART_TOKEN:-zhangk2026}"
CONTROL_DIR="${TMPDIR:-/tmp}/kai-toolbox-supervisor"
RESTART_FILE="$CONTROL_DIR/restart.request"
STATUS_FILE="$CONTROL_DIR/status.json"
STARTER_JAR="$REPO_ROOT/toolbox-starter/target/kai-toolbox.jar"

# aria2 可选：conf → PATH → homebrew 常见位置；找到就写回 conf。找不到不挡启动。
ARIA2_BIN="$(conf_get ARIA2_BIN)"
if [[ -z "$ARIA2_BIN" || ! -x "$ARIA2_BIN" ]]; then
  if command -v aria2c >/dev/null 2>&1; then ARIA2_BIN="$(command -v aria2c)"
  elif [[ -x /opt/homebrew/bin/aria2c ]]; then ARIA2_BIN=/opt/homebrew/bin/aria2c
  elif [[ -x /usr/local/bin/aria2c ]]; then ARIA2_BIN=/usr/local/bin/aria2c
  else ARIA2_BIN=""; fi
  [[ -n "$ARIA2_BIN" ]] && conf_set ARIA2_BIN "$ARIA2_BIN"
fi
TOOLBOX_ARIA2_BINARY="${TOOLBOX_ARIA2_BINARY:-${ARIA2_BIN:-aria2c}}"

TOOLBOX_QBT_PASSWORD="${TOOLBOX_QBT_PASSWORD:-KE5RWmYs4}"
TOOLBOX_HTTP_PROXY="${TOOLBOX_HTTP_PROXY:-http://127.0.0.1:7897}"
TOOLBOX_SYSTEM_RESTART_TOKEN="${TOOLBOX_SYSTEM_RESTART_TOKEN:-$RESTART_TOKEN}"
TOOLBOX_WHISPER_MODE="${TOOLBOX_WHISPER_MODE:-asr-service}"
# Playwright/patchright 浏览器内核下载走国内镜像（官方 CDN 在境内常被掐，导致自动装 Chromium 失败）。
export PLAYWRIGHT_DOWNLOAD_HOST="${PLAYWRIGHT_DOWNLOAD_HOST:-https://cdn.npmmirror.com/binaries/playwright}"
# npm install 走国内镜像（sidecar 依赖直连 registry.npmjs.org 境内常超时/失败）。已自定义则不覆盖。
export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"

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
frontend_pid=""
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
    exec "$JAVA_CMD" \
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

start_frontend() {
  stop_port_holders "$FRONTEND_PORT"
  echo "[supervisor] $(date '+%H:%M:%S') start frontend dev server (vite :$FRONTEND_PORT)..."
  (
    cd "$REPO_ROOT/frontend" || exit 1
    # First run installs deps; subsequent runs skip it. npm run dev = Vite on :5173 (proxies /api -> backend).
    if [[ ! -d node_modules ]]; then
      npm install --no-audit --no-fund
    fi
    exec npm run dev
  ) &
  frontend_pid=$!
}

stop_frontend() {
  if [[ -n "$frontend_pid" ]] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill_tree "$frontend_pid"
    wait "$frontend_pid" 2>/dev/null || true
  fi
  frontend_pid=""
}

# One-time, idempotent init of the two node sidecars the backend lazily spawns.
# The backend OWNS the processes (claude-chat: node dist/server.js; browser-request
# undetected-node engine: node server.js) — we only ensure their deps exist so those
# lazy spawns actually work. Already-built / already-installed => skip (no daily slowdown).
init_node_deps() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "[supervisor] npm not on PATH, skip node sidecar init (claude-chat / undetected-node engine will be unavailable)"
    return
  fi

  # 1) claude-agent sidecar (claude-chat) — needs dist/server.js (tsc build). Cheap, core feature.
  local sidecar="$REPO_ROOT/sidecar/claude-agent"
  if [[ ! -f "$sidecar/dist/server.js" ]]; then
    echo "[supervisor] init claude-agent sidecar (npm install + build)..."
    (
      cd "$sidecar" || exit 1
      [[ -d node_modules ]] || npm install --no-audit --no-fund
      npm run build
    ) || echo "[supervisor] WARN: claude-agent init failed; claude-chat may not start"
  else
    echo "[supervisor] claude-agent sidecar already built, skip"
  fi

  # 2) undetected-browser (browser-request undetected-node engine) — needs node_modules
  #    (patchright) + a patched chromium kernel. First run downloads ~150MB; then skipped.
  local undetected="$REPO_ROOT/node-services/undetected-browser"
  if [[ ! -d "$undetected/node_modules" ]]; then
    echo "[supervisor] init undetected-browser (npm install + install-browser, ~150MB chromium, first run only)..."
    (
      cd "$undetected" || exit 1
      npm install --no-audit --no-fund && npm run install-browser
    ) || echo "[supervisor] WARN: undetected-browser init failed; undetected-node engine unavailable"
  else
    echo "[supervisor] undetected-browser deps present, skip"
  fi
}

# Best-effort: start the visitor-analysis AgentScope sidecar (python-services/visitor-analysis).
# Isolated & non-fatal: first run builds .venv/pip (slow), then runs uvicorn on :9600 in background.
# Needs VA_LLM_API_KEY (else gray-zone classify returns UNKNOWN). Backend has its own retry/backoff.
start_visitor_analysis_sidecar() {
  local vaDir="$REPO_ROOT/python-services/visitor-analysis"
  if [[ ! -f "$vaDir/start.sh" ]]; then
    echo "[supervisor] visitor-analysis start.sh missing, skip"
    return
  fi
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:9600 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[supervisor] visitor-analysis sidecar already on :9600, skip"
    return
  fi
  echo "[supervisor] start visitor-analysis sidecar (background, first run installs venv, slow)..."
  ( cd "$vaDir" && PYTHON_CMD="$PYTHON_CMD" nohup bash start.sh >/dev/null 2>&1 & ) \
    || echo "[supervisor] WARN: visitor-analysis sidecar failed to start (non-fatal)"
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
  # Ctrl+C / exit: bring both children down so ports are released.
  stop_frontend
  stop_backend
  if [[ -n "$http_pid" ]]; then
    kill "$http_pid" 2>/dev/null || true
  fi
  rm -f "$RESTART_FILE"
}
trap cleanup EXIT INT TERM

write_status
# Take over a stale supervisor still holding the control port before binding our own.
stop_port_holders "$HTTP_PORT"
start_http_control
echo "[supervisor] HTTP control http://$HTTP_HOST:$HTTP_PORT/  (POST /restart, GET /status)"
echo "[supervisor] repo=$REPO_ROOT  mvn=$MVN_CMD"

# Ensure the node sidecars are initialized before the backend may lazily spawn them.
init_node_deps

# Best-effort: bring up the visitor-analysis AgentScope sidecar (:9600), non-fatal.
start_visitor_analysis_sidecar

# One-click start: backend + frontend together.
start_backend
start_frontend

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
  elif [[ -z "$frontend_pid" ]] || ! kill -0 "$frontend_pid" 2>/dev/null; then
    echo "[supervisor] $(date '+%H:%M:%S') frontend exited, restart after 2s"
    if [[ -n "$frontend_pid" ]]; then
      wait "$frontend_pid" 2>/dev/null || true
    fi
    frontend_pid=""
    sleep 2
    start_frontend
  else
    write_status
  fi
  sleep 1
done
