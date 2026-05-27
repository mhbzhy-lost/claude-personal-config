#!/usr/bin/env bash
# PostToolUseFailure hook (matcher: Bash): 熔断计数。
# 连续 Bash 失败 ≥3 次时输出提醒，驱动 agent 停止硬试、转向调研。
set -uo pipefail

# 使用 CLAUDE_SESSION_KEY（若存在）或 $PPID 标识当前 session
SESSION_KEY="${CLAUDE_SESSION_KEY:-$PPID}"
export COUNTER_FILE="/tmp/.claude-circuit-breaker-${SESSION_KEY}"

python3 -c '
import json, sys, os

counter_file = os.environ.get("COUNTER_FILE", "")
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

if payload.get("tool_name") != "Bash":
    print("")
    sys.exit(0)

# 排除用户中断（非真正失败）
if payload.get("is_interrupt"):
    print("")
    sys.exit(0)

# 递增计数
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
        f"⚠️ 同一 session 已连续 Bash 失败 {count} 次。"
        "请停止硬试，先跑 knowledge-retrieval + Web 调研，"
        "重做根因分析后再继续。"
    )
    print(msg)
else:
    print("")
' <<< "$(cat)"
