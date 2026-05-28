#!/usr/bin/env bash
# PostToolUseFailure hook (matcher: run_shell_command): 熔断计数。
# Qwen Code 适配：run_shell_command 工具名，其余逻辑与 Claude 端一致。
set -uo pipefail

SESSION_KEY="${CLAUDE_SESSION_KEY:-$PPID}"
export COUNTER_FILE="/tmp/.qwen-circuit-breaker-${SESSION_KEY}"

python3 -c '
import json, sys, os

counter_file = os.environ.get("COUNTER_FILE", "")
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

if payload.get("tool_name") not in ("Bash", "run_shell_command"):
    print("")
    sys.exit(0)

if payload.get("is_interrupt"):
    print("")
    sys.exit(0)

count = 0
try:
    if os.path.exists(counter_file):
        count = int(open(counter_file).read().strip())
except Exception:
    count = 0

count += 1
try:
    with open(counter_file, "w") as f:
        f.write(str(count))
except Exception as e:
    print(f"[circuit-breaker] write failed: {e}", file=sys.stderr)

if count >= 3:
    msg = (
        f"⚠️ 同一 session 已连续命令失败 {count} 次。"
        "请停止硬试，先跑 knowledge-retrieval + Web 调研，"
        "重做根因分析后再继续。"
    )
    print(msg)
else:
    print("")
' <<< "$(cat)"
