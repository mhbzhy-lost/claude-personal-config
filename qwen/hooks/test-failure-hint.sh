#!/usr/bin/env bash
# PostToolUse hook (matcher: run_shell_command): 测试命令失败时提醒走 debugging 流程。
# Qwen Code 适配：run_shell_command 工具名 + 嵌套参数 + tool_response/tool_output。
set -uo pipefail

SESSION_KEY="${CLAUDE_SESSION_KEY:-$PPID}"
export LAST_TEST_FILE="/tmp/.qwen-last-test-exit-${SESSION_KEY}"

python3 -c '
import json, sys, os, re

last_test_file = os.environ.get("LAST_TEST_FILE", "")
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

if payload.get("tool_name") not in ("Bash", "run_shell_command"):
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
params = tool_input.get("parameters") or tool_input
cmd = params.get("command", "") or tool_input.get("command", "") or ""

# 匹配测试命令
TEST_PATTERNS = [
    r"\bpytest\b", r"\bvitest\b", r"\bjest\b", r"\bmocha\b",
    r"\bnpm\s+test\b", r"\bpnpm\s+test\b", r"\byarn\s+test\b",
    r"\bgo\s+test\b", r"\bcargo\s+test\b", r"\bswift\s+test\b",
    r"\bnpm\s+run\s+test\b", r"\bpnpm\s+run\s+test\b", r"\bmake\s+test\b",
]

is_test_cmd = any(re.search(p, cmd) for p in TEST_PATTERNS)
if not is_test_cmd:
    print("")
    sys.exit(0)

# 检查输出中是否有失败信号（兼容多种响应字段名）
response = (
    payload.get("tool_response")
    or payload.get("tool_output")
    or payload.get("output")
    or ""
)
if isinstance(response, dict):
    response = (response.get("stdout", "") or "") + (response.get("stderr", "") or "")
response = str(response) if response else ""

FAIL_SIGNALS = [
    r"\bFAILED\b", r"\bFAIL\b", r"\bError:\b", r"\berror\[",
    r"\bfailed\b", r"✗", r"✘",
    r"exit code [1-9]", r"exit status [1-9]",
    r"\bAssertionError\b", r"\bTraceback\b",
]

has_failure = any(re.search(p, response) for p in FAIL_SIGNALS)

if has_failure:
    try:
        with open(last_test_file, "w") as f:
            f.write("1")
    except Exception as e:
        print(f"[test-failure-hint] write failed: {e}", file=sys.stderr)
    msg = (
        "⚠️ 测试失败。先走 systematic-debugging 流程做根因分析，"
        "不要直接改实现代码。"
    )
    print(msg)
else:
    try:
        if os.path.exists(last_test_file):
            os.remove(last_test_file)
    except Exception as e:
        print(f"[test-failure-hint] cleanup failed: {e}", file=sys.stderr)
    print("")
' <<< "$(cat)"
