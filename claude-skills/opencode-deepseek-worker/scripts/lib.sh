#!/usr/bin/env bash

die() {
  printf 'opencode-deepseek: %s\n' "$*" >&2
  exit 1
}

make_task_id() {
  printf '%s-%s' "$(date +%Y%m%d%H%M%S)" "$$"
}

prepare_profile() {
  local worker_root="$1"
  local task_file="$2"
  local write_scope="$3"
  local validation="$4"

  mkdir -p \
    "$worker_root/xdg/config/opencode" \
    "$worker_root/xdg/data/opencode" \
    "$worker_root/xdg/cache/opencode" \
    "$worker_root/xdg/state/opencode" \
    "$worker_root/profile"

  cp "$WORKER_DIR/config/opencode.worker.json" "$worker_root/profile/opencode.json"
  cp "$WORKER_DIR/worker-system.md" "$worker_root/profile/worker-system.md"
  cp "$task_file" "$worker_root/task.md"

  {
    printf '# Worker Task Capsule\n\n'
    printf '## Allowed Write Scope\n\n'
    printf '%s\n' "$write_scope" | tr ',' '\n' | sed 's/^/- /'
    if [ -n "$validation" ]; then
      printf '\n## Validation Command\n\n```bash\n%s\n```\n' "$validation"
    fi
    printf '\n## Task\n\n'
    cat "$task_file"
  } > "$worker_root/prompt.md"

  prepare_auth "$worker_root"
}

prepare_auth() {
  local worker_root="$1"
  local auth_file="${OPENCODE_DEEPSEEK_AUTH_FILE:-$HOME/.local/share/opencode/auth.json}"

  [ -f "$auth_file" ] || return 0

  cp "$auth_file" "$worker_root/xdg/data/opencode/auth.json"
  chmod 600 "$worker_root/xdg/data/opencode/auth.json" 2>/dev/null || true
}

prepare_worktree() {
  local repo="$1"
  local worktree="$2"
  local base_ref="$3"

  git -C "$repo" worktree add --detach "$worktree" "$base_ref" >/dev/null
}

run_opencode_worker() {
  local worker_root="$1"
  local worktree="$2"
  local model="$3"
  local idle_timeout_seconds="${OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS:-${OPENCODE_DEEPSEEK_TIMEOUT_SECONDS:-180}}"

  (
    cd "$worktree"
    export XDG_CONFIG_HOME="$worker_root/xdg/config"
    export XDG_DATA_HOME="$worker_root/xdg/data"
    export XDG_CACHE_HOME="$worker_root/xdg/cache"
    export XDG_STATE_HOME="$worker_root/xdg/state"
    export OPENCODE_CONFIG="$worker_root/profile/opencode.json"
    export OPENCODE_CONFIG_DIR="$worker_root/profile"
    export OPENCODE_DISABLE_PROJECT_CONFIG=true
    export OPENCODE_DISABLE_CLAUDE_CODE=true
    export OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=true
    export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=true
    export OPENCODE_DISABLE_EXTERNAL_SKILLS=true
    export OPENCODE_DISABLE_DEFAULT_PLUGINS=true
    export PYTHONDONTWRITEBYTECODE="${PYTHONDONTWRITEBYTECODE:-1}"

    local opencode_pid
    opencode run \
      --pure \
      --format json \
      --dangerously-skip-permissions \
      --model "$model" \
      "$(cat "$worker_root/profile/worker-system.md")

$(cat "$worker_root/prompt.md")" \
      > "$worker_root/opencode.jsonl" \
      2> "$worker_root/opencode.stderr" &
    opencode_pid=$!
    monitor_opencode_worker "$worker_root" "$opencode_pid" "$idle_timeout_seconds"
  )
}

opencode_stream_size() {
  local worker_root="$1"
  local file size total=0

  for file in "$worker_root/opencode.jsonl" "$worker_root/opencode.stderr"; do
    [ -f "$file" ] || continue
    size="$(wc -c < "$file" | tr -d '[:space:]')"
    total=$((total + size))
  done

  printf '%s\n' "$total"
}

monitor_opencode_worker() {
  local worker_root="$1"
  local opencode_pid="$2"
  local idle_timeout_seconds="$3"
  local monitor_interval="${OPENCODE_DEEPSEEK_MONITOR_INTERVAL_SECONDS:-1}"
  local idle_seconds=0
  local last_size current_size

  last_size="$(opencode_stream_size "$worker_root")"

  while kill -0 "$opencode_pid" >/dev/null 2>&1; do
    sleep "$monitor_interval"
    current_size="$(opencode_stream_size "$worker_root")"

    if [ "$current_size" != "$last_size" ]; then
      last_size="$current_size"
      idle_seconds=0
      continue
    fi

    idle_seconds=$((idle_seconds + monitor_interval))
    if [ "$idle_seconds" -ge "$idle_timeout_seconds" ]; then
      kill "$opencode_pid" >/dev/null 2>&1 || true
      wait "$opencode_pid" >/dev/null 2>&1 || true
      printf 'opencode-deepseek: opencode idle timed out after %ss without stream output\n' "$idle_timeout_seconds" >> "$worker_root/opencode.stderr"
      return 124
    fi
  done

  wait "$opencode_pid"
}

