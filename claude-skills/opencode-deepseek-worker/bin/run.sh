#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../scripts/lib.sh
source "${WORKER_DIR}/scripts/lib.sh"

main() {
  local repo="" task_file="" base_ref="HEAD" write_scope="" validation=""
  local model="${OPENCODE_DEEPSEEK_MODEL:-deepseek/deepseek-v4-pro}"
  local keep="false"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo)
        repo="${2:-}"
        shift 2
        ;;
      --task)
        task_file="${2:-}"
        shift 2
        ;;
      --base)
        base_ref="${2:-}"
        shift 2
        ;;
      --write-scope|--write-set)
        write_scope="${2:-}"
        shift 2
        ;;
      --validation)
        validation="${2:-}"
        shift 2
        ;;
      --model)
        model="${2:-}"
        shift 2
        ;;
      --keep)
        keep="true"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done

  [ -n "$repo" ] || die "--repo is required"
  git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || die "--repo must point to a git repository"
  [ -n "$task_file" ] || die "--task is required"
  [ -f "$task_file" ] || die "--task file does not exist: $task_file"
  [ -n "$write_scope" ] || die "--write-scope is required"

  command -v opencode >/dev/null 2>&1 || die "opencode is not available on PATH"
  command -v git >/dev/null 2>&1 || die "git is not available on PATH"

  local task_id worker_root worktree result_file
  task_id="$(make_task_id)"
  worker_root="${TMPDIR:-/tmp}/opencode-deepseek-worker/${task_id}"
  worktree="${worker_root}/worktree"
  result_file="${worker_root}/result.json"

  mkdir -p "$worker_root"
  prepare_profile "$worker_root" "$task_file" "$write_scope" "$validation"
  prepare_worktree "$repo" "$worktree" "$base_ref"

  local opencode_exit=0
  run_opencode_worker "$worker_root" "$worktree" "$model" || opencode_exit=$?

  local guard_status="success"
  local guard_output=""
  if ! guard_output="$(enforce_write_scope "$worktree" "$write_scope" 2>&1)"; then
    guard_status="rejected"
  fi

  local validation_exit=0
  local validation_output=""
  if [ -n "$validation" ] && [ "$guard_status" = "success" ]; then
    set +e
    validation_output="$(run_validation "$worktree" "$validation" 2>&1)"
    validation_exit=$?
    set -e
  fi

  collect_result \
    "$result_file" \
    "$worker_root" \
    "$worktree" \
    "$guard_status" \
    "$opencode_exit" \
    "$guard_output" \
    "$validation" \
    "$validation_exit" \
    "$validation_output"

  cat "$result_file"
  printf '\n'

  if [ "$keep" != "true" ]; then
    cleanup_worktree "$repo" "$worktree" "$worker_root"
  fi
}

usage() {
  cat <<'EOF'
Usage:
  run.sh --repo <repo> --task <task.md> --write-scope <paths> [options]

Options:
  --base <ref>          Base ref for the worker worktree. Default: HEAD
  --write-scope <paths> Comma-separated files, directories, or glob patterns.
                        Directories may be written as src/auth or src/auth/.
                        --write-set is kept as a backward-compatible alias.
  --validation <cmd>    Validation command to run inside the worker worktree
  --model <id>          OpenCode model id. Default: OPENCODE_DEEPSEEK_MODEL or deepseek/deepseek-v4-pro
  --keep                Keep temporary worker files for debugging
EOF
}

main "$@"
