#!/usr/bin/env bash
set -u

# Stop the macOS kai-toolbox supervisor through its verified bootstrap PID.
# The worker receives SIGTERM from the bootstrap and cleans up every process group it owns.
# A normal invocation stops the watchdog and then clears Forge's known local ports.

KEEP_STUDIO=0
PORTS_CSV=""
PORTS_SPECIFIED=0

usage() {
  cat <<'EOF'
Usage: bash scripts/stop-supervised-macos.sh [options]

Options:
  --ports CSV      Clean only these ports; does not stop a running supervisor/watchdog.
  --keep-studio    During a full stop, leave AgentScope Studio on port 3000 running.
  -h, --help       Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ports)
      if [[ $# -lt 2 ]]; then
        echo "[stop-supervisor] --ports requires a comma-separated value" >&2
        exit 2
      fi
      PORTS_CSV="$2"
      PORTS_SPECIFIED=1
      shift 2
      ;;
    --ports=*)
      PORTS_CSV="${1#*=}"
      PORTS_SPECIFIED=1
      shift
      ;;
    --keep-studio)
      KEEP_STUDIO=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[stop-supervisor] unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
SUPERVISOR_SCRIPT_PATH="$SCRIPT_DIR/run-supervised-macos.sh"

if command -v shasum >/dev/null 2>&1; then
  REPO_HASH="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | awk '{ print substr($1, 1, 16) }')"
elif command -v md5 >/dev/null 2>&1; then
  REPO_HASH="$(printf '%s' "$REPO_ROOT" | md5 | awk '{ print substr($NF, 1, 16) }')"
else
  REPO_HASH="$(printf '%s' "$REPO_ROOT" | cksum | awk '{ print $1 }')"
fi

if [[ -n "${XDG_STATE_HOME:-}" ]]; then
  STATE_ROOT="$XDG_STATE_HOME/kai-toolbox"
else
  STATE_ROOT="$HOME/Library/Application Support/kai-toolbox"
fi
LOCK_FILE="$STATE_ROOT/supervisor-$REPO_HASH.lock"
PID_FILE="$STATE_ROOT/supervisor-$REPO_HASH.pid"
STOP_REQUEST_FILE="$STATE_ROOT/supervisor-$REPO_HASH.stop-request"
STUDIO_OWNER_FILE="$STATE_ROOT/supervisor-$REPO_HASH.studio-owner"

read_owner_value() {
  local key="$1"
  local file="${2:-$PID_FILE}"
  [[ -f "$file" ]] || return 0
  sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -n 1
}

pid_is_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

pid_is_supervisor() {
  local pid="$1"
  local require_worker="${2:-0}"
  local command_line process_cwd
  pid_is_alive "$pid" || return 1
  command_line="$(ps -ww -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command_line" == *"$SUPERVISOR_SCRIPT_PATH"* ]] || return 1
  if command -v lsof >/dev/null 2>&1; then
    process_cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    [[ "$process_cwd" == "$REPO_ROOT" ]] || return 1
  fi
  if [[ "$require_worker" -eq 1 ]]; then
    [[ "$command_line" == *--worker* ]] || return 1
  fi
  return 0
}

kill_tree() {
  local target_pid="$1"
  local signal_name="${2:-TERM}"
  local child
  for child in $(pgrep -P "$target_pid" 2>/dev/null || true); do
    kill_tree "$child" "$signal_name"
  done
  kill -"$signal_name" "$target_pid" 2>/dev/null || true
}

verified_studio_pgid() {
  local recorded_nonce recorded_pgid
  recorded_nonce="$(read_owner_value nonce "$STUDIO_OWNER_FILE")"
  recorded_pgid="$(read_owner_value pgid "$STUDIO_OWNER_FILE")"
  [[ -n "$lock_nonce" && "$recorded_nonce" == "$lock_nonce" ]] || return 1
  [[ "$recorded_pgid" =~ ^[0-9]+$ ]] || return 1
  kill -0 -- "-$recorded_pgid" 2>/dev/null || return 1
  ps -axo pgid=,command= 2>/dev/null | awk -v expected="$recorded_pgid" '
    $1 == expected {
      line=tolower($0)
      if (line ~ /kai-toolbox-studio|as_studio|agentscope\/studio/) found=1
    }
    END { exit(found ? 0 : 1) }
  ' || return 1
  printf '%s' "$recorded_pgid"
}

