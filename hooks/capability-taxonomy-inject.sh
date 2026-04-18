#!/usr/bin/env bash
# SubagentStart hook: inject capability taxonomy into sub-agent context.
#
# Target sub-agents: skill-marker, skill-matcher (via matcher in settings.json).
# Reads ~/.claude/guidelines/capability-taxonomy.md (or $CAPABILITY_TAXONOMY_PATH)
# and returns its body as additionalContext so low-intelligence models cannot
# skip loading it.
#
# stdout: JSON SubagentStart hook response.
# stderr: one-line log.

set -euo pipefail

LOG_FILE="${CAPABILITY_TAXONOMY_INJECT_LOG:-$HOME/.claude/logs/capability-taxonomy-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"
printf '[%s] hook fired pid=%s ppid=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$PPID" >> "$LOG_FILE"

TAXONOMY_PATH="${CAPABILITY_TAXONOMY_PATH:-$HOME/.claude/guidelines/capability-taxonomy.md}"

if [[ ! -f "$TAXONOMY_PATH" ]]; then
  echo "[capability-taxonomy-inject] ERROR: taxonomy not found at $TAXONOMY_PATH" >&2
  # Emit a still-valid hook response so the sub-agent does not fail hard;
  # the sub-agent's own prompt will detect the missing taxonomy and abort.
  printf '{"hookEventName":"SubagentStart","additionalContext":"[capability-taxonomy missing at %s]"}\n' \
    "$TAXONOMY_PATH"
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v uv >/dev/null 2>&1; then
  PY="uv run python"
else
  echo "[capability-taxonomy-inject] ERROR: no python3 or uv found" >&2
  exit 1
fi

SCRIPT=$(cat <<'PYEOF'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
body = path.read_text(encoding="utf-8").strip()

header = (
    "[Capability Taxonomy — authoritative enum source]\n"
    "The following is the full capability taxonomy. Use ONLY these enum keys\n"
    "when producing or consuming `capability` tags. Never invent new keys.\n"
    "If no key fits, report it in your output and stop — do not guess.\n"
    "---\n"
)

print(json.dumps({
    "hookEventName": "SubagentStart",
    "additionalContext": header + body,
}))
print(
    f"[capability-taxonomy-inject] hook fired, injected {len(body)} chars from {path}",
    file=sys.stderr,
)
PYEOF
)

# shellcheck disable=SC2086
$PY -c "$SCRIPT" "$TAXONOMY_PATH"
