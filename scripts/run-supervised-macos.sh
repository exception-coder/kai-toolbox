#!/usr/bin/env bash
set -u

# kai-toolbox one-click supervisor for macOS.
#
# The public process is a stable bootstrap. It owns the terminal and the per-repository
# instance lock, while an internal worker owns backend/frontend/sidecar processes. Java
# owns Git polling; after Java requests a full reload, the worker exits with code 75 and
# the bootstrap loads this file again from the updated checkout.
#
# Usage:
#   bash scripts/run-supervised-macos.sh
#   bash scripts/run-supervised-macos.sh --auto-update
#   bash scripts/run-supervised-macos.sh --auto-update --auto-update-interval-seconds 120

umask 077

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
cd "$REPO_ROOT"
AUTO_UPDATE_RELAUNCH_EXIT_CODE=75

ORIGINAL_ARGS=("$@")
SUPERVISOR_WORKER=0
AUTO_UPDATE_CLI=0
AUTO_UPDATE_INTERVAL_CLI=""
SHOW_HELP=0

usage() {
  cat <<'EOF'
Usage: bash scripts/run-supervised-macos.sh [options]

Options:
  --auto-update                       Enable the Java auto-update scheduler.
  --auto-update-interval-seconds N    Java poll interval, 30..3600 seconds (default 120).
  -h, --help                          Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto-update)
      AUTO_UPDATE_CLI=1
      shift
      ;;
    --auto-update-interval-seconds)
      if [[ $# -lt 2 ]]; then
        echo "[supervisor] --auto-update-interval-seconds requires a value" >&2
        exit 2
      fi
      AUTO_UPDATE_INTERVAL_CLI="$2"
      shift 2
      ;;
    --auto-update-interval-seconds=*)
      AUTO_UPDATE_INTERVAL_CLI="${1#*=}"
      shift
      ;;
    --worker)
      SUPERVISOR_WORKER=1
      shift
      ;;
    -h|--help)
      SHOW_HELP=1
      shift
      ;;
    *)
      echo "[supervisor] unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$SHOW_HELP" -eq 1 ]]; then
  usage
  exit 0
fi

if [[ -n "$AUTO_UPDATE_INTERVAL_CLI" ]]; then
  if [[ ! "$AUTO_UPDATE_INTERVAL_CLI" =~ ^[0-9]+$ ]] ||
     [[ "$AUTO_UPDATE_INTERVAL_CLI" -lt 30 ]] || [[ "$AUTO_UPDATE_INTERVAL_CLI" -gt 3600 ]]; then
    echo "[supervisor] auto-update interval must be an integer in 30..3600" >&2
    exit 2
  fi
fi

# Re-exec the public bootstrap once through its canonical absolute path. Besides making
# launchd/manual starts behave identically, this lets stop/duplicate-instance checks
# validate the exact script path instead of trusting a reused PID with the same basename.
if [[ "$SUPERVISOR_WORKER" -eq 0 && "${KAI_SUPERVISOR_CANONICALIZED:-}" != "1" ]]; then
  export KAI_SUPERVISOR_CANONICALIZED=1
  exec /bin/bash "$SCRIPT_PATH" "${ORIGINAL_ARGS[@]}"
fi

if command -v shasum >/dev/null 2>&1; then
  REPO_HASH="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | awk '{ print substr($1, 1, 16) }')"
elif command -v md5 >/dev/null 2>&1; then
  REPO_HASH="$(printf '%s' "$REPO_ROOT" | md5 | awk '{ print substr($NF, 1, 16) }')"
else
  REPO_HASH="$(printf '%s' "$REPO_ROOT" | cksum | awk '{ print $1 }')"
fi

if [[ -n "${XDG_STATE_HOME:-}" ]]; then
  SUPERVISOR_STATE_ROOT="$XDG_STATE_HOME/kai-toolbox"
else
  SUPERVISOR_STATE_ROOT="$HOME/Library/Application Support/kai-toolbox"
fi
LOCK_FILE="$SUPERVISOR_STATE_ROOT/supervisor-$REPO_HASH.lock"
LOCK_RECOVERY_FILE="$SUPERVISOR_STATE_ROOT/supervisor-$REPO_HASH.recover"
PID_FILE="$SUPERVISOR_STATE_ROOT/supervisor-$REPO_HASH.pid"
STOP_REQUEST_FILE="$SUPERVISOR_STATE_ROOT/supervisor-$REPO_HASH.stop-request"
STUDIO_OWNER_FILE="$SUPERVISOR_STATE_ROOT/supervisor-$REPO_HASH.studio-owner"

read_owner_value() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -n 1
}

process_command() {
  local pid="$1"
  ps -ww -p "$pid" -o command= 2>/dev/null || true
}

bootstrap_owner_is_alive() {
  local owner_pid owner_repo owner_script owner_nonce owner_command owner_cwd
  owner_pid="$(read_owner_value bootstrap_pid "$LOCK_FILE")"
  owner_repo="$(read_owner_value repo "$LOCK_FILE")"
  owner_script="$(read_owner_value script "$LOCK_FILE")"
  owner_nonce="$(read_owner_value nonce "$LOCK_FILE")"
  [[ "$owner_pid" =~ ^[0-9]+$ ]] || return 1
  [[ "$owner_repo" == "$REPO_ROOT" ]] || return 1
  [[ "$owner_script" == "$SCRIPT_PATH" ]] || return 1
  [[ -n "$owner_nonce" ]] || return 1
  kill -0 "$owner_pid" 2>/dev/null || return 1
  owner_command="$(process_command "$owner_pid")"
  [[ "$owner_command" == *"$SCRIPT_PATH"* ]] || return 1
  if command -v lsof >/dev/null 2>&1; then
    owner_cwd="$(lsof -a -p "$owner_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    [[ "$owner_cwd" == "$REPO_ROOT" ]] || return 1
  fi
  return 0
}

BOOTSTRAP_NONCE=""
BOOTSTRAP_WORKER_PID=""
RECOVERY_NONCE=""

write_owner_file() {
  local destination="$1"
  local worker_pid_value="$2"
  {
    printf 'bootstrap_pid=%s\n' "$$"
    printf 'worker_pid=%s\n' "$worker_pid_value"
    printf 'repo=%s\n' "$REPO_ROOT"
    printf 'script=%s\n' "$SCRIPT_PATH"
    printf 'nonce=%s\n' "$BOOTSTRAP_NONCE"
  } > "$destination"
}

write_bootstrap_owner() {
  local tmp="$PID_FILE.tmp.$$"
  write_owner_file "$tmp" "$BOOTSTRAP_WORKER_PID"
  mv -f "$tmp" "$PID_FILE"
}

acquire_recovery_lock() {
  local owner_tmp
  RECOVERY_NONCE="$$-$(date +%s)-${RANDOM:-0}"
  owner_tmp="$SUPERVISOR_STATE_ROOT/.supervisor-$REPO_HASH.recover.$$-${RANDOM:-0}"
  {
    printf 'recovery_pid=%s\n' "$$"
    printf 'started_epoch=%s\n' "$(date +%s)"
    printf 'nonce=%s\n' "$RECOVERY_NONCE"
  } > "$owner_tmp"
  # Publish only a complete owner record; owner-less recovery locks are never inferred
  # stale from time because SIGSTOP/scheduler stalls make age an unsafe liveness signal.
  if ln "$owner_tmp" "$LOCK_RECOVERY_FILE" 2>/dev/null; then
    rm -f "$owner_tmp"
    return 0
  fi
  rm -f "$owner_tmp"
  # There is no portable compare-and-unlink primitive in Bash. Never infer an
  # existing recovery owner stale: doing so creates an ABA race that can remove a
  # newly acquired lock. A crash in this millisecond-scale section therefore fails
  # closed and requires explicit operator inspection/removal.
  return 1
}

release_recovery_lock() {
  local recorded_nonce
  recorded_nonce="$(read_owner_value nonce "$LOCK_RECOVERY_FILE")"
  if [[ -n "$RECOVERY_NONCE" && "$recorded_nonce" == "$RECOVERY_NONCE" ]]; then
    rm -f "$LOCK_RECOVERY_FILE" 2>/dev/null || true
  fi
  RECOVERY_NONCE=""
}

acquire_bootstrap_lock() {
  local owner_temp stale_lock_nonce stale_pid_nonce stale_worker_pid existing_owner_pid
  mkdir -p "$SUPERVISOR_STATE_ROOT"
  BOOTSTRAP_NONCE="$$-$(date +%s)-${RANDOM:-0}"
  owner_temp="$SUPERVISOR_STATE_ROOT/.supervisor-$REPO_HASH.owner.$$-${RANDOM:-0}"
  write_owner_file "$owner_temp" ""

  # Linking a complete owner file is an atomic create-if-absent operation on APFS/HFS+.
  # Unlike mkdir-then-write, there is no window where another process can observe an
  # empty lock and incorrectly reclaim a live startup.
  if ln "$owner_temp" "$LOCK_FILE" 2>/dev/null; then
    mv -f "$owner_temp" "$PID_FILE"
    return 0
  fi
  rm -f "$owner_temp"

  if bootstrap_owner_is_alive; then
    echo "[supervisor] this repository already has a running supervisor: $REPO_ROOT"
    return 10
  fi

  # Serialize stale-lock reclamation. A normal contender can still win the subsequent
  # atomic link, but it cannot be deleted by another stale reclaimer.
  if ! acquire_recovery_lock; then
    echo "[supervisor] another process is checking the supervisor lock; retry shortly" >&2
    echo "[supervisor] if this persists, verify no recorded recovery PID is alive before inspecting: $LOCK_RECOVERY_FILE" >&2
    return 1
  fi
  if bootstrap_owner_is_alive; then
    release_recovery_lock
    echo "[supervisor] this repository already has a running supervisor: $REPO_ROOT"
    return 10
  fi
  # A live PID with mismatched command/cwd/metadata is uncertain identity, not proof of
  # staleness. Only a syntactically valid owner PID that kill -0 confirms dead may be reclaimed.
  existing_owner_pid="$(read_owner_value bootstrap_pid "$LOCK_FILE")"
  if [[ ! "$existing_owner_pid" =~ ^[0-9]+$ ]] || kill -0 "$existing_owner_pid" 2>/dev/null; then
    release_recovery_lock
    echo "[supervisor] lock owner identity is incomplete or uncertain; refusing automatic takeover" >&2
    return 1
  fi
  stale_lock_nonce="$(read_owner_value nonce "$LOCK_FILE")"
  if [[ -z "$stale_lock_nonce" ]]; then
    release_recovery_lock
    echo "[supervisor] lock owner is incomplete; refusing unsafe automatic recovery: $LOCK_FILE" >&2
    return 1
  fi
  stale_pid_nonce="$(read_owner_value nonce "$PID_FILE")"
  if [[ -f "$PID_FILE" && "$stale_pid_nonce" != "$stale_lock_nonce" ]]; then
    release_recovery_lock
    echo "[supervisor] PID record does not match the stale lock; refusing unsafe automatic takeover" >&2
    return 1
  fi
  if [[ "$stale_pid_nonce" == "$stale_lock_nonce" ]]; then
    stale_worker_pid="$(read_owner_value worker_pid "$PID_FILE")"
    if [[ -n "$stale_worker_pid" && ! "$stale_worker_pid" =~ ^[0-9]+$ ]]; then
      release_recovery_lock
      echo "[supervisor] stale worker identity is malformed; refusing unsafe automatic takeover" >&2
      return 1
    fi
    if [[ "$stale_worker_pid" =~ ^[0-9]+$ ]] && kill -0 "$stale_worker_pid" 2>/dev/null; then
      # A worker cannot enter initialization until this exact PID is published. If it
      # is still alive, it may own an npm/build operation even though bootstrap died.
      release_recovery_lock
      echo "[supervisor] previous worker PID=$stale_worker_pid is still alive; refusing concurrent startup" >&2
      return 1
    fi
    rm -f "$PID_FILE" 2>/dev/null || true
  fi
  # The recovery directory serializes every stale remover. Fresh acquisition remains
  # an atomic hard-link race; if another process wins, our link below simply fails.
  if [[ "$(read_owner_value nonce "$LOCK_FILE")" == "$stale_lock_nonce" ]]; then
    rm -f "$LOCK_FILE" 2>/dev/null || true
  fi

  owner_temp="$SUPERVISOR_STATE_ROOT/.supervisor-$REPO_HASH.owner.$$-${RANDOM:-0}"
  write_owner_file "$owner_temp" ""
  if ln "$owner_temp" "$LOCK_FILE" 2>/dev/null; then
    mv -f "$owner_temp" "$PID_FILE"
    release_recovery_lock
    return 0
  fi
  rm -f "$owner_temp"
  release_recovery_lock
  if bootstrap_owner_is_alive; then
    echo "[supervisor] another supervisor acquired the instance lock"
    return 10
  fi
  echo "[supervisor] instance lock changed but no verified owner is visible; refusing startup" >&2
  return 1
}

