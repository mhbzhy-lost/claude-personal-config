#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: bash scripts/install-knowledge-gate.sh /path/to/repo" >&2
  exit 2
fi

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$SRC_ROOT/templates/knowledge-gate"
if [ ! -d "$TARGET" ]; then
  echo "error: target directory does not exist: $TARGET" >&2
  exit 2
fi
TARGET="$(cd "$TARGET" && pwd)"

copy_one() {
  local rel="$1"
  local src="$TEMPLATE/$rel"
  local dst="$TARGET/$rel"

  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ]; then
    echo "[knowledge-gate] $rel exists, keeping"
    return
  fi

  cp "$src" "$dst"
  echo "[knowledge-gate] installed $rel"
}

copy_one ".agent/hooks/knowledge-gate.py"
copy_one ".agent/knowledge-gate.json"
copy_one ".githooks/pre-commit"

chmod +x "$TARGET/.agent/hooks/knowledge-gate.py" "$TARGET/.githooks/pre-commit"

PLUGIN_REL=".opencode/plugins/git-commit-hint.js"
PLUGIN_SRC="$TEMPLATE/$PLUGIN_REL"
PLUGIN_DST="$TARGET/$PLUGIN_REL"
mkdir -p "$(dirname "$PLUGIN_DST")"

SRC_ROOT="$SRC_ROOT" PLUGIN_SRC="$PLUGIN_SRC" PLUGIN_DST="$PLUGIN_DST" node - <<'NODE'
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const { SRC_ROOT, PLUGIN_SRC, PLUGIN_DST } = process.env;
const ssotPath = join(SRC_ROOT, 'shared', 'policies', 'git-commit-hint.json');
const ssot = JSON.parse(readFileSync(ssotPath, 'utf8'));
const renderedHint = ssot.template
  .join('\n')
  .replaceAll('{escape_instruction}', ssot.escape_instructions.opencode);

const jsString = JSON.stringify(renderedHint);
const pluginBody = readFileSync(PLUGIN_SRC, 'utf8');
const rendered = pluginBody.replace(
  /\/\/ HINT_PLACEHOLDER_START\nconst HINT_TEXT = null\n\/\/ HINT_PLACEHOLDER_END/,
  `// HINT_PLACEHOLDER_START\nconst HINT_TEXT = ${jsString}\n// HINT_PLACEHOLDER_END`
);
writeFileSync(PLUGIN_DST, rendered);
console.log('[knowledge-gate] installed .opencode/plugins/git-commit-hint.js (hint text rendered from SSOT)');
NODE

echo "[knowledge-gate] optional enable: git -C \"$TARGET\" config core.hooksPath .githooks"
