#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR:?}"' EXIT

TEST_ROOT="$TMP_DIR/claude-config"
mkdir -p "$TEST_ROOT"
cp "$ROOT/init_opencode.sh" "$TEST_ROOT/init_opencode.sh"
for entry in agents claude docs mcp opencode shared vendor; do
  ln -s "$ROOT/$entry" "$TEST_ROOT/$entry"
done

export TEST_ROOT
FAKE_BIN="$TMP_DIR/bin"
mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/opencode" <<'SH'
#!/usr/bin/env bash
echo "opencode-test"
SH
chmod +x "$FAKE_BIN/opencode"

export HOME="$TMP_DIR/home"
export PATH="$FAKE_BIN:$PATH"
export OPENCODE_CONFIG_DIR="$TMP_DIR/opencode-config"

mkdir -p "$HOME" "$OPENCODE_CONFIG_DIR"
printf 'export CLAUDE_CONFIG_HOME="%s" # existing value with comment\n' "$TEST_ROOT" >"$HOME/.zshrc"

INIT_LOG="$TMP_DIR/init.log"
if ! bash "$TEST_ROOT/init_opencode.sh" >"$INIT_LOG" 2>&1; then
  echo "init_opencode.sh failed. Log:" >&2
  cat "$INIT_LOG" >&2
  exit 1
fi

python3 <<'PY'
import os
import re
from pathlib import Path

root = Path(os.environ["TEST_ROOT"])
zshrc = Path(os.environ["HOME"]) / ".zshrc"
zshrc_lines = zshrc.read_text(encoding="utf-8").splitlines()

claude_config_home_lines = [
    line.strip()
    for line in zshrc_lines
    if line.strip().startswith("export CLAUDE_CONFIG_HOME=")
]
assert len(claude_config_home_lines) == 1, zshrc_lines
assert claude_config_home_lines[0].startswith(f'export CLAUDE_CONFIG_HOME="{root}"')

opencode_disable_lines = [
    line
    for line in zshrc_lines
    if re.match(r"^\s*export\s+OPENCODE_DISABLE_CLAUDE_CODE\s*=\s*['\"]?1['\"]?\s*(?:#.*)?$", line)
]
assert len(opencode_disable_lines) == 1, zshrc_lines

background_subagent_lines = [
    line
    for line in zshrc_lines
    if re.match(
        r"^\s*export\s+OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS\s*=\s*['\"]?true['\"]?\s*(?:#.*)?$",
        line,
    )
]
assert len(background_subagent_lines) == 1, zshrc_lines

print("init_opencode env registration test passed")
PY
