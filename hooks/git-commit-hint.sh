#!/usr/bin/env bash
# PreToolUse hook: 检测 Bash 工具是否在执行 git commit，
# 是则注入提醒，要求遵循 /git-commit skill 规范。不阻断，仅 hint。

set -uo pipefail

STDIN="$(cat)"

RESPONSE="$(STDIN_PAYLOAD="$STDIN" python3 <<'PY' 2>/dev/null
import json
import os
import re
import sys

raw = os.environ.get("STDIN_PAYLOAD", "")
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

if payload.get("tool_name") != "Bash":
    print("")
    sys.exit(0)

cmd = (payload.get("tool_input") or {}).get("command", "") or ""
# 匹配 git commit（排除 git commit-tree / git commit-graph 等子命令）
if not re.search(r'(^|[^\w-])git\s+commit(\s|$)', cmd):
    print("")
    sys.exit(0)

hint = (
    "[git-commit hook] 准备执行 git commit。"
    "请先通过 Skill 工具调用 git-commit skill 获取规范，再生成 commit message。"
)

out = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "additionalContext": hint,
    }
}
print(json.dumps(out, ensure_ascii=False))
PY
)"

if [ $? -ne 0 ]; then
  exit 0
fi

printf '%s' "$RESPONSE"
