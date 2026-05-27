#!/usr/bin/env bash
# PreToolUse hook (matcher: Edit|Write): TDD + Bugfix 合并提醒。
# 仅对白名单内的代码文件后缀触发；测试文件静默放行。
# 对齐 Claude Code 端 claude/hooks/coding-guard.sh。
set -uo pipefail

python3 -c '
import json, sys, os

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
file_path = tool_input.get("file_path", "") or ""

if not file_path:
    print("")
    sys.exit(0)

CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".sh", ".rb",
    ".c", ".cpp", ".h", ".hpp", ".cc", ".cxx",
    ".swift", ".m", ".mm",
    ".kt", ".kts", ".java",
    ".ets",
}

_, ext = os.path.splitext(file_path)
if ext.lower() not in CODE_EXTENSIONS:
    print("")
    sys.exit(0)

import re
basename = os.path.basename(file_path)
dir_path = file_path.lower()
if re.search(r"(test|spec|_test|\.test\.|\.spec\.)", basename, re.IGNORECASE):
    print("")
    sys.exit(0)
if "/tests/" in dir_path or "/test/" in dir_path or "/__tests__/" in dir_path:
    print("")
    sys.exit(0)

msg = (
    "⛔ 编辑非测试代码文件前确认："
    "(1) TDD：对应的失败测试写了吗？"
    "(2) 若在修 bug：docs/bugs/bug-*.md 分析文档写了吗？"
)
print(msg)
'