signal_tree_except_group() {
  local target_pid="$1"
  local signal_name="$2"
  local preserved_pgid="$3"
  local child child_pgid
  for child in $(pgrep -P "$target_pid" 2>/dev/null || true); do
    child_pgid="$(ps -o pgid= -p "$child" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$child_pgid" != "$preserved_pgid" ]]; then
      signal_tree_except_group "$child" "$signal_name" "$preserved_pgid"
    fi
  done
  kill -"$signal_name" "$target_pid" 2>/dev/null || true
}

signal_verified_worker_tree() {
  local signal_name="${1:-TERM}"
  local studio_pgid
  if [[ "$KEEP_STUDIO" -eq 0 ]]; then
    kill_tree "$worker_pid" "$signal_name"
    return 0
  fi
  studio_pgid="$(verified_studio_pgid 2>/dev/null || true)"
  if [[ -n "$studio_pgid" ]]; then
    # Preserve only the explicitly owned Studio group. Other setsid services/builds
    # must still be interrupted before the worker can be reparented or force-killed.
    signal_tree_except_group "$worker_pid" "$signal_name" "$studio_pgid"
  else
    # An external Studio is outside this worker tree. Without a verified ownership
    # marker, preserving every setsid group would leak backend/build descendants.
    kill_tree "$worker_pid" "$signal_name"
  fi
}

bootstrap_pid="$(read_owner_value bootstrap_pid)"
worker_pid="$(read_owner_value worker_pid)"
owner_repo="$(read_owner_value repo)"
owner_script="$(read_owner_value script)"
owner_nonce="$(read_owner_value nonce)"
lock_nonce="$(read_owner_value nonce "$LOCK_FILE")"

if [[ "$PORTS_SPECIFIED" -eq 1 && -z "$PORTS_CSV" ]]; then
  echo "[stop-supervisor] --ports requires at least one port" >&2
  exit 2
fi

if [[ "$PORTS_SPECIFIED" -eq 0 && -f "$LOCK_FILE" && ! -f "$PID_FILE" ]]; then
  echo "[stop-supervisor] supervisor lock exists without a complete PID record; refusing unsafe signaling" >&2
  exit 1
fi

if [[ "$PORTS_SPECIFIED" -eq 0 && -f "$PID_FILE" ]]; then
  if [[ "$owner_repo" != "$REPO_ROOT" || "$owner_script" != "$SUPERVISOR_SCRIPT_PATH" ||
        -z "$owner_nonce" || "$owner_nonce" != "$lock_nonce" ]]; then
    echo "[stop-supervisor] PID/lock identity does not match this exact supervisor; refusing to signal it" >&2
    exit 1
  fi
fi

signalled=0
if [[ "$PORTS_SPECIFIED" -eq 0 ]] && pid_is_supervisor "$bootstrap_pid" 0; then
  if [[ "$KEEP_STUDIO" -eq 1 ]]; then
    printf 'keep-studio\n' > "$STOP_REQUEST_FILE.tmp.$$" && mv -f "$STOP_REQUEST_FILE.tmp.$$" "$STOP_REQUEST_FILE"
  else
    printf 'stop\n' > "$STOP_REQUEST_FILE.tmp.$$" && mv -f "$STOP_REQUEST_FILE.tmp.$$" "$STOP_REQUEST_FILE"
  fi
  echo "[stop-supervisor] stopping bootstrap PID=$bootstrap_pid"
  kill -TERM "$bootstrap_pid" 2>/dev/null || true
  signalled=1
