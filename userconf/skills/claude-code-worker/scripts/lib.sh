#!/usr/bin/env bash

die() {
  printf 'claude-code-worker: %s\n' "$*" >&2
  exit 1
}

make_task_id() {
  printf '%s-%s' "$(date +%Y%m%d%H%M%S)" "$$"
}

load_worker_env() {
  local env_file="$1"

  [ -f "${env_file}" ] || die "env file not found: ${env_file}"

  set -a
  # shellcheck disable=SC1090
  . "${env_file}"
  set +a
}

endpoint_host() {
  local endpoint="$1"
  local no_scheme host

  no_scheme="${endpoint#*://}"
  host="${no_scheme%%/*}"
  host="${host%%:*}"
  printf '%s' "${host}" | tr '[:upper:]' '[:lower:]'
}

validate_private_endpoint() {
  local endpoint="${ANTHROPIC_BASE_URL:-}"
  local host

  [ -n "${endpoint}" ] || die "ANTHROPIC_BASE_URL is required"

  host="$(endpoint_host "${endpoint}")"
  [ -n "${host}" ] || die "ANTHROPIC_BASE_URL host is empty"

  case "${host}" in
    anthropic.com|*.anthropic.com|claude.ai|*.claude.ai)
      die "refusing official Claude/Anthropic endpoint: ${host}"
      ;;
  esac
}

