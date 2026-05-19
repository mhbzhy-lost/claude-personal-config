#!/usr/bin/env bash
# runner.sh — executable skill wrapper
# Skill: maestro-cli
# Tool check: which maestro
# Validated against base digest: sha256:f9c6a2fd2ddbc23e336b6257a5245e31f996953ef06cd13a59fa0a1df2d5c252
#
# Template substitution contract:
# - maestro-cli       : alphanumeric + hyphens; injected raw
# - which maestro       : bash expression run via `bash -c '...'`;
#                          substitution must escape `'` but may contain
#                          $/`/" safely inside single quotes
# - sha256:f9c6a2fd2ddbc23e336b6257a5245e31f996953ef06cd13a59fa0a1df2d5c252 : sha256:... string; injected raw (40+8 hex chars)
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
SANDBOX="${CLAUDE_SKILL_SANDBOX:-claude-skill-sandbox}"
BASE_IMAGE="${CLAUDE_SKILL_BASE:-debian:12-slim}"
STATE_VOL="${CLAUDE_SKILL_STATE_VOL:-claude-skill-state}"

# Translate a host path under $HOME to its /host_home/* equivalent.
# Returns 1 if path is outside $HOME (caller falls back to copy-in/cp-out).
to_in_container_path() {
  local p="$1"
  case "$p" in
    "$HOME") printf '%s' '/host_home' ;;
    "$HOME"/*) printf '/host_home%s' "${p#"$HOME"}" ;;
    *) return 1 ;;
  esac
}

# Translate host's proxy URL (typically 127.0.0.1) to container-reachable
# host.docker.internal — required because container's localhost is its own
# loopback, not the host's. Empty input → empty output.
translate_proxy_url() {
  local p="${1:-}"
  [ -z "$p" ] && return 0
  printf '%s' "$p" | sed -E 's|://(127\.0\.0\.1\|::1\|localhost)([:/]\|$)|://host.docker.internal\2|g'
}

# Collect proxy env from host shell, translate to container-reachable URLs.
# Outputs `-e VAR=val` flags ready for docker run / exec.
collect_proxy_args() {
  local args=()
  local var v
  for var in http_proxy https_proxy ftp_proxy no_proxy HTTP_PROXY HTTPS_PROXY FTP_PROXY NO_PROXY ALL_PROXY all_proxy; do
    v="${!var:-}"
    [ -z "$v" ] && continue
    case "$var" in
      no_proxy|NO_PROXY) ;;  # passthrough as-is
      *) v=$(translate_proxy_url "$v") ;;
    esac
    args+=("-e" "$var=$v")
  done
  printf '%s\n' "${args[@]:-}"
}

# 0. Preflight
docker info >/dev/null 2>&1 || {
  echo "[claude-skill] docker daemon not reachable. Start Docker Desktop and retry." >&2
  exit 2
}

# 1. 容器懒创建（含 proxy 透传）
if ! docker ps -a --format '{{.Names}}' | grep -q "^${SANDBOX}$"; then
  docker volume create "$STATE_VOL" >/dev/null
  PROXY_ARGS=()
  while IFS= read -r line; do
    [ -n "$line" ] && PROXY_ARGS+=("$line")
  done < <(collect_proxy_args)
  docker run -d --name "$SANDBOX" --restart=unless-stopped \
    --mount type=volume,source="$STATE_VOL",target=/state \
    --mount type=bind,source="$HOME",target=/host_home \
    ${PROXY_ARGS[@]+"${PROXY_ARGS[@]}"} \
    "$BASE_IMAGE" sleep infinity >/dev/null
fi

# 2. 容器停止时启动
if ! docker ps --format '{{.Names}}' | grep -q "^${SANDBOX}$"; then
  docker start "$SANDBOX" >/dev/null
fi

# 3. Drift 检测（不阻断）
CURRENT=$(docker image inspect "$BASE_IMAGE" --format '{{.Id}}' 2>/dev/null || echo "")
if [ -n "$CURRENT" ] && [ "$CURRENT" != "sha256:f9c6a2fd2ddbc23e336b6257a5245e31f996953ef06cd13a59fa0a1df2d5c252" ]; then
  echo "[claude-skill] base image drifted from validated digest. If scripts misbehave, run claude-skill-sandbox validate maestro-cli" >&2
fi

# 4. 工具懒装入
if ! docker exec "$SANDBOX" bash -c 'which maestro' >/dev/null 2>&1; then
  docker exec -e DEBIAN_FRONTEND=noninteractive "$SANDBOX" bash "$(to_in_container_path "$SKILL_DIR")/install.sh"
fi

# 5. cwd 翻译
if IN_CWD=$(to_in_container_path "$PWD"); then
  CLEANUP=""
else
  echo "[claude-skill] \$PWD outside \$HOME, using copy-in/cp-out fallback" >&2
  TMPID=$(uuidgen 2>/dev/null | tr -d '-' | head -c 12 || date +%s%N)
  IN_CWD="/tmp/work-$TMPID"
  docker exec "$SANDBOX" mkdir -p "$IN_CWD"
  docker cp "$PWD/." "$SANDBOX:$IN_CWD/"
  CLEANUP='docker cp "$SANDBOX:$IN_CWD/." "$PWD/" 2>/dev/null; docker exec "$SANDBOX" rm -rf "$IN_CWD"'
  trap "$CLEANUP" EXIT
fi

# 6. 记录使用
docker exec "$SANDBOX" bash -c "mkdir -p /state/manifests && echo \"\$(date -Iseconds) maestro-cli\" >> /state/manifests/usage.log"

# 7. 执行
docker exec -i -w "$IN_CWD" "$SANDBOX" \
  bash "$(to_in_container_path "$SKILL_DIR")/run-impl.sh" "$@"
