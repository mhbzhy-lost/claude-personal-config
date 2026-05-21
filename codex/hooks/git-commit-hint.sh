#!/usr/bin/env bash
# Codex PreToolUse hook: detect git commit and require the review/commit workflow.
#
# Escape hatch: set GIT_COMMIT_HINT_SKIP=1 in structured Bash env when present,
# or as a leading shell env assignment for tool surfaces without env fields.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HINT_CONTENT_PATH="${SCRIPT_DIR}/../../opencode/plugins/git-commit-hint-content.json"

if ! RESPONSE="$(HINT_CONTENT_PATH="${HINT_CONTENT_PATH}" HINT_HOST="codex" python3 -c '
import json
import os
import re
import shlex
import sys
from pathlib import Path

SKIP_ENV_NAME = "GIT_COMMIT_HINT_SKIP"
SKIP_VALUES = {"1", "true", "yes", "on"}


def render_reason():
    content_path = Path(os.environ["HINT_CONTENT_PATH"])
    host = os.environ["HINT_HOST"]
    content = json.loads(content_path.read_text(encoding="utf-8"))
    return (
        "\n".join(content["template"])
        .replace("{hook_name}", content["hook_names"][host])
        .replace("{escape_instruction}", content["escape_instructions"][host])
    )


def is_truthy(value):
    return str(value).strip().lower() in SKIP_VALUES


def tool_env_requests_skip(tool_input):
    for key in ("env", "environment"):
        env = tool_input.get(key)
        if isinstance(env, dict) and is_truthy(env.get(SKIP_ENV_NAME, "")):
            return True
    return False


def command_env_prefix_requests_skip(cmd):
    try:
        tokens = shlex.split(cmd, posix=True)
    except ValueError:
        return False

    if not tokens:
        return False
    if tokens[0] == "env":
        tokens = tokens[1:]

    skip_requested = False
    idx = 0
    while idx < len(tokens):
        name, separator, value = tokens[idx].partition("=")
        if not separator or not name.isidentifier():
            break
        if name == SKIP_ENV_NAME and is_truthy(value):
            skip_requested = True
        idx += 1

    return skip_requested and idx + 1 < len(tokens) and tokens[idx:idx + 2] == ["git", "commit"]

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

# Match git commit only, not git commit-tree / git commit-graph.
if not re.search(r"(^|[^\w-])git\s+commit(\s|$)", cmd):
    print("")
    sys.exit(0)

# Escape hatch: structured Bash env when present, or a leading shell env
# assignment for tool surfaces that do not expose a separate env field.
if tool_env_requests_skip(tool_input) or command_env_prefix_requests_skip(cmd):
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