release_bootstrap_lock() {
  local current_nonce recorded_nonce pid_nonce
  current_nonce="$BOOTSTRAP_NONCE"
  recorded_nonce="$(read_owner_value nonce "$LOCK_FILE")"
  if [[ -n "$current_nonce" && "$recorded_nonce" == "$current_nonce" ]]; then
    # Remove the mutable PID record before releasing the exclusion lock, so a new
    # owner can never have its freshly written PID file deleted by this generation.
    pid_nonce="$(read_owner_value nonce "$PID_FILE")"
    [[ "$pid_nonce" == "$current_nonce" ]] && rm -f "$PID_FILE" 2>/dev/null || true
    rm -f "$LOCK_FILE" 2>/dev/null || true
  fi
  if [[ -n "$current_nonce" && "$(read_owner_value nonce "$STUDIO_OWNER_FILE")" == "$current_nonce" ]]; then
    # A Studio preserved after a full bootstrap stop becomes intentionally external;
    # do not leave an ownership record that a future nonce could misinterpret.
    rm -f "$STUDIO_OWNER_FILE" 2>/dev/null || true
  fi
  rm -f "$STOP_REQUEST_FILE" 2>/dev/null || true
}

signal_process_tree() {
  local target_pid="$1"
  local signal_name="$2"
  local child
  for child in $(pgrep -P "$target_pid" 2>/dev/null || true); do
    signal_process_tree "$child" "$signal_name"
  done
  kill -"$signal_name" "$target_pid" 2>/dev/null || true
}

verified_studio_pgid() {
  local recorded_nonce recorded_pgid
  recorded_nonce="$(read_owner_value nonce "$STUDIO_OWNER_FILE")"
  recorded_pgid="$(read_owner_value pgid "$STUDIO_OWNER_FILE")"
  [[ -n "$BOOTSTRAP_NONCE" && "$recorded_nonce" == "$BOOTSTRAP_NONCE" ]] || return 1
  [[ "$recorded_pgid" =~ ^[0-9]+$ ]] || return 1
  kill -0 -- "-$recorded_pgid" 2>/dev/null || return 1
  # The marker is only trusted while the group still contains AgentScope's command.
  # This prevents a stale file from preserving an unrelated group after PGID reuse.
  ps -axo pgid=,command= 2>/dev/null | awk -v expected="$recorded_pgid" '
    $1 == expected {
      line=tolower($0)
      if (line ~ /kai-toolbox-studio|as_studio|agentscope\/studio/) found=1
    }
    END { exit(found ? 0 : 1) }
  ' || return 1
  printf '%s' "$recorded_pgid"
}

signal_process_tree_except_group() {
  local target_pid="$1"
  local signal_name="$2"
  local preserved_pgid="$3"
  local child child_pgid
  for child in $(pgrep -P "$target_pid" 2>/dev/null || true); do
    child_pgid="$(ps -o pgid= -p "$child" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$child_pgid" != "$preserved_pgid" ]]; then
      signal_process_tree_except_group "$child" "$signal_name" "$preserved_pgid"
    fi
  done
  kill -"$signal_name" "$target_pid" 2>/dev/null || true
}

run_bootstrap() {
  local stop_requested=0
  local signal_exit=0
  local worker_rc=0
  local lock_rc=0

  acquire_bootstrap_lock
  lock_rc=$?
  if [[ "$lock_rc" -eq 10 ]]; then
    return 0
  elif [[ "$lock_rc" -ne 0 ]]; then
    return "$lock_rc"
  fi
  rm -f "$STOP_REQUEST_FILE" 2>/dev/null || true

  forward_bootstrap_signal() {
    local signal_name="$1"
    local stop_mode studio_pgid
    stop_requested=1
    case "$signal_name" in
      INT) signal_exit=130 ;;
      HUP) signal_exit=129 ;;
      *) signal_exit=143 ;;
    esac
    if [[ -n "$BOOTSTRAP_WORKER_PID" ]] && kill -0 "$BOOTSTRAP_WORKER_PID" 2>/dev/null; then
      stop_mode="$(cat "$STOP_REQUEST_FILE" 2>/dev/null || true)"
      if [[ "$stop_mode" == "keep-studio" ]]; then
        studio_pgid="$(verified_studio_pgid 2>/dev/null || true)"
        if [[ -n "$studio_pgid" ]]; then
          # Interrupt every descendant, including independently sessioned builds and
          # services, while preserving only the explicitly recorded Studio PGID.
          signal_process_tree_except_group "$BOOTSTRAP_WORKER_PID" TERM "$studio_pgid"
        else
          # An externally started Studio is not our descendant. Without a verified
          # owned Studio marker, retaining every process group would leak other work.
          signal_process_tree "$BOOTSTRAP_WORKER_PID" TERM
        fi
      else
        signal_process_tree "$BOOTSTRAP_WORKER_PID" TERM
      fi
    fi
  }

  trap 'forward_bootstrap_signal INT' INT
  trap 'forward_bootstrap_signal TERM' TERM
  trap 'forward_bootstrap_signal HUP' HUP
  trap release_bootstrap_lock EXIT

  while [[ "$stop_requested" -eq 0 ]]; do
    KAI_SUPERVISOR_BOOTSTRAP_PID="$$" \
    KAI_SUPERVISOR_BOOTSTRAP_NONCE="$BOOTSTRAP_NONCE" \
      /bin/bash "$SCRIPT_PATH" --worker "${ORIGINAL_ARGS[@]}" <&0 &
    BOOTSTRAP_WORKER_PID=$!
    write_bootstrap_owner

    while true; do
      wait "$BOOTSTRAP_WORKER_PID"
      worker_rc=$?
      if kill -0 "$BOOTSTRAP_WORKER_PID" 2>/dev/null; then
        continue
      fi
      break
    done
    BOOTSTRAP_WORKER_PID=""
    write_bootstrap_owner

    if [[ "$stop_requested" -ne 0 ]]; then
      break
    fi
    if [[ "$worker_rc" -eq "$AUTO_UPDATE_RELAUNCH_EXIT_CODE" ]]; then
      echo "[supervisor-bootstrap] cloud update applied; loading the latest supervisor..."
      continue
    fi
    trap - EXIT INT TERM HUP
    release_bootstrap_lock
    return "$worker_rc"
  done

  trap - EXIT INT TERM HUP
  release_bootstrap_lock
  return "$signal_exit"
}

if [[ "$SUPERVISOR_WORKER" -eq 0 ]]; then
  run_bootstrap
  exit $?
fi

BOOTSTRAP_PID="${KAI_SUPERVISOR_BOOTSTRAP_PID:-}"
BOOTSTRAP_NONCE="${KAI_SUPERVISOR_BOOTSTRAP_NONCE:-}"
worker_registration_deadline=$(( $(date +%s) + 5 ))
while [[ "$(read_owner_value worker_pid "$PID_FILE")" != "$$" ]] &&
      bootstrap_owner_is_alive && [[ "$(date +%s)" -lt "$worker_registration_deadline" ]]; do
  sleep 0.05
done
if [[ ! "$BOOTSTRAP_PID" =~ ^[0-9]+$ ]] || ! kill -0 "$BOOTSTRAP_PID" 2>/dev/null ||
   [[ "$(read_owner_value bootstrap_pid "$LOCK_FILE")" != "$BOOTSTRAP_PID" ]] ||
   [[ "$(read_owner_value repo "$LOCK_FILE")" != "$REPO_ROOT" ]] ||
   [[ "$(read_owner_value script "$LOCK_FILE")" != "$SCRIPT_PATH" ]] ||
   [[ "$(read_owner_value nonce "$LOCK_FILE")" != "$BOOTSTRAP_NONCE" ]] ||
   [[ "$(read_owner_value worker_pid "$PID_FILE")" != "$$" ]] ||
   [[ "$(read_owner_value nonce "$PID_FILE")" != "$BOOTSTRAP_NONCE" ]] ||
   ! bootstrap_owner_is_alive; then
  echo "[supervisor-worker] a live bootstrap and matching instance lock are required" >&2
  exit 1
fi
unset KAI_SUPERVISOR_BOOTSTRAP_PID KAI_SUPERVISOR_BOOTSTRAP_NONCE KAI_SUPERVISOR_CANONICALIZED

export KAI_SUPERVISED=1
cd "$REPO_ROOT"

TOOLS_CONF="$SCRIPT_DIR/run-tools.conf"
if [[ -f "$TOOLS_CONF" ]] && ! chmod 600 "$TOOLS_CONF" 2>/dev/null; then
  echo "[supervisor] WARN: unable to restrict run-tools.conf permissions to owner-only" >&2
fi

trim_text() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

