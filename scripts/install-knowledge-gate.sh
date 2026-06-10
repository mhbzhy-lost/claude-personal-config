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

echo "[knowledge-gate] optional enable: git -C \"$TARGET\" config core.hooksPath .githooks"
