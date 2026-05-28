#!/usr/bin/env bash
# Qwen Code PreToolUse hook: 检测 Bash 工具是否在执行 git commit。
# 是则**阻断**执行，要求 agent 先调用 git-commit skill 并处理知识文档判断。
# 逃生舱：设置 GIT_COMMIT_HINT_SKIP=1 的结构化 Bash env；无 env 字段的工具
# 可用命令前缀环境变量赋值。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HINT_CONTENT_PATH="${SCRIPT_DIR}/../../shared/policies/git-commit-hint.json"

if ! RESPONSE="$(HINT_CONTENT_PATH="${HINT_CONTENT_PATH}" HINT_HOST="qwen" python3 -c '
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
    """
    检测命令是否有 GIT_COMMIT_HINT_SKIP=1 前缀。
    支持命令链（&&, ;），会找到包含 git commit 的子命令进行检查。
    """
    # 按命令链分隔符拆分
    parts = re.split(r"\s*&&\s*|\s*;\s*", cmd)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        try:
            tokens = shlex.split(part, posix=True)
        except ValueError:
            continue

        if not tokens:
            continue
        if tokens[0] == "env":
            tokens = tokens[1:]

        # 查找 git commit 命令
        skip_requested = False
        idx = 0
        found_git_commit = False

        while idx < len(tokens):
            token = tokens[idx]

            # 检查是否是环境变量赋值（name=value）
            name, separator, value = token.partition("=")
            if separator and name.isidentifier():
                if name == SKIP_ENV_NAME and is_truthy(value):
                    skip_requested = True
                idx += 1
                continue

            # 检查是否是 git commit
            if token == "git" and idx + 1 < len(tokens) and tokens[idx + 1] == "commit":
                found_git_commit = True
                break

            # 其他命令，重置 skip_requested
            skip_requested = False
            break

        if found_git_commit and skip_requested:
            return True

    return False

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

if payload.get("tool_name") != "run_shell_command":
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
# Qwen Code 可能嵌套参数，加 fallback
params = tool_input.get("parameters") or tool_input
cmd = params.get("command", "") or tool_input.get("command", "") or ""

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
