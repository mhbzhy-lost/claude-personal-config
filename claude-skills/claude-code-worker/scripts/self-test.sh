#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib.sh
source "${WORKER_DIR}/scripts/lib.sh"

TMP_ROOT="${TMPDIR:-/tmp}/claude-code-worker-self-test-$$"

cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

fail() {
  printf '[fail] %s\n' "$*" >&2
  exit 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local label="$3"

  if [ "${expected}" != "${actual}" ]; then
    fail "${label}: expected '${expected}', got '${actual}'"
  fi
}

assert_fails() {
  local label="$1"
  shift

  if ( "$@" ) >/dev/null 2>&1; then
    fail "${label}: expected failure"
  fi
}

mkdir -p "${TMP_ROOT}"

ENV_FILE="${TMP_ROOT}/worker.env"
printf '%s\n' \
  'ANTHROPIC_BASE_URL=https://gateway.example.test/anthropic' \
  'ANTHROPIC_API_KEY=test-key' \
  'ANTHROPIC_MODEL=custom-model' \
  'CLAUDE_CODE_EFFORT_LEVEL=max' \
  > "${ENV_FILE}"

load_worker_env "${ENV_FILE}"
assert_eq "https://gateway.example.test/anthropic" "${ANTHROPIC_BASE_URL}" "loads ANTHROPIC_BASE_URL"
assert_eq "test-key" "${ANTHROPIC_API_KEY}" "loads ANTHROPIC_API_KEY"
assert_eq "custom-model" "${ANTHROPIC_MODEL}" "loads ANTHROPIC_MODEL"
assert_eq "max" "${CLAUDE_CODE_EFFORT_LEVEL}" "loads optional Claude env"

validate_private_endpoint

ANTHROPIC_BASE_URL=""
assert_fails "rejects missing endpoint" validate_private_endpoint

ANTHROPIC_BASE_URL="https://api.anthropic.com"
assert_fails "rejects official Anthropic API" validate_private_endpoint

ANTHROPIC_BASE_URL="https://claude.ai/api"
assert_fails "rejects Claude.ai endpoint" validate_private_endpoint

ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
validate_private_endpoint

PROFILE_ROOT="${TMP_ROOT}/profile"
TASK_FILE="${TMP_ROOT}/task.md"
printf 'Edit allowed.txt only.\n' > "${TASK_FILE}"
prepare_profile "${PROFILE_ROOT}" "${TASK_FILE}" "allowed.txt" "test -f allowed.txt" "${ENV_FILE}"

[ -f "${PROFILE_ROOT}/settings.json" ] || fail "settings.json was not created"
[ -f "${PROFILE_ROOT}/prompt.md" ] || fail "prompt.md was not created"
if grep -q "test-key" "${PROFILE_ROOT}/settings.json"; then
  fail "settings.json must not persist API keys"
fi

AUTH_PROFILE_ROOT="${TMP_ROOT}/auth-profile"
unset ANTHROPIC_API_KEY
export ANTHROPIC_AUTH_TOKEN="auth-token-secret"
prepare_profile "${AUTH_PROFILE_ROOT}" "${TASK_FILE}" "allowed.txt" "" "${ENV_FILE}"
[ -x "${AUTH_PROFILE_ROOT}/api-key-helper.sh" ] || fail "api-key-helper.sh was not created for ANTHROPIC_AUTH_TOKEN"
assert_eq "auth-token-secret" "$("${AUTH_PROFILE_ROOT}/api-key-helper.sh")" "api-key-helper emits auth token"
if grep -q "auth-token-secret" "${AUTH_PROFILE_ROOT}/settings.json"; then
  fail "settings.json must not persist auth tokens"
fi
ANTHROPIC_API_KEY="test-key"
unset ANTHROPIC_AUTH_TOKEN

REPO="${TMP_ROOT}/repo"
mkdir -p "${REPO}"
git -C "${REPO}" init -q
git -C "${REPO}" config user.email worker@example.invalid
git -C "${REPO}" config user.name "Worker Test"
printf 'allowed\n' > "${REPO}/allowed.txt"
printf 'blocked\n' > "${REPO}/blocked.txt"
git -C "${REPO}" add allowed.txt blocked.txt
git -C "${REPO}" commit -q -m "init"

printf 'allowed changed\n' > "${REPO}/allowed.txt"
enforce_write_scope "${REPO}" "allowed.txt"

printf 'blocked changed\n' > "${REPO}/blocked.txt"
assert_fails "rejects writes outside scope" enforce_write_scope "${REPO}" "allowed.txt"

printf '[ok] claude-code-worker self-test passed\n'
