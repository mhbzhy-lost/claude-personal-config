#!/usr/bin/env bash
# PermissionRequest hook: auto-approve external-llm-review reviewer.py Bash calls.
# Non-matching requests produce no output, so Codex falls back to normal approval.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REVIEWER_ABS="${REPO_ROOT}/claude-skills/external-llm-review/reviewer.py"
PY_HELPER="${SCRIPT_DIR}/external-llm-review-permission.py"

if ! RESPONSE="$(REVIEWER_ABS="${REVIEWER_ABS}" python3 "${PY_HELPER}")"; then
  exit 0
fi

printf '%s' "$RESPONSE"