require_worker_auth() {
  if [ "${CLAUDE_CODE_WORKER_ALLOW_NO_AUTH:-}" = "1" ]; then
    return 0
  fi

  if [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    return 0
  fi

  die "set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the worker .env"
}

apply_claude_safety_defaults() {
  export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="${CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:-1}"
  export CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK="${CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK:-1}"
  export CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL="${CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL:-1}"
  export CLAUDE_CODE_SKIP_PROMPT_HISTORY="${CLAUDE_CODE_SKIP_PROMPT_HISTORY:-1}"
  export CLAUDE_CODE_DISABLE_AUTO_MEMORY="${CLAUDE_CODE_DISABLE_AUTO_MEMORY:-1}"
  export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS="${CLAUDE_CODE_DISABLE_BACKGROUND_TASKS:-1}"
  export CLAUDE_CODE_DISABLE_CLAUDE_MDS="${CLAUDE_CODE_DISABLE_CLAUDE_MDS:-1}"
  export CLAUDE_CODE_DISABLE_POLICY_SKILLS="${CLAUDE_CODE_DISABLE_POLICY_SKILLS:-1}"
  export DISABLE_AUTOUPDATER="${DISABLE_AUTOUPDATER:-1}"
  export DISABLE_UPDATES="${DISABLE_UPDATES:-1}"
  export DISABLE_TELEMETRY="${DISABLE_TELEMETRY:-1}"
  export DO_NOT_TRACK="${DO_NOT_TRACK:-1}"
  export DISABLE_LOGIN_COMMAND="${DISABLE_LOGIN_COMMAND:-1}"
  export DISABLE_LOGOUT_COMMAND="${DISABLE_LOGOUT_COMMAND:-1}"
}

prepare_profile() {
  local profile_root="$1"
  local task_file="$2"
  local write_scope="$3"
  local validation="$4"
  local env_file="$5"
  local api_key_helper=""

  mkdir -p "${profile_root}"

  cp "${WORKER_DIR}/worker-system.md" "${profile_root}/worker-system.md"
  cp "${task_file}" "${profile_root}/task.md"

  {
    printf '# Worker Task Capsule\n\n'
    printf '## Allowed Write Scope\n\n'
    printf '%s\n' "${write_scope}" | tr ',' '\n' | sed 's/^/- /'
    if [ -n "${validation}" ]; then
      printf '\n## Validation Command\n\n```bash\n%s\n```\n' "${validation}"
    fi
    printf '\n## Runtime Environment\n\n'
    printf '%s\n' "- Env file: ${env_file}"
    printf '%s\n' "- API endpoint host: $(endpoint_host "${ANTHROPIC_BASE_URL:-}")"
    printf '\n## Task\n\n'
    cat "${task_file}"
  } > "${profile_root}/prompt.md"

  if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    api_key_helper="${profile_root}/api-key-helper.sh"
    cat > "${api_key_helper}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "${ANTHROPIC_AUTH_TOKEN:?ANTHROPIC_AUTH_TOKEN is required}"
EOF
    chmod 700 "${api_key_helper}"
  fi

  {
    printf '{\n'
    if [ -n "${api_key_helper}" ]; then
      printf '  "apiKeyHelper": %s,\n' "$(printf '%s' "${api_key_helper}" | json_string)"
    fi
    cat <<'EOF'
  "disableAllHooks": true,
  "includeGitInstructions": false,
  "skipWebFetchPreflight": true,
  "cleanupPeriodDays": 1,
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
EOF
  } > "${profile_root}/settings.json"
}

prepare_worktree() {
  local repo="$1"
  local worktree="$2"
  local base_ref="$3"

  git -C "${repo}" worktree add --detach "${worktree}" "${base_ref}" >/dev/null
}

run_claude_worker() {
  local worker_root="$1"
  local worktree="$2"
  local model="$3"
  local idle_timeout_seconds="${CLAUDE_CODE_WORKER_IDLE_TIMEOUT_SECONDS:-${CLAUDE_CODE_WORKER_TIMEOUT_SECONDS:-300}}"

  [ -n "${model}" ] || die "model is required; set --model, CLAUDE_CODE_WORKER_MODEL, or ANTHROPIC_MODEL"

  (
    cd "${worktree}"
    export HOME="${worker_root}/home"
    export XDG_CONFIG_HOME="${worker_root}/xdg/config"
    export XDG_DATA_HOME="${worker_root}/xdg/data"
    export XDG_CACHE_HOME="${worker_root}/xdg/cache"
    export XDG_STATE_HOME="${worker_root}/xdg/state"
    export CLAUDE_CONFIG_DIR="${worker_root}/claude-config"
    export TMPDIR="${worker_root}/tmp"
    export PYTHONDONTWRITEBYTECODE="${PYTHONDONTWRITEBYTECODE:-1}"

    mkdir -p \
      "${HOME}" \
      "${XDG_CONFIG_HOME}" \
      "${XDG_DATA_HOME}" \
      "${XDG_CACHE_HOME}" \
      "${XDG_STATE_HOME}" \
      "${CLAUDE_CONFIG_DIR}" \
      "${TMPDIR}"

    local claude_pid
    claude \
      --print \
      --output-format stream-json \
      --bare \
      --no-session-persistence \
      --disable-slash-commands \
      --strict-mcp-config \
      --mcp-config '{}' \
      --settings "${worker_root}/profile/settings.json" \
      --dangerously-skip-permissions \
      --model "${model}" \
      "$(cat "${worker_root}/profile/worker-system.md")

$(cat "${worker_root}/profile/prompt.md")" \
      > "${worker_root}/claude.jsonl" \
      2> "${worker_root}/claude.stderr" &
    claude_pid=$!
    monitor_claude_worker "${worker_root}" "${claude_pid}" "${idle_timeout_seconds}"
  )
}

claude_stream_size() {
  local worker_root="$1"
  local file size total=0

  for file in "${worker_root}/claude.jsonl" "${worker_root}/claude.stderr"; do
    [ -f "${file}" ] || continue
    size="$(wc -c < "${file}" | tr -d '[:space:]')"
    total=$((total + size))
  done

  printf '%s\n' "${total}"
}

monitor_claude_worker() {
  local worker_root="$1"
  local claude_pid="$2"
  local idle_timeout_seconds="$3"
  local monitor_interval="${CLAUDE_CODE_WORKER_MONITOR_INTERVAL_SECONDS:-1}"
  local idle_seconds=0
  local last_size current_size

  last_size="$(claude_stream_size "${worker_root}")"

  while kill -0 "${claude_pid}" >/dev/null 2>&1; do
    sleep "${monitor_interval}"
    current_size="$(claude_stream_size "${worker_root}")"

    if [ "${current_size}" != "${last_size}" ]; then
      last_size="${current_size}"
      idle_seconds=0
      continue
    fi

    idle_seconds=$((idle_seconds + monitor_interval))
    if [ "${idle_seconds}" -ge "${idle_timeout_seconds}" ]; then
      kill "${claude_pid}" >/dev/null 2>&1 || true
      wait "${claude_pid}" >/dev/null 2>&1 || true
      printf 'claude-code-worker: claude idle timed out after %ss without stream output\n' "${idle_timeout_seconds}" >> "${worker_root}/claude.stderr"
      return 124
    fi
  done

  wait "${claude_pid}"
}

normalize_path() {
  local file_path="$1"
  file_path="${file_path#./}"
  printf '%s' "${file_path}"
}

changed_paths() {
  local worktree="$1"
  {
    git -C "${worktree}" diff --name-only
    git -C "${worktree}" ls-files --others --exclude-standard
  } | sort -u
}

collect_diff() {
  local worktree="$1"
  local untracked

  git -C "${worktree}" diff
  untracked="$(git -C "${worktree}" ls-files --others --exclude-standard)"
  [ -n "${untracked}" ] || return 0

  while IFS= read -r file; do
    [ -n "${file}" ] || continue
    (
      cd "${worktree}"
      git diff --no-index -- /dev/null "${file}" || true
    )
  done <<< "${untracked}"
}

scope_allows_file() {
  local worktree="$1"
  local file="$2"
  local scope="$3"

  scope="$(normalize_path "${scope}")"
  [ -n "${scope}" ] || return 1

  if [ "${file}" = "${scope}" ]; then
    return 0
  fi

  if [[ "${scope}" == */ ]] && [[ "${file}" == "${scope}"* ]]; then
    return 0
  fi

  if [ -d "${worktree}/${scope}" ] && [[ "${file}" == "${scope}/"* ]]; then
    return 0
  fi

  case "${scope}" in
    *'*'*|*'?'*|*'['*)
      if [[ "${file}" == ${scope} ]]; then
        return 0
      fi
      ;;
  esac

  return 1
}

