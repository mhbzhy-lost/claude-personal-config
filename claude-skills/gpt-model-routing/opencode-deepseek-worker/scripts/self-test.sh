#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib.sh
source "$WORKER_DIR/scripts/lib.sh"

TMP_ROOT="${TMPDIR:-/tmp}/opencode-deepseek-self-test-$$"
REPO="$TMP_ROOT/repo"
GUARD_OUT="$TMP_ROOT/guard.out"
PROFILE_ROOT="$TMP_ROOT/profile-root"
AUTH_FILE="$TMP_ROOT/auth.json"
WATCHDOG_ROOT="$TMP_ROOT/watchdog"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.email self-test@example.invalid
git -C "$REPO" config user.name "Self Test"
printf 'ok\n' > "$REPO/allowed.txt"
printf 'stop\n' > "$REPO/forbidden.txt"
git -C "$REPO" add allowed.txt forbidden.txt
git -C "$REPO" commit -q -m "init"

printf 'ok\nchanged\n' > "$REPO/allowed.txt"
enforce_write_scope "$REPO" "allowed.txt"
git -C "$REPO" checkout -- allowed.txt

mkdir -p "$REPO/auth"
printf 'module\n' > "$REPO/auth/login.py"
enforce_write_scope "$REPO" "auth"

mkdir -p "$REPO/validation_pkg"
printf 'VALUE = 1\n' > "$REPO/validation_pkg/mod.py"
run_validation "$REPO" 'python3 -c "import validation_pkg.mod"' >/dev/null
if rg --files "$REPO" | rg -q "__pycache__"; then
  die "run_validation created Python bytecode artifacts"
fi

printf 'stop\nchanged\n' > "$REPO/forbidden.txt"
if enforce_write_scope "$REPO" "allowed.txt,auth" >"$GUARD_OUT" 2>&1; then
  die "write-scope guard failed to reject forbidden.txt"
fi

if ! rg -q "forbidden.txt" "$GUARD_OUT"; then
  die "write-scope guard output did not mention forbidden.txt"
fi

printf '{"provider":{"example":true}}\n' > "$AUTH_FILE"
OPENCODE_DEEPSEEK_AUTH_FILE="$AUTH_FILE" prepare_profile "$PROFILE_ROOT" "$GUARD_OUT" "allowed.txt" ""
if [ ! -f "$PROFILE_ROOT/xdg/data/opencode/auth.json" ]; then
  die "prepare_profile did not copy auth.json into isolated data dir"
fi

mkdir -p "$WATCHDOG_ROOT"
(
  printf 'first\n' >> "$WATCHDOG_ROOT/opencode.jsonl"
  sleep 1
  printf 'second\n' >> "$WATCHDOG_ROOT/opencode.jsonl"
  sleep 5
) &
watchdog_pid=$!
if OPENCODE_DEEPSEEK_MONITOR_INTERVAL_SECONDS=1 monitor_opencode_worker "$WATCHDOG_ROOT" "$watchdog_pid" 2; then
  die "idle watchdog did not terminate a quiet worker"
fi
if ! rg -q "idle timed out" "$WATCHDOG_ROOT/opencode.stderr"; then
  die "idle watchdog output did not mention idle timeout"
fi

echo "[ok] write-scope guard self-test passed"
