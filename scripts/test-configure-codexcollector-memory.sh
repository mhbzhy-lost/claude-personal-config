#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/configure-codexcollector-memory.sh"
PLISTBUDDY="/usr/libexec/PlistBuddy"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

make_plist() {
  local plist="$1"
  cat > "$plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>codexcollector</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>collector.js</string>
  </array>
</dict>
</plist>
PLIST
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL: %s\nexpected: %s\nactual:   %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

plist="$tmpdir/codexcollector.plist"
make_plist "$plist"

"$SCRIPT" --plist "$plist" --max-old-space-size 512
actual="$("$PLISTBUDDY" -c "Print :EnvironmentVariables:NODE_OPTIONS" "$plist")"
assert_equals "--max-old-space-size=512" "$actual" "adds NODE_OPTIONS when missing"

"$PLISTBUDDY" -c "Set :EnvironmentVariables:NODE_OPTIONS --trace-warnings --max-old-space-size=1024" "$plist"
"$SCRIPT" --plist "$plist" --max-old-space-size 512
actual="$("$PLISTBUDDY" -c "Print :EnvironmentVariables:NODE_OPTIONS" "$plist")"
assert_equals "--trace-warnings --max-old-space-size=512" "$actual" "preserves existing NODE_OPTIONS while replacing heap limit"

"$SCRIPT" --plist "$plist" --max-old-space-size 512
actual="$("$PLISTBUDDY" -c "Print :EnvironmentVariables:NODE_OPTIONS" "$plist")"
assert_equals "--trace-warnings --max-old-space-size=512" "$actual" "is idempotent"

echo "ok"
