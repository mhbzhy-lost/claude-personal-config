#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}/opencode-deepseek-smoke-$$"
REPO="$TMP_ROOT/repo"
TASK="$TMP_ROOT/task.md"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.email smoke@example.invalid
git -C "$REPO" config user.name "Smoke Test"
printf 'hello\n' > "$REPO/allowed.txt"
git -C "$REPO" add allowed.txt
git -C "$REPO" commit -q -m "init"

cat > "$TASK" <<'EOF'
Append the line "worker" to allowed.txt.
Do not edit any other file.
EOF

if ! command -v opencode >/dev/null 2>&1; then
  echo "[skip] opencode not available"
  exit 0
fi

echo "[info] Smoke test requires a configured DeepSeek/OpenCode provider."
echo "[info] Running with OPENCODE_DEEPSEEK_MODEL=${OPENCODE_DEEPSEEK_MODEL:-deepseek/deepseek-v4-pro}"

export OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS="${OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS:-120}"

"$WORKER_DIR/bin/run.sh" \
  --repo "$REPO" \
  --task "$TASK" \
  --write-scope allowed.txt \
  --validation "test -f allowed.txt" \
  --keep