load_tools_conf() {
  [[ -f "$TOOLS_CONF" ]] || return 0
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="$(trim_text "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" || "$line" != *=* ]] && continue
    key="$(trim_text "${line%%=*}")"
    value="$(trim_text "${line#*=}")"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if ! printenv "$key" >/dev/null 2>&1; then
      export "$key=$value"
    fi
  done < "$TOOLS_CONF"
}

conf_set() {
  local key="$1"
  local value="$2"
  local tmp
  if [[ ! -f "$TOOLS_CONF" ]]; then
    {
      echo '# kai-toolbox local tool configuration (not committed)'
      echo '# KEY=path; this file is ignored by Git.'
      echo
    } > "$TOOLS_CONF"
  fi
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$TOOLS_CONF" 2>/dev/null; then
    tmp="$(mktemp "${TMPDIR:-/tmp}/kai-tools.XXXXXX")" || return 1
    awk -v k="$key" -v v="$value" '
      {
        t=$0
        sub(/^[[:space:]]+/, "", t)
        if (t ~ /^#/ || t == "") { print; next }
        ep=index(t, "=")
        if (ep == 0) { print; next }
        kk=substr(t, 1, ep - 1)
        sub(/[[:space:]]+$/, "", kk)
        if (kk == k) print k "=" v; else print
      }
    ' "$TOOLS_CONF" > "$tmp" && mv -f "$tmp" "$TOOLS_CONF"
  else
    printf '%s=%s\n' "$key" "$value" >> "$TOOLS_CONF"
  fi
  echo "[supervisor] saved local tool path: $key=$value" >&2
}

resolve_exe() {
  local configured="$1"
  local command_name="$2"
  local candidate
  [[ -z "$configured" ]] && return 0
  if [[ -f "$configured" && -x "$configured" ]]; then
    printf '%s' "$configured"
    return 0
  fi
  if [[ -d "$configured" ]]; then
    for candidate in "$configured/$command_name" "$configured/bin/$command_name"; do
      if [[ -f "$candidate" && -x "$candidate" ]]; then
        printf '%s' "$candidate"
        return 0
      fi
    done
  fi
  if command -v "$configured" >/dev/null 2>&1; then
    command -v "$configured"
  fi
}

resolve_tool() {
  local display="$1"
  local key="$2"
  local command_name="$3"
  local optional="${4:-}"
  local configured resolved answer

  configured="$(printenv "$key" 2>/dev/null || true)"
  resolved="$(resolve_exe "$configured" "$command_name")"
  if [[ -n "$resolved" ]]; then
    printf '%s' "$resolved"
    return 0
  fi
  if [[ -n "$configured" ]]; then
    echo "[supervisor] configured $key is unavailable: $configured" >&2
  fi
  if command -v "$command_name" >/dev/null 2>&1; then
    resolved="$(command -v "$command_name")"
    conf_set "$key" "$resolved"
    printf '%s' "$resolved"
    return 0
  fi
  [[ "$optional" == "optional" ]] && return 0

  if [[ ! -t 0 ]]; then
    echo "[supervisor] $display not found in non-interactive mode; configure $key in scripts/run-tools.conf" >&2
    return 1
  fi
  while true; do
    printf '\n[supervisor] required tool not found: %s\n' "$display" >&2
    printf '[supervisor] enter executable/home path, press Enter to retry PATH, or q to quit: ' >&2
    read -r answer || return 1
    [[ "$answer" == "q" ]] && return 1
    if [[ -z "$answer" ]]; then
      if command -v "$command_name" >/dev/null 2>&1; then
        resolved="$(command -v "$command_name")"
      fi
    else
      resolved="$(resolve_exe "$answer" "$command_name")"
    fi
    if [[ -n "${resolved:-}" ]]; then
      conf_set "$key" "$resolved"
      printf '%s' "$resolved"
      return 0
    fi
    echo "[supervisor] executable not found at: ${answer:-PATH}" >&2
  done
}

config_boolean() {
  local value default_value normalized
  value="$1"
  default_value="$2"
  [[ -z "$value" ]] && { printf '%s' "$default_value"; return; }
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    1|true|yes|on) printf '1' ;;
    0|false|no|off) printf '0' ;;
    *) printf '%s' "$default_value" ;;
  esac
}

bounded_integer() {
  local value="$1" default_value="$2" minimum="$3" maximum="$4"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    printf '%s' "$default_value"
  elif [[ "$value" -lt "$minimum" ]]; then
    printf '%s' "$minimum"
  elif [[ "$value" -gt "$maximum" ]]; then
    printf '%s' "$maximum"
  else
    printf '%s' "$value"
  fi
}

load_tools_conf

MVN_CMD="$(resolve_tool 'Maven (mvn)' MVN_CMD mvn)" || exit 1
JAVA_CMD="$(resolve_tool 'Java 21 (java)' JAVA_CMD java)" || exit 1
NPM_BIN="$(resolve_tool 'npm' NPM_CMD npm)" || exit 1
PYTHON_CMD="$(resolve_tool 'Python 3' PYTHON_CMD python3)" || exit 1
# Command substitution resolves these into shell variables. Export the canonical paths
# explicitly so the child Java updater can reuse the exact tools rather than relying on
# the narrower PATH commonly seen under launchd.
export MVN_CMD JAVA_CMD PYTHON_CMD
export NPM_CMD="$NPM_BIN"
if [[ -z "${GIT_CMD:-}" ]]; then
  GIT_CMD="$(command -v git 2>/dev/null || true)"
fi
export GIT_CMD="${GIT_CMD:-git}"

java_version_line="$("$JAVA_CMD" -version 2>&1 | head -n 1)"
if [[ "$java_version_line" =~ \"1\.([0-9]+) ]]; then
  java_major="${BASH_REMATCH[1]}"
elif [[ "$java_version_line" =~ \"([0-9]+) ]]; then
  java_major="${BASH_REMATCH[1]}"
else
  java_major=0
fi
if [[ "$java_major" -gt 0 && "$java_major" -lt 21 ]]; then
  echo "[supervisor] WARN: Java $java_major detected; this project requires Java 21" >&2
fi
resolved_java_home="$("$JAVA_CMD" -XshowSettings:properties -version 2>&1 |
  sed -n 's/^[[:space:]]*java\.home = //p' | head -n 1)"
if [[ -z "$resolved_java_home" || ! -d "$resolved_java_home" ]] && [[ -x /usr/libexec/java_home ]]; then
  resolved_java_home="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
fi
if [[ -n "$resolved_java_home" && -d "$resolved_java_home" ]]; then
  export JAVA_HOME="$resolved_java_home"
else
  echo "[supervisor] WARN: unable to resolve JAVA_HOME from JAVA_CMD" >&2
fi
case ":$PATH:" in
  *":$(dirname "$NPM_BIN"):"*) ;;
  *) export PATH="$(dirname "$NPM_BIN"):$PATH" ;;
esac

JAVA_AUTO_UPDATE_ENABLED="$AUTO_UPDATE_CLI"
if [[ "$JAVA_AUTO_UPDATE_ENABLED" -eq 0 ]]; then
  JAVA_AUTO_UPDATE_ENABLED="$(config_boolean "${TOOLBOX_AUTO_UPDATE_ENABLED:-}" 1)"
fi
if [[ "$AUTO_UPDATE_CLI" -eq 1 ]]; then
  export TOOLBOX_AUTO_UPDATE_ENABLED=true
elif [[ -z "${TOOLBOX_AUTO_UPDATE_ENABLED:-}" ]]; then
  if [[ "$JAVA_AUTO_UPDATE_ENABLED" -eq 1 ]]; then
    export TOOLBOX_AUTO_UPDATE_ENABLED=true
  else
    export TOOLBOX_AUTO_UPDATE_ENABLED=false
  fi
fi
if [[ -n "$AUTO_UPDATE_INTERVAL_CLI" ]]; then
  AUTO_UPDATE_INTERVAL_SECONDS="$AUTO_UPDATE_INTERVAL_CLI"
  export TOOLBOX_AUTO_UPDATE_INTERVAL_SECONDS="$AUTO_UPDATE_INTERVAL_CLI"
else
  AUTO_UPDATE_INTERVAL_SECONDS="$(bounded_integer "${TOOLBOX_AUTO_UPDATE_INTERVAL_SECONDS:-}" 120 30 3600)"
fi
AUTO_UPDATE_STABLE_SECONDS="$(bounded_integer "${TOOLBOX_AUTO_UPDATE_STABLE_SECONDS:-}" 120 30 1800)"
AUTO_UPDATE_REQUIRE_IDLE="$(config_boolean "${TOOLBOX_AUTO_UPDATE_REQUIRE_IDLE:-}" 1)"
AUTO_UPDATE_REMOTE="${TOOLBOX_AUTO_UPDATE_REMOTE:-origin}"
AUTO_UPDATE_BRANCH="${TOOLBOX_AUTO_UPDATE_BRANCH:-main}"
# Java is the sole Git polling owner. Retain the legacy shell state machine below for
# rolling-upgrade readability, but keep it unreachable in this worker.
AUTO_UPDATE_ENABLED=0

HTTP_HOST="${HTTP_HOST:-127.0.0.1}"
HTTP_PORT="${HTTP_PORT:-18081}"
BACKEND_PORT="${BACKEND_PORT:-18080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
SIDECAR_PORT=18890
ASR_PORT="${ASR_PORT:-9500}"
VISITOR_ANALYSIS_PORT=9600
BROWSER_SERVICE_PORT=18092
STUDIO_PORT=3000

RESTART_TOKEN="${TOOLBOX_SUPERVISOR_RESTART_TOKEN:-}"
SYSTEM_RESTART_TOKEN="${TOOLBOX_SYSTEM_RESTART_TOKEN:-}"
INTERNAL_CONTROL_TOKEN="$("$PYTHON_CMD" -c 'import secrets; print(secrets.token_hex(32))')"
if [[ -z "$INTERNAL_CONTROL_TOKEN" ]]; then
  echo "[supervisor] unable to generate the internal control token" >&2
  exit 1
fi
export KAI_SUPERVISOR_CONTROL_TOKEN="$INTERNAL_CONTROL_TOKEN"
export KAI_SUPERVISOR_PROTOCOL_VERSION=1
TOOLBOX_HTTP_PROXY="${TOOLBOX_HTTP_PROXY:-}"
TOOLBOX_QBT_PASSWORD="${TOOLBOX_QBT_PASSWORD:-}"

CONTROL_DIR="$SUPERVISOR_STATE_ROOT/runtime-$REPO_HASH"
RESTART_FILE="$CONTROL_DIR/restart.request"
FULL_RELOAD_FILE="$CONTROL_DIR/full-reload.request"
STATUS_FILE="$CONTROL_DIR/status.json"
HTTP_READY_FILE="$CONTROL_DIR/http.ready"
STARTER_JAR="$REPO_ROOT/toolbox-starter/target/kai-toolbox.jar"
mkdir -p "$CONTROL_DIR" "$HOME/Library/Logs/kai-toolbox"
rm -f "$RESTART_FILE" "$FULL_RELOAD_FILE" "$HTTP_READY_FILE"

AUTO_UPDATE_LOG_FILE="$HOME/Library/Logs/kai-toolbox/auto-update.log"

ARIA2_BIN="${ARIA2_BIN:-}"
if [[ -z "$ARIA2_BIN" || ! -x "$ARIA2_BIN" ]]; then
  if command -v aria2c >/dev/null 2>&1; then
    ARIA2_BIN="$(command -v aria2c)"
  elif [[ -x /opt/homebrew/bin/aria2c ]]; then
    ARIA2_BIN=/opt/homebrew/bin/aria2c
  elif [[ -x /usr/local/bin/aria2c ]]; then
    ARIA2_BIN=/usr/local/bin/aria2c
  else
    ARIA2_BIN=""
  fi
  [[ -n "$ARIA2_BIN" ]] && conf_set ARIA2_BIN "$ARIA2_BIN"
fi
TOOLBOX_ARIA2_BINARY="${TOOLBOX_ARIA2_BINARY:-${ARIA2_BIN:-aria2c}}"

TOOLBOX_WHISPER_MODE="$(printf '%s' "${TOOLBOX_WHISPER_MODE:-asr-service}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
case "$TOOLBOX_WHISPER_MODE" in
  cli|asr-service) ;;
  *)
    echo "[supervisor] WARN: invalid TOOLBOX_WHISPER_MODE; using asr-service"
    TOOLBOX_WHISPER_MODE=asr-service
    ;;
esac

export PLAYWRIGHT_DOWNLOAD_HOST="${PLAYWRIGHT_DOWNLOAD_HOST:-https://cdn.npmmirror.com/binaries/playwright}"
export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}"

backend_pid=""
frontend_pid=""
http_pid=""
visitor_pid=""
asr_pid=""
studio_pid=""
visitor_restart_pending=0
visitor_restart_not_before=0
asr_restart_pending=0
asr_restart_not_before=0
last_start=""
cleanup_started=0
auto_update_relaunch_requested=0

