#!/usr/bin/env bash
# SubagentStart hook for stack-detector.
#
# Scans $SKILL_LIBRARY_PATH for first-level stack directories (those that do
# not themselves contain a SKILL.md but have SKILL.md files in sub-directories)
# and injects them as additionalContext for the starting subagent so it knows
# the valid tag universe.
#
# stdout: JSON SubagentStart hook response.
# stderr: a single line log so the user can see the hook fired.

set -euo pipefail

LIB="${SKILL_LIBRARY_PATH:-/Users/mhbzhy/claude-config/skills}"

# Pick a python interpreter without relying on shell aliases (hooks run non-interactively).
if command -v python3 >/dev/null 2>&1 \
    && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,7) else 1)' 2>/dev/null; then
  PY="python3"
elif command -v uv >/dev/null 2>&1; then
  PY="uv run python"
else
  echo "[stack-list-inject] ERROR: no python3 or uv found" >&2
  exit 1
fi

SCRIPT=$(cat <<'PYEOF'
import json
import sys
from pathlib import Path

lib = Path(sys.argv[1])
stacks = []
if lib.is_dir():
    for child in sorted(lib.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        # A stack directory must NOT be a skill itself (no SKILL.md at its root)
        # but must contain SKILL.md files somewhere below.
        if (child / "SKILL.md").exists():
            continue
        skill_files = sorted(child.rglob("SKILL.md"))
        if not skill_files:
            continue
        names = [p.parent.name for p in skill_files]
        stacks.append({
            "tag": child.name,
            "count": len(names),
            "samples": names[:3],
        })

lines = ["Available tech stacks (choose tags ONLY from this list):"]
for s in stacks:
    samples = ", ".join(s["samples"])
    lines.append(f"- {s['tag']} ({s['count']} skills, e.g., {samples})")
lines.append("")
lines.append('If none matches, output {"tech_stack": []}')
context = "\n".join(lines)

print(json.dumps({
    "hookEventName": "SubagentStart",
    "additionalContext": context,
}))
print(
    f"[stack-list-inject] hook fired, injected {len(stacks)} stacks "
    f"from {lib}",
    file=sys.stderr,
)
PYEOF
)

# $PY is intentionally unquoted so "uv run python" word-splits correctly.
# shellcheck disable=SC2086
$PY -c "$SCRIPT" "$LIB"
