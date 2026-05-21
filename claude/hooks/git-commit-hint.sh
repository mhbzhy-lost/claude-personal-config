#!/usr/bin/env bash
# PreToolUse hook: 检测 Bash 工具是否在执行 git commit。
# 是则**阻断**执行，要求 agent 先调用 git-commit + external-llm-review skill。
# 逃生舱：tool_input.description 含 "skip-git-commit-hint" 即放行（agent 完成 skill
# 流程后带此标记重试本次 commit）。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HINT_CONTENT_PATH="${SCRIPT_DIR}/../../opencode/plugins/git-commit-hint-content.json"

if ! RESPONSE="$(HINT_CONTENT_PATH="${HINT_CONTENT_PATH}" HINT_HOST="claude" python3 -c '
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

if payload.get("tool_name") != "Bash":
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
cmd = tool_input.get("command", "") or ""
description = tool_input.get("description", "") or ""

# 仅匹配 git commit（排除 git commit-tree / git commit-graph 等子命令）
if not re.search(r"(^|[^\w-])git\s+commit(\s|$)", cmd):
    print("")
    sys.exit(0)

# 逃生舱：description 含特殊标记则放行
if re.search(r"skip-git-commit-hint", description, re.IGNORECASE):
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

printf '%s' "$RESPONSE"
