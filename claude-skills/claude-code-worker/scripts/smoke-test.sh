#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}/claude-code-worker-smoke-$$"
REPO="${TMP_ROOT}/repo"
TASK="${TMP_ROOT}/task.md"
ENV_FILE="${CLAUDE_CODE_WORKER_ENV_FILE:-${WORKER_DIR}/.env}"

cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

if [ ! -f "${ENV_FILE}" ]; then
  echo "[skip] worker env file not found: ${ENV_FILE}"
  echo "[skip] copy .env.example to .env and configure a private endpoint first"
  exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "[skip] claude not available"
  exit 0
fi

mkdir -p "${REPO}"
git -C "${REPO}" init -q
git -C "${REPO}" config user.email smoke@example.invalid
git -C "${REPO}" config user.name "Smoke Test"
printf 'hello\n' > "${REPO}/allowed.txt"
git -C "${REPO}" add allowed.txt
git -C "${REPO}" commit -q -m "init"

printf '%s\n' \
  'Append the line "worker" to allowed.txt.' \
  'Do not edit any other file.' \
  > "${TASK}"

echo "[info] Smoke test requires a configured private Claude Code endpoint."

export CLAUDE_CODE_WORKER_IDLE_TIMEOUT_SECONDS="${CLAUDE_CODE_WORKER_IDLE_TIMEOUT_SECONDS:-180}"

"${WORKER_DIR}/bin/run.sh" \
  --repo "${REPO}" \
  --task "${TASK}" \
  --env "${ENV_FILE}" \
  --write-scope allowed.txt \
  --validation "test -f allowed.txt" \
  --keep