elif [[ "$PORTS_SPECIFIED" -eq 0 ]] && pid_is_supervisor "$worker_pid" 1; then
  if [[ "$KEEP_STUDIO" -eq 1 ]]; then
    printf 'keep-studio\n' > "$STOP_REQUEST_FILE.tmp.$$" && mv -f "$STOP_REQUEST_FILE.tmp.$$" "$STOP_REQUEST_FILE"
  else
    printf 'stop\n' > "$STOP_REQUEST_FILE.tmp.$$" && mv -f "$STOP_REQUEST_FILE.tmp.$$" "$STOP_REQUEST_FILE"
  fi
  echo "[stop-supervisor] bootstrap is unavailable; stopping verified worker PID=$worker_pid"
  signal_verified_worker_tree TERM
  signalled=1
elif [[ "$PORTS_SPECIFIED" -eq 0 && -f "$PID_FILE" ]]; then
  echo "[stop-supervisor] no live process matches the recorded supervisor PID"
fi

if [[ "$signalled" -eq 1 ]]; then
  deadline=$(( $(date +%s) + 40 ))
  while { pid_is_alive "$bootstrap_pid" || pid_is_alive "$worker_pid"; } &&
        [[ "$(date +%s)" -lt "$deadline" ]]; do
    sleep 0.2
  done

  if pid_is_supervisor "$worker_pid" 1; then
    echo "[stop-supervisor] worker graceful shutdown timed out; killing its verified process tree" >&2
    # The worker may be blocked waiting for a foreground npm/build command, in which
    # case Bash defers its TERM trap. Kill descendants before their parent can be
    # reparented, otherwise they could keep mutating node_modules as orphans.
    signal_verified_worker_tree KILL
  fi
  if pid_is_supervisor "$bootstrap_pid" 0; then
    echo "[stop-supervisor] bootstrap graceful shutdown timed out; sending SIGKILL" >&2
    kill -KILL "$bootstrap_pid" 2>/dev/null || true
  fi
fi

# Do not delete stale lock/PID files here. A concurrently starting generation could
# replace them after our initial read. Normal shutdown lets the verified bootstrap
# release its own nonce; the next start performs serialized stale-owner recovery.

stop_port() {
  local port="$1"
  local holder
  command -v lsof >/dev/null 2>&1 || {
    echo "[stop-supervisor] lsof not found; cannot clean port $port" >&2
    return 0
  }
  for holder in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [[ "$holder" =~ ^[0-9]+$ ]] || continue
    [[ "$holder" == "$$" ]] && continue
    echo "[stop-supervisor] stop listener :$port PID=$holder"
    kill_tree "$holder" TERM
  done
  sleep 0.5
  for holder in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [[ "$holder" =~ ^[0-9]+$ ]] || continue
    [[ "$holder" == "$$" ]] && continue
    kill_tree "$holder" KILL
  done
}

if [[ "$PORTS_SPECIFIED" -eq 1 ]]; then
  IFS=',' read -r -a requested_ports <<< "$PORTS_CSV"
  if [[ "${#requested_ports[@]}" -eq 0 ]]; then
    echo "[stop-supervisor] --ports did not contain a port" >&2
    exit 2
  fi
  for port in "${requested_ports[@]}"; do
    port="${port#"${port%%[![:space:]]*}"}"
    port="${port%"${port##*[![:space:]]}"}"
    if [[ ! "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 ]] || [[ "$port" -gt 65535 ]]; then
      echo "[stop-supervisor] invalid port: $port" >&2
      exit 2
    fi
    stop_port "$port"
  done
else
  for port in 18081 18080 5173 18890 9600 9500 18092; do
    stop_port "$port"
  done
  if [[ "$KEEP_STUDIO" -eq 0 ]]; then
    stop_port 3000
  fi
fi

if [[ "$PORTS_SPECIFIED" -eq 1 ]]; then
  echo "[stop-supervisor] requested ports cleaned; an active supervisor may restart managed services"
elif [[ "$signalled" -eq 0 ]]; then
  echo "[stop-supervisor] no running supervisor found; known orphan ports were still cleaned"
else
  echo "[stop-supervisor] done"
fi