auto_state="disabled"
[[ "$JAVA_AUTO_UPDATE_ENABLED" -eq 1 ]] && auto_state="delegated-to-java"
auto_last_check_epoch=""
auto_next_check_epoch=""
auto_candidate_sha=""
auto_candidate_since_epoch=""
auto_local_head=""
auto_remote_head=""
auto_last_error=""
auto_fetch_failures=0
auto_last_log_key=""
auto_fetch_pid=""
auto_fetch_result_file="$CONTROL_DIR/auto-fetch.$$.json"
auto_fetch_pgid_file="$CONTROL_DIR/auto-fetch.$$.pgid"
auto_fetch_started_epoch=""

STARTED_PID=""

write_studio_owner() {
  local tmp="$STUDIO_OWNER_FILE.tmp.$$"
  [[ "$studio_pid" =~ ^[0-9]+$ ]] || return 1
  {
    printf 'nonce=%s\n' "$BOOTSTRAP_NONCE"
    printf 'pgid=%s\n' "$studio_pid"
  } > "$tmp" && mv -f "$tmp" "$STUDIO_OWNER_FILE"
}

clear_studio_owner() {
  if [[ "$(read_owner_value nonce "$STUDIO_OWNER_FILE")" == "$BOOTSTRAP_NONCE" ]]; then
    rm -f "$STUDIO_OWNER_FILE" 2>/dev/null || true
  fi
}

starting_process_is_verified_child() {
  local child_pid="$1"
  local ready_file="$2"
  local child_ppid child_command
  child_ppid="$(ps -o ppid= -p "$child_pid" 2>/dev/null | tr -d '[:space:]')"
  child_command="$(process_command "$child_pid")"
  [[ "$child_ppid" == "$$" && "$child_command" == *"$ready_file"* &&
     "$child_command" == *os.setsid* ]]
}

cleanup_starting_process_group() {
  local child_pid="$1"
  local ready_file="$2"
  local deadline mode=""

  # Prefer the new session as soon as it exists. Before setsid there can be no
  # descendants; a positive-PID signal is allowed only while ps still proves this is
  # our direct Python readiness shim. Both paths are bounded before SIGKILL + reap.
  if kill -0 -- "-$child_pid" 2>/dev/null; then
    mode=group
    kill -TERM -- "-$child_pid" 2>/dev/null || true
  elif starting_process_is_verified_child "$child_pid" "$ready_file"; then
    mode=child
    kill -TERM "$child_pid" 2>/dev/null || true
  else
    [[ -n "$child_pid" ]] && ! kill -0 "$child_pid" 2>/dev/null && wait "$child_pid" 2>/dev/null || true
    echo "[supervisor] unable to verify failed process-group starter; refusing unsafe PID signal" >&2
    return 1
  fi

  deadline=$(( $(date +%s) + 2 ))
  while [[ "$(date +%s)" -lt "$deadline" ]]; do
    if [[ "$mode" == "group" ]]; then
      kill -0 -- "-$child_pid" 2>/dev/null || break
    else
      kill -0 "$child_pid" 2>/dev/null || break
    fi
    sleep 0.05
  done

  # The shim may cross setsid between the initial check and TERM. Re-check the owned
  # group first; otherwise retain the strict direct-child+command proof for PID KILL.
  if kill -0 -- "-$child_pid" 2>/dev/null; then
    kill -KILL -- "-$child_pid" 2>/dev/null || true
  elif kill -0 "$child_pid" 2>/dev/null &&
       starting_process_is_verified_child "$child_pid" "$ready_file"; then
    kill -KILL "$child_pid" 2>/dev/null || true
  fi
  wait "$child_pid" 2>/dev/null || true
  return 0
}

start_process_group() {
  local working_directory="$1"
  local ready_file ready_pid child_pid deadline
  shift
  STARTED_PID=""
  ready_file="$(mktemp "$CONTROL_DIR/process-group.XXXXXX")" || {
    echo "[supervisor] unable to create process-group readiness file" >&2
    return 1
  }
  rm -f "$ready_file"
  "$PYTHON_CMD" -c '
import os
import sys
ready_path = sys.argv[1]
working_directory = sys.argv[2]
command = sys.argv[3:]
ready_tmp = ready_path + ".tmp." + str(os.getpid())
try:
    os.chdir(working_directory)
    os.setsid()
    with open(ready_tmp, "w", encoding="ascii") as handle:
        handle.write(str(os.getpid()) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(ready_tmp, ready_path)
    os.execvp(command[0], command)
finally:
    for path in (ready_tmp, ready_path):
        try:
            os.unlink(path)
        except OSError:
            pass
' "$ready_file" "$working_directory" "$@" &
  child_pid=$!
  deadline=$(( $(date +%s) + 5 ))

  # The child publishes readiness only after os.setsid(), so every PID returned from
  # this function is already an owned PGID. Until that handshake completes it remains
  # our unreaped direct child, which makes this short positive-PID liveness check safe.
  while [[ ! -f "$ready_file" ]]; do
    if ! kill -0 "$child_pid" 2>/dev/null; then
      wait "$child_pid" 2>/dev/null || true
      rm -f "$ready_file" "$ready_file.tmp."* 2>/dev/null || true
      echo "[supervisor] managed process failed before creating its process group" >&2
      return 1
    fi
    if [[ "$(date +%s)" -ge "$deadline" ]]; then
      cleanup_starting_process_group "$child_pid" "$ready_file" || true
      rm -f "$ready_file" "$ready_file.tmp."* 2>/dev/null || true
      echo "[supervisor] timed out waiting for managed process-group readiness" >&2
      return 1
    fi
    sleep 0.05
  done

  ready_pid="$(sed -n '1p' "$ready_file" 2>/dev/null || true)"
  rm -f "$ready_file" "$ready_file.tmp."* 2>/dev/null || true
  if [[ "$ready_pid" != "$child_pid" ]] || ! kill -0 -- "-$child_pid" 2>/dev/null; then
    cleanup_starting_process_group "$child_pid" "$ready_file" || true
    echo "[supervisor] managed process did not establish its expected process group" >&2
    return 1
  fi
  STARTED_PID="$child_pid"
  return 0
}

pid_is_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

pid_is_running_non_zombie() {
  local pid="$1"
  local state
  pid_is_alive "$pid" || return 1
  state="$(ps -o stat= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [[ -n "$state" && "$state" != Z* ]]
}

process_group_is_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  # Every PID passed here was launched through os.setsid(), therefore the original
  # leader PID is also the PGID. The group may still contain grandchildren after its
  # leader exits, so checking only `ps -p $pid` would leak Maven/npm descendants.
  kill -0 -- "-$pid" 2>/dev/null || return 1
  # A reaped-or-pending zombie leader still answers kill -0. Treat the group alive
  # only when at least one member is not a zombie, while still recognizing children
  # that remain after the original leader exits. Never fall back to an arbitrary
  # positive PID: once the group is gone that PID could eventually be reused.
  ps -axo pgid=,stat= 2>/dev/null |
    awk -v expected="$pid" '$1 == expected && $2 !~ /^Z/ { found=1 } END { exit(found ? 0 : 1) }'
}

