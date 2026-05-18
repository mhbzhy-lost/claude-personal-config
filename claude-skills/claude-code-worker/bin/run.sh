#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=../scripts/lib.sh
source "${WORKER_DIR}/scripts/lib.sh"

main() {
  local repo="" task_file="" base_ref="HEAD" write_scope="" validation=""
  local env_file="${CLAUDE_CODE_WORKER_ENV_FILE:-${WORKER_DIR}/.env}"
  local model="${CLAUDE_CODE_WORKER_MODEL:-}"
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
      --env)
        env_file="${2:-}"
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

  [ -n "${repo}" ] || die "--repo is required"
  git -C "${repo}" rev-parse --git-dir >/dev/null 2>&1 || die "--repo must point to a git repository"
  [ -n "${task_file}" ] || die "--task is required"
  [ -f "${task_file}" ] || die "--task file does not exist: ${task_file}"
  [ -n "${write_scope}" ] || die "--write-scope is required"

  command -v claude >/dev/null 2>&1 || die "claude is not available on PATH"
  command -v git >/dev/null 2>&1 || die "git is not available on PATH"

  load_worker_env "${env_file}"
  apply_claude_safety_defaults
  validate_private_endpoint
  require_worker_auth

  if [ -z "${model}" ]; then
    model="${ANTHROPIC_MODEL:-}"
  fi
  [ -n "${model}" ] || die "model is required; set --model, CLAUDE_CODE_WORKER_MODEL, or ANTHROPIC_MODEL"

  local task_id worker_root worktree result_file
  task_id="$(make_task_id)"
  worker_root="${TMPDIR:-/tmp}/claude-code-worker/${task_id}"
  worktree="${worker_root}/worktree"
  result_file="${worker_root}/result.json"

  mkdir -p "${worker_root}/profile"
  prepare_profile "${worker_root}/profile" "${task_file}" "${write_scope}" "${validation}" "${env_file}"
  prepare_worktree "${repo}" "${worktree}" "${base_ref}"

  local claude_exit=0
  run_claude_worker "${worker_root}" "${worktree}" "${model}" || claude_exit=$?

  local guard_status="success"
  local guard_output=""
  if ! guard_output="$(enforce_write_scope "${worktree}" "${write_scope}" 2>&1)"; then
    guard_status="rejected"
  fi

  local validation_exit=0
  local validation_output=""
  if [ -n "${validation}" ] && [ "${guard_status}" = "success" ]; then
    set +e
    validation_output="$(run_validation "${worktree}" "${validation}" 2>&1)"
    validation_exit=$?
    set -e
  fi

  collect_result \
    "${result_file}" \
    "${worker_root}" \
    "${worktree}" \
    "${guard_status}" \
    "${claude_exit}" \
    "${guard_output}" \
    "${validation}" \
    "${validation_exit}" \
    "${validation_output}"

  cat "${result_file}"
  printf '\n'

  if [ "${keep}" != "true" ]; then
    cleanup_worktree "${repo}" "${worktree}" "${worker_root}"
  fi
}

usage() {
  cat <<'EOF'
Usage:
  run.sh --repo <repo> --task <task.md> --write-scope <paths> [options]

Options:
  --base <ref>          Base ref for the worker worktree. Default: HEAD
  --env <file>          Dotenv file to source. Default: CLAUDE_CODE_WORKER_ENV_FILE or skill .env
  --write-scope <paths> Comma-separated files, directories, or glob patterns.
                        Directories may be written as src/auth or src/auth/.
                        --write-set is kept as a backward-compatible alias.
  --validation <cmd>    Validation command to run inside the worker worktree
  --model <id>          Claude Code model id. Default: CLAUDE_CODE_WORKER_MODEL or ANTHROPIC_MODEL
  --keep                Keep temporary worker files for debugging
EOF
}

main "$@"