enforce_write_scope() {
  local worktree="$1"
  local write_scope="$2"
  local changed allowed file ok scope

  changed="$(changed_paths "${worktree}")"
  [ -n "${changed}" ] || return 0

  while IFS= read -r file; do
    file="$(normalize_path "${file}")"
    ok="false"
    IFS=',' read -r -a allowed <<< "${write_scope}"
    for scope in "${allowed[@]}"; do
      if scope_allows_file "${worktree}" "${file}" "${scope}"; then
        ok="true"
        break
      fi
    done
    if [ "${ok}" != "true" ]; then
      printf 'write-scope violation: %s\n' "${file}"
      return 1
    fi
  done <<< "${changed}"
}

run_validation() {
  local worktree="$1"
  local validation="$2"

  (
    cd "${worktree}"
    export PYTHONDONTWRITEBYTECODE="${PYTHONDONTWRITEBYTECODE:-1}"
    bash -lc "${validation}"
  )
}

json_string() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

json_array_from_lines() {
  python3 -c 'import json,sys; print(json.dumps([line.rstrip("\n") for line in sys.stdin if line.rstrip("\n")]))'
}

tail_text() {
  local max_lines="${1:-80}"
  tail -n "${max_lines}" 2>/dev/null || true
}

collect_result() {
  local result_file="$1"
  local worker_root="$2"
  local worktree="$3"
  local guard_status="$4"
  local claude_exit="$5"
  local guard_output="$6"
  local validation="$7"
  local validation_exit="$8"
  local validation_output="$9"

  local changed_files diff summary status claude_output
  changed_files="$(changed_paths "${worktree}" | json_array_from_lines)"
  diff="$(collect_diff "${worktree}" | json_string)"
  summary="$(cat "${worker_root}/claude.stderr" 2>/dev/null | tail_text 80 | json_string)"
  claude_output="$(cat "${worker_root}/claude.jsonl" 2>/dev/null | tail_text 80 | json_string)"

  status="${guard_status}"
  if [ "${status}" = "success" ] && [ "${claude_exit}" -ne 0 ]; then
    status="failed"
  fi
  if [ "${status}" = "success" ] && [ "${validation_exit}" -ne 0 ]; then
    status="failed"
  fi

  cat > "${result_file}" <<EOF
{
  "status": "${status}",
  "worktree": $(printf '%s' "${worktree}" | json_string),
  "changed_files": ${changed_files},
  "diff": ${diff},
  "summary": ${summary},
  "claude_output_tail": ${claude_output},
  "claude_exit_code": ${claude_exit},
  "write_scope": {
    "status": "${guard_status}",
    "output": $(printf '%s' "${guard_output}" | json_string)
  },
  "validation": {
    "command": $(printf '%s' "${validation}" | json_string),
    "exit_code": ${validation_exit},
    "output_tail": $(printf '%s' "${validation_output}" | tail_text 80 | json_string)
  }
}
EOF
}

cleanup_worktree() {
  local repo="$1"
  local worktree="$2"
  local worker_root="$3"

  git -C "${repo}" worktree remove --force "${worktree}" >/dev/null 2>&1 || true
  rm -rf "${worker_root}"
}