stop_process_group() {
  local pid="$1"
  local grace_seconds="${2:-10}"
  local deadline
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  if process_group_is_alive "$pid"; then
    kill -TERM -- "-$pid" 2>/dev/null || true
  fi
  deadline=$(( $(date +%s) + grace_seconds ))
  while process_group_is_alive "$pid" && [[ "$(date +%s)" -lt "$deadline" ]]; do
    sleep 0.2
  done
  if process_group_is_alive "$pid"; then
    kill -KILL -- "-$pid" 2>/dev/null || true
  fi
  deadline=$(( $(date +%s) + 2 ))
  while process_group_is_alive "$pid" && [[ "$(date +%s)" -lt "$deadline" ]]; do
    sleep 0.1
  done
  if process_group_is_alive "$pid"; then
    echo "[supervisor] WARN: process group $pid did not exit after SIGKILL" >&2
  fi
  # wait has no timeout in Bash 3.2. Reap only once the direct leader is no longer
  # running; never let cleanup block forever on an uninterruptible process.
  if ! pid_is_running_non_zombie "$pid"; then
    wait "$pid" 2>/dev/null || true
  fi
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

stop_port_holders() {
  local port="$1"
  local holder
  command -v lsof >/dev/null 2>&1 || return 0
  for holder in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [[ "$holder" =~ ^[0-9]+$ ]] || continue
    [[ "$holder" == "$$" || "$holder" == "$BOOTSTRAP_PID" ]] && continue
    echo "[supervisor] takeover: stop process on :$port PID=$holder"
    kill_tree "$holder" TERM
  done
  sleep 0.5
  for holder in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [[ "$holder" =~ ^[0-9]+$ ]] || continue
    [[ "$holder" == "$$" || "$holder" == "$BOOTSTRAP_PID" ]] && continue
    kill_tree "$holder" KILL
  done
}

node_dependencies_need_install() {
  local directory="$1"
  local installed_lock="$directory/node_modules/.package-lock.json"
  [[ -d "$directory/node_modules" && -f "$installed_lock" ]] || return 0
  [[ -f "$directory/package.json" && "$directory/package.json" -nt "$installed_lock" ]] && return 0
  [[ -f "$directory/package-lock.json" && "$directory/package-lock.json" -nt "$installed_lock" ]] && return 0
  return 1
}

npm_install_directory() {
  local directory="$1"
  (
    cd "$directory" || exit 1
    if [[ -f package-lock.json ]]; then
      "$NPM_BIN" ci --no-audit --no-fund
    else
      "$NPM_BIN" install --no-audit --no-fund
    fi
  )
}

ensure_claude_agent_build() {
  local sidecar="$REPO_ROOT/sidecar/claude-agent"
  local dist="$sidecar/dist/server.js"
  local need_install=0
  local need_build=0
  local reason=""

  if node_dependencies_need_install "$sidecar"; then
    need_install=1
  fi
  if [[ ! -f "$dist" ]]; then
    need_build=1
    reason="dist/server.js missing"
  elif [[ -n "$(find "$sidecar/src" -type f -newer "$dist" -print 2>/dev/null | head -n 1)" ]] ||
       [[ "$sidecar/package.json" -nt "$dist" ]] ||
       [[ "$sidecar/package-lock.json" -nt "$dist" ]] ||
       [[ "$sidecar/tsconfig.json" -nt "$dist" ]]; then
    need_build=1
    reason="source newer than dist"
  elif [[ "$need_install" -eq 1 ]]; then
    reason="dependencies changed"
  fi

  if [[ "$need_install" -eq 0 && "$need_build" -eq 0 ]]; then
    echo "[supervisor] claude-agent sidecar dist up to date, skip"
    return 0
  fi
  echo "[supervisor] init claude-agent sidecar ($reason)..."
  if [[ "$need_install" -eq 1 ]] && ! npm_install_directory "$sidecar"; then
    echo "[supervisor] WARN: claude-agent dependency install failed" >&2
    return 1
  fi
  if [[ "$need_build" -eq 1 || "$need_install" -eq 1 ]]; then
    (cd "$sidecar" && "$NPM_BIN" run build) || {
      echo "[supervisor] WARN: claude-agent build failed" >&2
      return 1
    }
  fi
}

initialize_node_dependencies() {
  local undetected="$REPO_ROOT/node-services/undetected-browser"
  ensure_claude_agent_build || true
  if node_dependencies_need_install "$undetected"; then
    echo "[supervisor] init/update undetected-browser dependencies + chromium..."
    if npm_install_directory "$undetected"; then
      (cd "$undetected" && "$NPM_BIN" run install-browser) ||
        echo "[supervisor] WARN: undetected-browser Chromium install failed" >&2
    else
      echo "[supervisor] WARN: undetected-browser dependency install failed" >&2
    fi
  else
    echo "[supervisor] undetected-browser dependencies up to date, skip"
  fi
}

ensure_frontend_dependencies() {
  local frontend="$REPO_ROOT/frontend"
  if node_dependencies_need_install "$frontend"; then
    echo "[supervisor] install/update frontend dependencies..."
    npm_install_directory "$frontend"
  fi
}

write_status() {
  local backend_up=false
  local backend_status_pid=""
  if process_group_is_alive "$backend_pid"; then
    backend_up=true
    backend_status_pid="$backend_pid"
  fi
  "$PYTHON_CMD" - "$STATUS_FILE" "$backend_up" "$backend_status_pid" "$last_start" \
    "$JAVA_AUTO_UPDATE_ENABLED" "$AUTO_UPDATE_REMOTE/$AUTO_UPDATE_BRANCH" \
    "$AUTO_UPDATE_INTERVAL_SECONDS" "$AUTO_UPDATE_STABLE_SECONDS" "$AUTO_UPDATE_REQUIRE_IDLE" \
    "$auto_state" "$auto_last_check_epoch" "$auto_next_check_epoch" "$auto_local_head" \
    "$auto_remote_head" "$auto_candidate_sha" "$auto_last_error" "$REPO_ROOT" <<'PY' >/dev/null 2>&1 || true
import datetime
import json
import os
import sys

path = sys.argv[1]

def optional(value):
    return value if value else None

def iso_epoch(value):
    if not value:
        return None
    return datetime.datetime.fromtimestamp(int(value)).replace(microsecond=0).isoformat()

data = {
    "protocolVersion": 1,
    "repoRoot": sys.argv[17],
    "capabilities": {"fullReload": True},
    "backendUp": sys.argv[2] == "true",
    "pid": int(sys.argv[3]) if sys.argv[3] else None,
    "lastStart": optional(sys.argv[4]),
    "autoUpdate": {
        "owner": "java",
        "enabled": sys.argv[5] == "1",
        "source": sys.argv[6],
        "intervalSeconds": int(sys.argv[7]),
        "stableSeconds": int(sys.argv[8]),
        "requireIdle": sys.argv[9] == "1",
        "state": sys.argv[10],
        "lastCheck": iso_epoch(sys.argv[11]),
        "nextCheck": iso_epoch(sys.argv[12]),
        "localHead": optional(sys.argv[13]),
        "remoteHead": optional(sys.argv[14]),
        "candidateHead": optional(sys.argv[15]),
        "lastError": optional(sys.argv[16]),
    },
}
tmp = path + ".tmp." + str(os.getpid())
with open(tmp, "w", encoding="utf-8") as handle:
    json.dump(data, handle, separators=(",", ":"))
    handle.flush()
    os.fsync(handle.fileno())
os.replace(tmp, path)
PY
}

start_http_control() {
  rm -f "$HTTP_READY_FILE"
  SUPERVISOR_HTTP_HOST="$HTTP_HOST" \
  SUPERVISOR_HTTP_PORT="$HTTP_PORT" \
  SUPERVISOR_RESTART_TOKEN="$RESTART_TOKEN" \
  SUPERVISOR_INTERNAL_CONTROL_TOKEN="$INTERNAL_CONTROL_TOKEN" \
  SUPERVISOR_RESTART_FILE="$RESTART_FILE" \
  SUPERVISOR_FULL_RELOAD_FILE="$FULL_RELOAD_FILE" \
  SUPERVISOR_STATUS_FILE="$STATUS_FILE" \
  SUPERVISOR_READY_FILE="$HTTP_READY_FILE" \
  SUPERVISOR_REPO_ROOT="$REPO_ROOT" \
    "$PYTHON_CMD" - <<'PY' &
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

host = os.environ["SUPERVISOR_HTTP_HOST"]
port = int(os.environ["SUPERVISOR_HTTP_PORT"])
restart_token = os.environ.get("SUPERVISOR_RESTART_TOKEN", "")
internal_control_token = os.environ["SUPERVISOR_INTERNAL_CONTROL_TOKEN"]
restart_file = os.environ["SUPERVISOR_RESTART_FILE"]
full_reload_file = os.environ["SUPERVISOR_FULL_RELOAD_FILE"]
status_file = os.environ["SUPERVISOR_STATUS_FILE"]
ready_file = os.environ["SUPERVISOR_READY_FILE"]
repo_root = os.environ["SUPERVISOR_REPO_ROOT"]

class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

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
            with open(status_file, "r", encoding="utf-8") as handle:
                self.send_json(200, json.load(handle))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            self.send_json(200, {
                "protocolVersion": 1,
                "repoRoot": repo_root,
                "capabilities": {"fullReload": True},
                "backendUp": False,
                "pid": None,
                "lastStart": None,
            })

    @staticmethod
    def write_signal(path, value):
        directory = os.path.dirname(path)
        fd, tmp = tempfile.mkstemp(prefix="control.", dir=directory)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(value + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/restart", "/reload", "/full-reload"):
            self.send_json(404, {"error": "not found"})
            return
        token = self.headers.get("X-Restart-Token") or parse_qs(parsed.query).get("token", [""])[0]
        if parsed.path in ("/reload", "/full-reload"):
            if not token or token not in (internal_control_token, restart_token):
                self.send_json(403, {"error": "token mismatch"})
                return
            self.write_signal(full_reload_file, "full-reload")
            self.send_json(202, {"ok": True, "message": "full reload accepted"})
            return
        if not restart_token:
            self.send_json(503, {"error": "RestartToken is not configured"})
            return
        if token != restart_token:
            self.send_json(403, {"error": "token mismatch"})
            return
        self.write_signal(restart_file, "restart")
        self.send_json(200, {"ok": True, "message": "restart triggered; backend will return soon"})

server = Server((host, port), Handler)
tmp_ready = ready_file + ".tmp." + str(os.getpid())
with open(tmp_ready, "w", encoding="utf-8") as handle:
    handle.write(str(os.getpid()) + "\n")
os.replace(tmp_ready, ready_file)
server.serve_forever()
PY
  http_pid=$!

  local attempts=0
  while [[ "$attempts" -lt 50 ]]; do
    [[ -f "$HTTP_READY_FILE" ]] && return 0
    if ! kill -0 "$http_pid" 2>/dev/null; then
      wait "$http_pid" 2>/dev/null || true
      http_pid=""
      echo "[supervisor] HTTP control failed to bind http://$HTTP_HOST:$HTTP_PORT/" >&2
      return 1
    fi
    attempts=$(( attempts + 1 ))
    sleep 0.1
  done
  kill -TERM "$http_pid" 2>/dev/null || true
  wait "$http_pid" 2>/dev/null || true
  http_pid=""
  echo "[supervisor] HTTP control startup timed out" >&2
  return 1
}

start_backend() {
  stop_port_holders "$BACKEND_PORT"
  stop_port_holders "$SIDECAR_PORT"
  ensure_claude_agent_build || true
  last_start="$(date '+%Y-%m-%dT%H:%M:%S')"
  echo "[supervisor] $(date '+%H:%M:%S') package and start backend..."

  local java_options
  java_options=(
    "-DTOOLBOX_ARIA2_BINARY=$TOOLBOX_ARIA2_BINARY"
    "-Dtoolbox.whisper.mode=$TOOLBOX_WHISPER_MODE"
    "-Dfile.encoding=UTF-8"
    "-Dstdout.encoding=UTF-8"
    "-Dstderr.encoding=UTF-8"
  )
  # Sensitive TOOLBOX_* values are already exported by load_tools_conf and inherited by
  # Java. Do not duplicate passwords/tokens in process command-line arguments visible to ps.
  [[ -n "${TOOLBOX_SQLITE_FILE:-}" ]] && java_options+=("-Dtoolbox.sqlite.file=$TOOLBOX_SQLITE_FILE")

  if ! start_process_group "$REPO_ROOT" /bin/bash -c '
    mvn_cmd="$1"
    java_cmd="$2"
    starter_jar="$3"
    shift 3
    "$mvn_cmd" -pl toolbox-starter -am "-Dskip.frontend=true" package || exit $?
    exec "$java_cmd" "$@" -jar "$starter_jar"
  ' kai-toolbox-backend "$MVN_CMD" "$JAVA_CMD" "$STARTER_JAR" "${java_options[@]}"; then
    backend_pid=""
    write_status
    return 1
  fi
  backend_pid="$STARTED_PID"
  write_status
}

stop_backend() {
  if process_group_is_alive "$backend_pid" && [[ -n "$SYSTEM_RESTART_TOKEN" ]]; then
      TOOLBOX_SHUTDOWN_TOKEN="$SYSTEM_RESTART_TOKEN" \
        "$PYTHON_CMD" - "$BACKEND_PORT" <<'PY' >/dev/null 2>&1 || true
import os
import sys
import urllib.request

request = urllib.request.Request(
    "http://127.0.0.1:%s/api/system/restart" % sys.argv[1],
    method="POST",
    headers={"X-Restart-Token": os.environ["TOOLBOX_SHUTDOWN_TOKEN"]},
)
urllib.request.urlopen(request, timeout=3).read()
PY
      local graceful_deadline=$(( $(date +%s) + 10 ))
      while process_group_is_alive "$backend_pid" && [[ "$(date +%s)" -lt "$graceful_deadline" ]]; do
        sleep 0.2
      done
  fi
  # The original Maven/Java leader may exit while descendants remain in its PGID.
  # Final shutdown therefore always checks and owns the process group, not the leader PID.
  if process_group_is_alive "$backend_pid"; then
    stop_process_group "$backend_pid" 5
  elif [[ -n "$backend_pid" ]]; then
    wait "$backend_pid" 2>/dev/null || true
  fi
  backend_pid=""
  write_status
}

start_frontend() {
  stop_port_holders "$FRONTEND_PORT"
  if ! ensure_frontend_dependencies; then
    echo "[supervisor] WARN: frontend dependencies failed to install" >&2
    frontend_pid=""
    return 1
  fi
  echo "[supervisor] $(date '+%H:%M:%S') start frontend dev server (vite :$FRONTEND_PORT)..."
  if ! start_process_group "$REPO_ROOT/frontend" "$NPM_BIN" run dev; then
    frontend_pid=""
    return 1
  fi
  frontend_pid="$STARTED_PID"
}

stop_frontend() {
  if [[ -n "$frontend_pid" ]]; then
    stop_process_group "$frontend_pid" 5
  fi
  frontend_pid=""
}

start_visitor_analysis_sidecar() {
  local directory="$REPO_ROOT/python-services/visitor-analysis"
  if [[ ! -f "$directory/start.sh" ]]; then
    echo "[supervisor] visitor-analysis start.sh missing, skip"
    return 0
  fi
  if lsof -nP -iTCP:"$VISITOR_ANALYSIS_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[supervisor] visitor-analysis sidecar already on :$VISITOR_ANALYSIS_PORT, skip"
    return 0
  fi
  echo "[supervisor] start visitor-analysis sidecar (background)..."
  if ! start_process_group "$directory" /usr/bin/env "PYTHON_CMD=$PYTHON_CMD" /bin/bash start.sh \
    >> "$HOME/Library/Logs/kai-toolbox/visitor-analysis.log" 2>&1; then
    visitor_pid=""
    visitor_restart_pending=1
    visitor_restart_not_before=$(( $(date +%s) + 5 ))
    return 1
  fi
  visitor_pid="$STARTED_PID"
}

start_faster_whisper_sidecar() {
  if [[ "$TOOLBOX_WHISPER_MODE" != "asr-service" ]]; then
    echo "[supervisor] whisper mode=$TOOLBOX_WHISPER_MODE; ASR sidecar not needed"
    return 0
  fi
  local directory="$REPO_ROOT/python-services/faster-whisper"
  if [[ ! -f "$directory/start.sh" ]]; then
    echo "[supervisor] WARN: faster-whisper start.sh missing" >&2
    return 0
  fi
  if lsof -nP -iTCP:"$ASR_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[supervisor] faster-whisper sidecar already on :$ASR_PORT, skip"
    return 0
  fi
  echo "[supervisor] start faster-whisper sidecar (:$ASR_PORT, background)..."
  if ! start_process_group "$directory" /usr/bin/env "PYTHON_CMD=$PYTHON_CMD" /bin/bash start.sh \
    >> "$HOME/Library/Logs/kai-toolbox/faster-whisper.log" 2>&1; then
    asr_pid=""
    asr_restart_pending=1
    asr_restart_not_before=$(( $(date +%s) + 5 ))
    return 1
  fi
  asr_pid="$STARTED_PID"
}

start_agentscope_studio() {
  local owned_studio_pgid
  owned_studio_pgid="$(verified_studio_pgid 2>/dev/null || true)"
  if [[ -n "$owned_studio_pgid" ]]; then
    studio_pid="$owned_studio_pgid"
    echo "[supervisor] AgentScope Studio owned group already running (PGID=$studio_pid), skip"
    return 0
  fi
  if lsof -nP -iTCP:"$STUDIO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[supervisor] AgentScope Studio already on :$STUDIO_PORT, skip"
    return 0
  fi
  echo "[supervisor] start AgentScope Studio (:$STUDIO_PORT, background)..."
  if ! start_process_group "$REPO_ROOT" /bin/bash -c '
    npm_bin="$1"
    if ! command -v as_studio >/dev/null 2>&1; then
      "$npm_bin" install -g @agentscope/studio || exit $?
    fi
    exec as_studio
  ' kai-toolbox-studio "$NPM_BIN" >> "$HOME/Library/Logs/kai-toolbox/agentscope-studio.log" 2>&1; then
    studio_pid=""
    return 1
  fi
  studio_pid="$STARTED_PID"
  write_studio_owner || {
    stop_process_group "$studio_pid" 2
    studio_pid=""
    echo "[supervisor] unable to persist AgentScope Studio ownership; stopped unsafe untracked group" >&2
    return 1
  }
}

sanitize_log_text() {
  local value="$1"
  printf '%s' "$value" | "$PYTHON_CMD" -c '
import re
import sys

value = sys.stdin.read().replace("\r", " ").replace("\n", " ").strip()
value = re.sub(r"(?i)(https?://)[^/@\s]+@", r"\1***@", value)
value = re.sub(
    r"(?i)([?&](?:token|access_token|auth|password|api_key|apikey|key)=)[^&#\s]+",
    r"\1***",
    value,
)
value = re.sub(
    r"(?i)(/(?:token|access_token|auth|password|api_key|apikey)/)[^/?#\s]+",
    r"\1***",
    value,
)
value = re.sub(r"(?i)(authorization:\s*(?:bearer|basic)?\s*)\S+", r"\1***", value)
if len(value) > 600:
    value = value[:600] + "..."
sys.stdout.write(value)
'
}

write_auto_log() {
  local message
  message="$(sanitize_log_text "$1")"
  printf '[auto-update] %s\n' "$message"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" >> "$AUTO_UPDATE_LOG_FILE" 2>/dev/null || true
}

set_auto_state() {
  local state="$1"
  local message="$2"
  local error_text="${3:-}"
  local key log_message
  auto_state="$state"
  auto_last_error="$(sanitize_log_text "$error_text")"
  key="$state|$message|$auto_last_error"
  if [[ "$key" != "$auto_last_log_key" ]]; then
    auto_last_log_key="$key"
    log_message="$message"
    [[ -n "$auto_last_error" ]] && log_message="$log_message | error=$auto_last_error"
    write_auto_log "$log_message"
  fi
}

schedule_auto_check() {
  local seconds="$1"
  [[ "$seconds" -lt 1 ]] && seconds=1
  auto_next_check_epoch=$(( $(date +%s) + seconds ))
}

schedule_auto_check_soon() {
  if [[ "$AUTO_UPDATE_INTERVAL_SECONDS" -lt 60 ]]; then
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
  else
    schedule_auto_check 60
  fi
}

GIT_RC=0
GIT_OUTPUT=""
GIT_ERROR=""

git_capture() {
  local stdout_file="$CONTROL_DIR/git.stdout.$$"
  local stderr_file="$CONTROL_DIR/git.stderr.$$"
  GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=Never \
    "$GIT_CMD" -C "$REPO_ROOT" "$@" > "$stdout_file" 2> "$stderr_file"
  GIT_RC=$?
  GIT_OUTPUT="$(cat "$stdout_file" 2>/dev/null || true)"
  GIT_ERROR="$(cat "$stderr_file" 2>/dev/null || true)"
  rm -f "$stdout_file" "$stderr_file"
  return 0
}

GIT_SAFE=0
GIT_STATE=""
GIT_MESSAGE=""
GIT_STATE_ERROR=""
GIT_BRANCH=""
GIT_UPSTREAM=""
GIT_REMOTE_REF=""
GIT_LOCAL_HEAD=""
GIT_REMOTE_HEAD=""
GIT_AHEAD=0
GIT_BEHIND=0

set_git_blocked() {
  GIT_SAFE=0
  GIT_STATE="$1"
  GIT_MESSAGE="$2"
  GIT_STATE_ERROR="${3:-}"
}

get_git_operation_marker() {
  local marker path
  for marker in index.lock MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG sequencer rebase-apply rebase-merge; do
    git_capture rev-parse --git-path "$marker"
    [[ "$GIT_RC" -eq 0 ]] || continue
    path="$GIT_OUTPUT"
    [[ "$path" == /* ]] || path="$REPO_ROOT/$path"
    if [[ -e "$path" ]]; then
      printf '%s' "$marker"
      return 0
    fi
  done
  return 1
}

get_auto_git_state() {
  local expected_upstream marker counts
  GIT_SAFE=0
  GIT_STATE_ERROR=""
  GIT_AHEAD=0
  GIT_BEHIND=0

  git_capture symbolic-ref --quiet --short HEAD
  if [[ "$GIT_RC" -ne 0 ]]; then
    set_git_blocked blocked-detached "HEAD is detached; waiting for manual resolution"
    return
  fi
  GIT_BRANCH="$GIT_OUTPUT"
  if [[ "$GIT_BRANCH" != "$AUTO_UPDATE_BRANCH" ]]; then
    set_git_blocked blocked-branch "current branch $GIT_BRANCH is not configured branch $AUTO_UPDATE_BRANCH"
    return
  fi

  expected_upstream="$AUTO_UPDATE_REMOTE/$AUTO_UPDATE_BRANCH"
  git_capture rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
  if [[ "$GIT_RC" -ne 0 || "$GIT_OUTPUT" != "$expected_upstream" ]]; then
    set_git_blocked blocked-upstream "upstream is ${GIT_OUTPUT:-unset}; expected $expected_upstream"
    return
  fi
  GIT_UPSTREAM="$expected_upstream"

  marker="$(get_git_operation_marker || true)"
  if [[ -n "$marker" ]]; then
    set_git_blocked blocked-git-operation "Git operation is still active ($marker)"
    return
  fi

  git_capture status --porcelain=v2 --untracked-files=all
  if [[ "$GIT_RC" -ne 0 ]]; then
    set_git_blocked git-error "unable to inspect working tree" "$GIT_ERROR"
    return
  fi
  if [[ -n "$GIT_OUTPUT" ]]; then
    set_git_blocked blocked-dirty "working tree has tracked or untracked changes; update deferred"
    return
  fi

  GIT_REMOTE_REF="refs/remotes/$AUTO_UPDATE_REMOTE/$AUTO_UPDATE_BRANCH"
  git_capture rev-parse HEAD
  if [[ "$GIT_RC" -ne 0 ]]; then
    set_git_blocked git-error "unable to resolve local HEAD" "$GIT_ERROR"
    return
  fi
  GIT_LOCAL_HEAD="$GIT_OUTPUT"
  git_capture rev-parse "$GIT_REMOTE_REF"
  if [[ "$GIT_RC" -ne 0 ]]; then
    set_git_blocked git-error "unable to resolve remote-tracking HEAD" "$GIT_ERROR"
    return
  fi
  GIT_REMOTE_HEAD="$GIT_OUTPUT"
  git_capture rev-list --left-right --count "HEAD...$GIT_REMOTE_REF"
  if [[ "$GIT_RC" -ne 0 ]]; then
    set_git_blocked git-error "unable to compare local and remote commits" "$GIT_ERROR"
    return
  fi
  counts="$GIT_OUTPUT"
  set -- $counts
  if [[ $# -lt 2 || ! "$1" =~ ^[0-9]+$ || ! "$2" =~ ^[0-9]+$ ]]; then
    set_git_blocked git-error "unexpected Git commit count" "$counts"
    return
  fi
  GIT_AHEAD="$1"
  GIT_BEHIND="$2"
  GIT_SAFE=1
  GIT_STATE=ready
  GIT_MESSAGE=ready
}

CANDIDATE_MESSAGE=""
CANDIDATE_ERROR=""

test_candidate_supervisor() {
  local remote_ref="$1"
  local candidate="$CONTROL_DIR/candidate-supervisor.$$.sh"
  local syntax_error="$CONTROL_DIR/candidate-supervisor.$$.err"
  CANDIDATE_MESSAGE=""
  CANDIDATE_ERROR=""
  git_capture show "${remote_ref}:scripts/run-supervised-macos.sh"
  if [[ "$GIT_RC" -ne 0 || -z "$GIT_OUTPUT" ]]; then
    CANDIDATE_MESSAGE="candidate version is missing scripts/run-supervised-macos.sh"
    CANDIDATE_ERROR="$GIT_ERROR"
    return 1
  fi
  printf '%s\n' "$GIT_OUTPUT" > "$candidate"
  if ! /bin/bash -n "$candidate" 2> "$syntax_error"; then
    CANDIDATE_MESSAGE="candidate macOS supervisor has Bash syntax errors"
    CANDIDATE_ERROR="$(cat "$syntax_error" 2>/dev/null || true)"
    rm -f "$candidate" "$syntax_error"
    return 1
  fi
  if ! grep -q -- '--worker' "$candidate" ||
     ! grep -q -- '--auto-update' "$candidate" ||
     ! grep -q -- '--auto-update-interval-seconds' "$candidate" ||
     ! grep -qE 'AUTO_UPDATE_RELAUNCH_EXIT_CODE[[:space:]]*=[[:space:]]*75' "$candidate"; then
    CANDIDATE_MESSAGE="candidate supervisor no longer satisfies the self-reload contract"
    CANDIDATE_ERROR="required options or relaunch exit code are missing"
    rm -f "$candidate" "$syntax_error"
    return 1
  fi
  rm -f "$candidate" "$syntax_error"
  return 0
}

RUNTIME_MESSAGE=""
RUNTIME_ERROR=""

test_runtime_idle() {
  local result rc
  RUNTIME_MESSAGE=""
  RUNTIME_ERROR=""
  if [[ "$AUTO_UPDATE_REQUIRE_IDLE" -ne 1 ]]; then
    RUNTIME_MESSAGE="idle guard disabled by configuration"
    return 0
  fi
  if ! process_group_is_alive "$backend_pid"; then
    RUNTIME_MESSAGE="backend is not running; unable to confirm runtime is idle"
    RUNTIME_ERROR="activity endpoint unavailable"
    return 1
  fi
  result="$("$PYTHON_CMD" - "$BACKEND_PORT" <<'PY'
import json
import sys
import urllib.request

try:
    with urllib.request.urlopen(
        "http://127.0.0.1:%s/api/claude-chat/sessions/activity" % sys.argv[1],
        timeout=4,
    ) as response:
        data = json.load(response)
    if data.get("safeToRestart") is True:
        print("runtime is idle")
        raise SystemExit(0)
    print(
        "active jobs: running=%s, uncertain=%s, pending=%s, background=%s, oneShot=%s"
        % (
            data.get("runningTurnCount", "?"),
            data.get("uncertainSessionCount", "?"),
            data.get("pendingRequestCount", "?"),
            data.get("backgroundTaskCount", "?"),
            data.get("oneShotCount", "?"),
        )
    )
    raise SystemExit(2)
except SystemExit:
    raise
except Exception as exc:
    print("%s: %s" % (type(exc).__name__, exc))
    raise SystemExit(3)
PY
)"
  rc=$?
  case "$rc" in
    0)
      RUNTIME_MESSAGE="$result"
      return 0
      ;;
    2)
      RUNTIME_MESSAGE="$result"
      return 1
      ;;
    *)
      RUNTIME_MESSAGE="unable to confirm runtime is idle; update deferred"
      RUNTIME_ERROR="$result"
      return 1
      ;;
  esac
}

start_async_fetch() {
  rm -f "$auto_fetch_result_file" "$auto_fetch_pgid_file"
  GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=Never \
    "$PYTHON_CMD" - "$auto_fetch_result_file" "$auto_fetch_pgid_file" "$GIT_CMD" "$REPO_ROOT" \
      "$AUTO_UPDATE_REMOTE" "$AUTO_UPDATE_BRANCH" <<'PY' &
import json
import os
import signal
import subprocess
import sys
import time

result_path, pgid_path, git_cmd, repo, remote, branch = sys.argv[1:]
process = None

def stop_child(signum, frame):
    if process is not None and process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 2.0
        while process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.05)
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=2)
            except Exception:
                pass
    os._exit(128 + signum)

signal.signal(signal.SIGTERM, stop_child)
signal.signal(signal.SIGINT, stop_child)

timed_out = False
stdout = ""
stderr = ""
exit_code = -1
refspec = "+refs/heads/%s:refs/remotes/%s/%s" % (branch, remote, branch)
try:
    process = subprocess.Popen(
        [git_cmd, "-C", repo, "fetch", "--quiet", "--no-tags", "--prune", remote, refspec],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
        start_new_session=True,
        env=dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="Never"),
    )
    tmp_pgid = pgid_path + ".tmp." + str(os.getpid())
    with open(tmp_pgid, "w", encoding="utf-8") as handle:
        handle.write(str(process.pid) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_pgid, pgid_path)
    try:
        stdout, stderr = process.communicate(timeout=45)
        exit_code = process.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate()
        exit_code = -1
except Exception as exc:
    stderr = "%s: %s" % (type(exc).__name__, exc)
finally:
    # Any failure after Popen (including pgid-file publication) must reap the entire
    # fetch session before publishing a result. Otherwise an orphan git/ssh process
    # could keep mutating the remote-tracking ref after the shell forgets its PGID.
    if process is not None and process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 2.0
        while process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.05)
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        try:
            trailing_stdout, trailing_stderr = process.communicate(timeout=2)
            stdout = stdout or trailing_stdout
            if trailing_stderr:
                stderr = (stderr + " " + trailing_stderr).strip()
        except Exception:
            try:
                process.wait(timeout=1)
            except Exception:
                pass

payload = {
    "exitCode": exit_code,
    "stdout": stdout,
    "stderr": stderr,
    "timedOut": timed_out,
}
tmp = result_path + ".tmp." + str(os.getpid())
with open(tmp, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, separators=(",", ":"))
    handle.flush()
    os.fsync(handle.fileno())
os.replace(tmp, result_path)
PY
  auto_fetch_pid=$!
  auto_fetch_started_epoch="$(date +%s)"
  set_auto_state fetching "fetching $AUTO_UPDATE_REMOTE/$AUTO_UPDATE_BRANCH"
}

stop_async_fetch() {
  local deadline fetch_pgid fetch_command helper_was_alive=0
  fetch_pgid="$(cat "$auto_fetch_pgid_file" 2>/dev/null || true)"
  if pid_is_running_non_zombie "$auto_fetch_pid"; then
    helper_was_alive=1
    kill -TERM "$auto_fetch_pid" 2>/dev/null || true
    deadline=$(( $(date +%s) + 5 ))
    while pid_is_running_non_zombie "$auto_fetch_pid" && [[ "$(date +%s)" -lt "$deadline" ]]; do
      sleep 0.1
    done
    if pid_is_running_non_zombie "$auto_fetch_pid"; then
      kill -KILL "$auto_fetch_pid" 2>/dev/null || true
    fi
    wait "$auto_fetch_pid" 2>/dev/null || true
  fi
  fetch_command=""
  if [[ "$helper_was_alive" -eq 1 && "$fetch_pgid" =~ ^[0-9]+$ ]] && kill -0 "$fetch_pgid" 2>/dev/null; then
    fetch_command="$(process_command "$fetch_pgid")"
  fi
  if [[ "$helper_was_alive" -eq 1 && "$fetch_command" == *git* &&
        "$fetch_command" == *fetch* && "$fetch_command" == *"$REPO_ROOT"* ]] &&
     kill -0 -- "-$fetch_pgid" 2>/dev/null; then
    kill -TERM -- "-$fetch_pgid" 2>/dev/null || true
    sleep 0.5
    kill -KILL -- "-$fetch_pgid" 2>/dev/null || true
  fi
  auto_fetch_pid=""
  rm -f "$auto_fetch_result_file" "$auto_fetch_result_file.tmp."* \
    "$auto_fetch_pgid_file" "$auto_fetch_pgid_file.tmp."* 2>/dev/null || true
}

register_fetch_failure() {
  local detail="$1"
  local multiplier backoff jitter_max jitter
  auto_fetch_failures=$(( auto_fetch_failures + 1 ))
  case "$auto_fetch_failures" in
    1) multiplier=2 ;;
    2) multiplier=4 ;;
    *) multiplier=8 ;;
  esac
  backoff=$(( AUTO_UPDATE_INTERVAL_SECONDS * multiplier ))
  [[ "$backoff" -gt 900 ]] && backoff=900
  jitter_max=$(( backoff / 5 ))
  [[ "$jitter_max" -lt 2 ]] && jitter_max=2
  jitter=$(( RANDOM % jitter_max ))
  schedule_auto_check $(( backoff + jitter ))
  set_auto_state fetch-error "fetch failed; retry after about ${backoff}s" "$detail"
}

complete_auto_fetch() {
  local fetch_rc="$1"
  local fetch_timed_out="$2"
  local fetch_error="$3"
  local now stable_for observed_local observed_remote observed_ref
  local final_local final_remote final_ref new_head

  auto_last_check_epoch="$(date +%s)"
  if [[ "$fetch_rc" -ne 0 ]]; then
    if [[ "$fetch_timed_out" == "1" ]]; then
      register_fetch_failure "fetch timeout"
    else
      register_fetch_failure "${fetch_error:-exit=$fetch_rc}"
    fi
    return 1
  fi
  auto_fetch_failures=0

  get_auto_git_state
  if [[ "$GIT_SAFE" -ne 1 ]]; then
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
    set_auto_state "$GIT_STATE" "$GIT_MESSAGE" "$GIT_STATE_ERROR"
    return 1
  fi
  auto_local_head="$GIT_LOCAL_HEAD"
  auto_remote_head="$GIT_REMOTE_HEAD"

  if [[ "$GIT_AHEAD" -gt 0 && "$GIT_BEHIND" -gt 0 ]]; then
    auto_candidate_sha=""
    auto_candidate_since_epoch=""
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
    set_auto_state blocked-diverged "local and $GIT_UPSTREAM diverged (ahead=$GIT_AHEAD, behind=$GIT_BEHIND)"
    return 1
  fi
  if [[ "$GIT_AHEAD" -gt 0 ]]; then
    auto_candidate_sha=""
    auto_candidate_since_epoch=""
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
    set_auto_state blocked-ahead "local branch is ahead of $GIT_UPSTREAM by $GIT_AHEAD commit(s)"
    return 1
  fi
  if [[ "$GIT_BEHIND" -eq 0 ]]; then
    auto_candidate_sha=""
    auto_candidate_since_epoch=""
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
    set_auto_state up-to-date "already current: ${GIT_LOCAL_HEAD:0:8}"
    return 1
  fi

  now="$(date +%s)"
  if [[ "$auto_candidate_sha" != "$GIT_REMOTE_HEAD" ]]; then
    auto_candidate_sha="$GIT_REMOTE_HEAD"
    auto_candidate_since_epoch="$now"
    schedule_auto_check_soon
    set_auto_state stabilizing "found $GIT_BEHIND new commit(s); waiting ${AUTO_UPDATE_STABLE_SECONDS}s for ${GIT_REMOTE_HEAD:0:8} to stabilize"
    return 1
  fi
  stable_for=$(( now - auto_candidate_since_epoch ))
  if [[ "$stable_for" -lt "$AUTO_UPDATE_STABLE_SECONDS" ]]; then
    schedule_auto_check_soon
    set_auto_state stabilizing "candidate ${GIT_REMOTE_HEAD:0:8} stable ${stable_for}s/${AUTO_UPDATE_STABLE_SECONDS}s"
    return 1
  fi

  if ! test_candidate_supervisor "$auto_candidate_sha"; then
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
    set_auto_state candidate-invalid "$CANDIDATE_MESSAGE" "$CANDIDATE_ERROR"
    return 1
  fi
  if ! test_runtime_idle; then
    schedule_auto_check_soon
    set_auto_state waiting-for-idle "$RUNTIME_MESSAGE" "$RUNTIME_ERROR"
    return 1
  fi

  observed_local="$GIT_LOCAL_HEAD"
  observed_remote="$GIT_REMOTE_HEAD"
  observed_ref="$GIT_REMOTE_REF"
  get_auto_git_state
  if [[ "$GIT_SAFE" -ne 1 || "$GIT_LOCAL_HEAD" != "$observed_local" ||
        "$GIT_REMOTE_HEAD" != "$auto_candidate_sha" || "$GIT_AHEAD" -ne 0 || "$GIT_BEHIND" -le 0 ]]; then
    schedule_auto_check_soon
    set_auto_state state-changed "repository state changed before apply; checking again"
    return 1
  fi

  stop_frontend
  if ! test_runtime_idle; then
    start_frontend || true
    schedule_auto_check_soon
    set_auto_state waiting-for-idle "new work appeared before apply: $RUNTIME_MESSAGE" "$RUNTIME_ERROR"
    return 1
  fi

  # Close the final concurrent-edit window after Vite has stopped.
  get_auto_git_state
  final_local="$GIT_LOCAL_HEAD"
  final_remote="$GIT_REMOTE_HEAD"
  final_ref="$GIT_REMOTE_REF"
  if [[ "$GIT_SAFE" -ne 1 || "$final_local" != "$observed_local" ||
        "$final_remote" != "$observed_remote" || "$final_ref" != "$observed_ref" ||
        "$GIT_AHEAD" -ne 0 || "$GIT_BEHIND" -le 0 ]]; then
    start_frontend || true
    schedule_auto_check_soon
    set_auto_state state-changed "repository state changed immediately before fast-forward"
    return 1
  fi

  # Merge the immutable SHA that passed the stable-window, candidate-script and idle
  # gates. Another local fetch may move the remote-tracking ref after our final check;
  # merging the ref name here would otherwise promote an unvalidated newer commit.
  git_capture merge --ff-only "$final_remote"
  if [[ "$GIT_RC" -ne 0 ]]; then
    start_frontend || true
    schedule_auto_check "$AUTO_UPDATE_INTERVAL_SECONDS"
    set_auto_state merge-error "fast-forward failed; old services continue" "$GIT_ERROR"
    return 1
  fi
  git_capture rev-parse HEAD
  if [[ "$GIT_RC" -ne 0 ]]; then
    auto_update_relaunch_requested=1
    set_auto_state state-changed-after-merge \
      "validated fast-forward applied, but final HEAD could not be read; reloading safely" "$GIT_ERROR"
    return 0
  fi
  new_head="$GIT_OUTPUT"
  if [[ "$new_head" != "$final_remote" ]]; then
    # Do not reset a concurrent local commit. The validated SHA was merged by value,
    # and a reload is now safer than trying to keep old processes against a changed tree.
    auto_local_head="$new_head"
    auto_update_relaunch_requested=1
    set_auto_state state-changed-after-merge \
      "validated SHA ${final_remote:0:8} was applied, then HEAD changed concurrently to ${new_head:0:8}; reloading without reset"
    return 0
  fi
  auto_local_head="$new_head"
  auto_update_relaunch_requested=1
  set_auto_state restarting "fast-forwarded ${observed_local:0:8} -> ${new_head:0:8}; reloading full stack"
  return 0
}

poll_async_fetch() {
  local now parsed fetch_rc fetch_timed fetch_error
  if [[ -f "$auto_fetch_result_file" ]]; then
    wait "$auto_fetch_pid" 2>/dev/null || true
    auto_fetch_pid=""
    rm -f "$auto_fetch_pgid_file"
    parsed="$("$PYTHON_CMD" - "$auto_fetch_result_file" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)
error = str(data.get("stderr") or "").replace("\r", " ").replace("\n", " ")
print(int(data.get("exitCode", -1)))
print("1" if data.get("timedOut") else "0")
print(error)
PY
)"
    fetch_rc="$(printf '%s\n' "$parsed" | sed -n '1p')"
    fetch_timed="$(printf '%s\n' "$parsed" | sed -n '2p')"
    fetch_error="$(printf '%s\n' "$parsed" | sed -n '3p')"
    rm -f "$auto_fetch_result_file"
    [[ "$fetch_rc" =~ ^-?[0-9]+$ ]] || fetch_rc=-1
    complete_auto_fetch "$fetch_rc" "$fetch_timed" "$fetch_error"
    return $?
  fi

  now="$(date +%s)"
  if [[ -n "$auto_fetch_started_epoch" && $(( now - auto_fetch_started_epoch )) -gt 50 ]]; then
    stop_async_fetch
    register_fetch_failure "fetch helper timed out"
  fi
  return 1
}

update_auto_update() {
  local now
  [[ "$AUTO_UPDATE_ENABLED" -eq 1 ]] || return 1
  if [[ -n "$auto_fetch_pid" ]]; then
    poll_async_fetch
    return $?
  fi
  now="$(date +%s)"
  [[ "$now" -ge "$auto_next_check_epoch" ]] || return 1
  start_async_fetch
  return 1
}

stop_http_control() {
  local deadline
  if pid_is_running_non_zombie "$http_pid"; then
    kill -TERM "$http_pid" 2>/dev/null || true
    deadline=$(( $(date +%s) + 2 ))
    while pid_is_running_non_zombie "$http_pid" && [[ "$(date +%s)" -lt "$deadline" ]]; do
      sleep 0.1
    done
    if pid_is_running_non_zombie "$http_pid"; then
      kill -KILL "$http_pid" 2>/dev/null || true
      deadline=$(( $(date +%s) + 1 ))
      while pid_is_running_non_zombie "$http_pid" && [[ "$(date +%s)" -lt "$deadline" ]]; do
        sleep 0.1
      done
    fi
  fi
  if [[ -n "$http_pid" ]] && ! pid_is_running_non_zombie "$http_pid"; then
    wait "$http_pid" 2>/dev/null || true
  elif [[ -n "$http_pid" ]]; then
    echo "[supervisor] WARN: HTTP control PID=$http_pid did not exit after SIGKILL" >&2
  fi
  http_pid=""
  rm -f "$HTTP_READY_FILE" "$RESTART_FILE" "$FULL_RELOAD_FILE"
}

monitor_auxiliary_services() {
  local now
  now="$(date +%s)"

  if ! pid_is_running_non_zombie "$http_pid"; then
    [[ -n "$http_pid" ]] && wait "$http_pid" 2>/dev/null || true
    http_pid=""
    echo "[supervisor] HTTP control process exited; stopping worker to avoid unsupervised operation" >&2
    return 1
  fi

  if [[ -n "$visitor_pid" ]] && ! process_group_is_alive "$visitor_pid"; then
    wait "$visitor_pid" 2>/dev/null || true
    visitor_pid=""
    visitor_restart_pending=1
    visitor_restart_not_before=$(( now + 5 ))
    echo "[supervisor] visitor-analysis sidecar exited; scheduling restart"
  fi
  if [[ "$visitor_restart_pending" -eq 1 && "$now" -ge "$visitor_restart_not_before" ]]; then
    visitor_restart_pending=0
    start_visitor_analysis_sidecar
  fi

  if [[ "$TOOLBOX_WHISPER_MODE" == "asr-service" ]]; then
    if [[ -n "$asr_pid" ]] && ! process_group_is_alive "$asr_pid"; then
      wait "$asr_pid" 2>/dev/null || true
      asr_pid=""
      asr_restart_pending=1
      asr_restart_not_before=$(( now + 5 ))
      echo "[supervisor] faster-whisper sidecar exited; scheduling restart"
    fi
    if [[ "$asr_restart_pending" -eq 1 && "$now" -ge "$asr_restart_not_before" ]]; then
      asr_restart_pending=0
      start_faster_whisper_sidecar
    fi
  fi

  if [[ -n "$studio_pid" ]] && ! process_group_is_alive "$studio_pid"; then
    wait "$studio_pid" 2>/dev/null || true
    studio_pid=""
    clear_studio_owner
  fi
  return 0
}

cleanup_worker() {
  local stop_mode keep_studio=0
  [[ "$cleanup_started" -eq 0 ]] || return 0
  cleanup_started=1
  echo "[supervisor] shutting down managed services..."
  stop_async_fetch
  stop_http_control
  stop_frontend
  stop_backend
  [[ -n "$visitor_pid" ]] && stop_process_group "$visitor_pid" 5
  [[ -n "$asr_pid" ]] && stop_process_group "$asr_pid" 5
  visitor_pid=""
  asr_pid=""
  stop_mode="$(cat "$STOP_REQUEST_FILE" 2>/dev/null || true)"
  if [[ "$auto_update_relaunch_requested" -eq 1 || "$stop_mode" == "keep-studio" ]]; then
    keep_studio=1
  fi
  if [[ "$keep_studio" -eq 0 ]]; then
    if [[ -n "$studio_pid" ]]; then
      stop_process_group "$studio_pid" 5
      studio_pid=""
    fi
    clear_studio_owner
  fi

  if [[ "$auto_update_relaunch_requested" -eq 1 ]]; then
    stop_port_holders "$BACKEND_PORT"
    stop_port_holders "$FRONTEND_PORT"
    stop_port_holders "$SIDECAR_PORT"
    stop_port_holders "$VISITOR_ANALYSIS_PORT"
    stop_port_holders "$BROWSER_SERVICE_PORT"
    if [[ "$TOOLBOX_WHISPER_MODE" == "asr-service" ]]; then
      stop_port_holders "$ASR_PORT"
    fi
  fi
  write_status
}

trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
trap cleanup_worker EXIT

write_status
if ! start_http_control; then
  exit 1
fi
echo "[supervisor] HTTP control http://$HTTP_HOST:$HTTP_PORT/ (POST /restart|/reload|/full-reload, GET /status)"
echo "[supervisor] repo=$REPO_ROOT mvn=$MVN_CMD java=$JAVA_CMD"
echo "[supervisor] whisper mode=$TOOLBOX_WHISPER_MODE"
if [[ "$JAVA_AUTO_UPDATE_ENABLED" -eq 1 ]]; then
  echo "[auto-update] Java scheduler enabled: source=$AUTO_UPDATE_REMOTE/$AUTO_UPDATE_BRANCH, check=${AUTO_UPDATE_INTERVAL_SECONDS}s, stable=${AUTO_UPDATE_STABLE_SECONDS}s, requireIdle=$AUTO_UPDATE_REQUIRE_IDLE"
else
  echo "[auto-update] Java scheduler explicitly disabled (TOOLBOX_AUTO_UPDATE_ENABLED=false)"
fi

initialize_node_dependencies
start_visitor_analysis_sidecar
start_faster_whisper_sidecar
start_agentscope_studio
start_backend
start_frontend || true

while true; do
  if ! bootstrap_owner_is_alive ||
     [[ "$(read_owner_value bootstrap_pid "$LOCK_FILE")" != "$BOOTSTRAP_PID" ]] ||
     [[ "$(read_owner_value nonce "$LOCK_FILE")" != "$BOOTSTRAP_NONCE" ]]; then
    echo "[supervisor-worker] bootstrap identity/instance lock disappeared; stopping managed services" >&2
    exit 1
  fi

  if ! monitor_auxiliary_services; then
    exit 1
  fi

  if [[ -f "$FULL_RELOAD_FILE" ]]; then
    rm -f "$FULL_RELOAD_FILE"
    auto_update_relaunch_requested=1
    echo "[supervisor] $(date '+%H:%M:%S') full reload received; reloading the full stack"
    break
  fi

  if [[ -f "$RESTART_FILE" ]]; then
    rm -f "$RESTART_FILE"
    echo "[supervisor] $(date '+%H:%M:%S') /restart received"
    stop_backend
    if [[ "$TOOLBOX_WHISPER_MODE" == "asr-service" ]]; then
      [[ -n "$asr_pid" ]] && stop_process_group "$asr_pid" 5
      asr_pid=""
      stop_port_holders "$ASR_PORT"
      start_faster_whisper_sidecar
    fi
    start_backend
  fi

  if ! process_group_is_alive "$backend_pid"; then
    echo "[supervisor] $(date '+%H:%M:%S') backend exited; restart after 2s"
    [[ -n "$backend_pid" ]] && wait "$backend_pid" 2>/dev/null || true
    backend_pid=""
    write_status
    sleep 2
    start_backend
  fi
  if ! process_group_is_alive "$frontend_pid"; then
    echo "[supervisor] $(date '+%H:%M:%S') frontend exited; restart after 2s"
    [[ -n "$frontend_pid" ]] && wait "$frontend_pid" 2>/dev/null || true
    frontend_pid=""
    sleep 2
    start_frontend || true
  fi
  write_status
  sleep 1
done

exit "$AUTO_UPDATE_RELAUNCH_EXIT_CODE"
