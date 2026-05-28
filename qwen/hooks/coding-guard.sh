#!/usr/bin/env bash
# PreToolUse hook (matcher: 编辑工具): TDD + Bugfix 合并提醒。
# 仅对白名单内的代码文件后缀触发；测试文件静默放行。
# Qwen Code 编辑工具名：edit（对应 Claude Edit）、write_file（对应 Claude Write）
set -uo pipefail

python3 -c '
import json, sys, os, re

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

if payload.get("tool_name") not in ("edit", "write_file"):
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
params = tool_input.get("parameters") or tool_input
file_path = (
    params.get("file_path", "")
    or params.get("path", "")
    or tool_input.get("file_path", "")
    or tool_input.get("path", "")
    or ""
)

if not file_path:
    print("")
    sys.exit(0)

# 白名单：代码文件后缀
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

# 测试文件检测
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
