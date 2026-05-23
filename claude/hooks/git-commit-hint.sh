#!/usr/bin/env bash
# PreToolUse hook: 检测 Bash 工具是否在执行 git commit。
# 是则**阻断**执行，要求 agent 先调用 git-commit + external-llm-review skill。
# 逃生舱：设置 GIT_COMMIT_HINT_SKIP=1 的结构化 Bash env；无 env 字段的工具
# 可用命令前缀环境变量赋值。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HINT_CONTENT_PATH="${SCRIPT_DIR}/../../shared/policies/git-commit-hint.json"

if ! RESPONSE="$(HINT_CONTENT_PATH="${HINT_CONTENT_PATH}" HINT_HOST="claude" python3 -c '
import json
import os
import re
import shlex
import sys
from pathlib import Path

SKIP_ENV_NAME = "GIT_COMMIT_HINT_SKIP"
SKIP_VALUES = {"1", "true", "yes", "on"}


def render_reason():
    content_path = Path(os.environ["HINT_CONTENT_PATH"]).resolve()
    host = os.environ["HINT_HOST"]
    content = json.loads(content_path.read_text(encoding="utf-8"))
    knowledge_readme = content_path.parents[2] / "docs" / "knowledge" / "README.md"
    return (
        "\n".join(content["template"])
        .replace("{hook_name}", content["hook_names"][host])
        .replace("{escape_instruction}", content["escape_instructions"][host])
        .replace("{knowledge_readme}", str(knowledge_readme))
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

if payload.get("tool_name") != "Bash":
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
cmd = tool_input.get("command", "") or ""

# 仅匹配 git commit（排除 git commit-tree / git commit-graph 等子命令）
if not re.search(r"(^|[^\w-])git\s+commit(\s|$)", cmd):
    print("")
    sys.exit(0)

# 逃生舱：结构化 Bash env 优先；无独立 env 字段的工具可用命令前缀赋值
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

printf '%s' "$RESPONSE"
