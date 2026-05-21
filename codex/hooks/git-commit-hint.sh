#!/usr/bin/env bash
# Codex PreToolUse hook: detect git commit and require the review/commit workflow.
#
# Codex does not expose Claude Code's Bash tool_input.description field through
# exec_command. The escape hatch therefore lives in the command text itself:
# include "skip-git-commit-hint" in the shell command after completing the
# required checks or documenting an allowed exemption.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HINT_CONTENT_PATH="${SCRIPT_DIR}/../../opencode/plugins/git-commit-hint-content.json"

if ! RESPONSE="$(HINT_CONTENT_PATH="${HINT_CONTENT_PATH}" HINT_HOST="codex" python3 -c '
import json
import os
import re
import sys
from pathlib import Path


def render_reason():
    content_path = Path(os.environ["HINT_CONTENT_PATH"])
    host = os.environ["HINT_HOST"]
    content = json.loads(content_path.read_text(encoding="utf-8"))
    return (
        "\n".join(content["template"])
        .replace("{hook_name}", content["hook_names"][host])
        .replace("{escape_instruction}", content["escape_instructions"][host])
    )

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

tool_name = payload.get("tool_name") or ""
if tool_name not in {"Bash", "exec_command", "functions.exec_command"}:
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
cmd = tool_input.get("command") or tool_input.get("cmd") or ""
description = tool_input.get("description") or ""

# Match git commit only, not git commit-tree / git commit-graph.
if not re.search(r"(^|[^\w-])git\s+commit(\s|$)", cmd):
    print("")
    sys.exit(0)

# Codex-friendly escape hatch: marker in command text. Description is accepted
# as a defensive fallback for future tool schema changes, but the user-facing
# instruction below names command text only.
if re.search(r"skip-git-commit-hint", cmd, re.IGNORECASE) or re.search(
    r"skip-git-commit-hint", description, re.IGNORECASE
):
    print("")
    sys.exit(0)

try:
    reason = render_reason()
except Exception as exc:
    print(f"git-commit-hint: failed to render shared hint: {exc}", file=sys.stderr)
    print("")
    sys.exit(0)

out = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}
print(json.dumps(out, ensure_ascii=False))
')";
then
  exit 0
fi

printf '%s' "${RESPONSE}"