normalize_path() {
  local path="$1"
  path="${path#./}"
  printf '%s' "$path"
}

changed_paths() {
  local worktree="$1"
  {
    git -C "$worktree" diff --name-only
    git -C "$worktree" ls-files --others --exclude-standard
  } | sort -u
}

collect_diff() {
  local worktree="$1"
  local untracked

  git -C "$worktree" diff
  untracked="$(git -C "$worktree" ls-files --others --exclude-standard)"
  [ -n "$untracked" ] || return 0

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    (
      cd "$worktree"
      git diff --no-index -- /dev/null "$file" || true
    )
  done <<< "$untracked"
}

scope_allows_file() {
  local worktree="$1"
  local file="$2"
  local scope="$3"

  scope="$(normalize_path "$scope")"
  [ -n "$scope" ] || return 1

  if [ "$file" = "$scope" ]; then
    return 0
  fi

  if [[ "$scope" == */ ]] && [[ "$file" == "$scope"* ]]; then
    return 0
  fi

  if [ -d "$worktree/$scope" ] && [[ "$file" == "$scope/"* ]]; then
    return 0
  fi

  case "$scope" in
    *'*'*|*'?'*|*'['*)
      if [[ "$file" == $scope ]]; then
        return 0
      fi
      ;;
  esac

  return 1
}

enforce_write_scope() {
  local worktree="$1"
  local write_scope="$2"
  local changed allowed file ok

  changed="$(changed_paths "$worktree")"
  [ -n "$changed" ] || return 0

  while IFS= read -r file; do
    file="$(normalize_path "$file")"
    ok="false"
    IFS=',' read -r -a allowed <<< "$write_scope"
    for scope in "${allowed[@]}"; do
      if scope_allows_file "$worktree" "$file" "$scope"; then
        ok="true"
        break
      fi
    done
    if [ "$ok" != "true" ]; then
      printf 'write-scope violation: %s\n' "$file"
      return 1
    fi
  done <<< "$changed"
}

enforce_write_set() {
  enforce_write_scope "$@"
}

run_validation() {
  local worktree="$1"
  local validation="$2"

  (
    cd "$worktree"
    export PYTHONDONTWRITEBYTECODE="${PYTHONDONTWRITEBYTECODE:-1}"
    bash -lc "$validation"
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
  tail -n "$max_lines" 2>/dev/null || true
}

collect_result() {
  local result_file="$1"
  local worker_root="$2"
  local worktree="$3"
  local guard_status="$4"
  local opencode_exit="$5"
  local guard_output="$6"
  local validation="$7"
  local validation_exit="$8"
  local validation_output="$9"

  local changed_files diff summary status
  changed_files="$(changed_paths "$worktree" | json_array_from_lines)"
  diff="$(collect_diff "$worktree" | json_string)"
  summary="$(cat "$worker_root/opencode.stderr" 2>/dev/null | tail_text 80 | json_string)"
  local opencode_output
  opencode_output="$(cat "$worker_root/opencode.jsonl" 2>/dev/null | tail_text 80 | json_string)"

  status="$guard_status"
  if [ "$status" = "success" ] && [ "$opencode_exit" -ne 0 ]; then
    status="failed"
  fi
  if [ "$status" = "success" ] && [ "$validation_exit" -ne 0 ]; then
    status="failed"
  fi

  cat > "$result_file" <<EOF
{
  "status": "$status",
  "worktree": $(printf '%s' "$worktree" | json_string),
  "changed_files": $changed_files,
  "diff": $diff,
  "summary": $summary,
  "opencode_output_tail": $opencode_output,
  "opencode_exit_code": $opencode_exit,
  "write_scope": {
    "status": "$guard_status",
    "output": $(printf '%s' "$guard_output" | json_string)
  },
  "validation": {
    "command": $(printf '%s' "$validation" | json_string),
    "exit_code": $validation_exit,
    "output_tail": $(printf '%s' "$validation_output" | tail_text 80 | json_string)
  }
}
EOF
}

cleanup_worktree() {
  local repo="$1"
  local worktree="$2"
  local worker_root="$3"

  git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$worker_root"
}
