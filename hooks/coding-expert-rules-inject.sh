#!/usr/bin/env bash
# SubagentStart hook: inject coding-expert shared rules into sub-agent context.
#
# Target sub-agents: coding-expert, coding-expert-light, coding-expert-heavy
# (via matcher in settings.json).
# Reads ~/.claude/guidelines/coding-expert-rules.md (or $CODING_EXPERT_RULES_PATH)
# and returns its body as additionalContext so sub-agents do not need to
# manually Read the file at startup.
#
# stdout: JSON SubagentStart hook response.
# stderr: one-line log.

set -euo pipefail

LOG_FILE="${CODING_EXPERT_RULES_INJECT_LOG:-$HOME/.claude/logs/coding-expert-rules-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"
printf '[%s] hook fired pid=%s ppid=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$PPID" >> "$LOG_FILE"

RULES_PATH="${CODING_EXPERT_RULES_PATH:-$HOME/.claude/guidelines/coding-expert-rules.md}"

if [[ ! -f "$RULES_PATH" ]]; then
  echo "[coding-expert-rules-inject] ERROR: rules not found at $RULES_PATH" >&2
  # Emit a still-valid hook response so the sub-agent does not fail hard.
  printf '{"hookEventName":"SubagentStart","additionalContext":"[coding-expert-rules missing at %s]"}\n' \
    "$RULES_PATH"
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v uv >/dev/null 2>&1; then
  PY="uv run python"
else
  echo "[coding-expert-rules-inject] ERROR: no python3 or uv found" >&2
  exit 1
fi

SCRIPT=$(cat <<'PYEOF'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
body = path.read_text(encoding="utf-8").strip()

header = (
    "[coding-expert 共享规范 — harness 强制注入]\n"
    "本规范对 coding-expert / coding-expert-light / coding-expert-heavy 三档子 agent 强制生效。\n"
    "后续所有工作原则、交付格式、框架知识检索要求、验收流程均以本规范为准。\n"
    "---\n"
)

print(json.dumps({
    "hookEventName": "SubagentStart",
    "additionalContext": header + body,
}))
print(
    f"[coding-expert-rules-inject] hook fired, injected {len(body)} chars from {path}",
    file=sys.stderr,
)
PYEOF
)

# shellcheck disable=SC2086
$PY -c "$SCRIPT" "$RULES_PATH"
