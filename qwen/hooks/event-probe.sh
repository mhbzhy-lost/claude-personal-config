#!/usr/bin/env bash
# Probe hook: 记录所有触发的 hook 事件到日志文件。
# 用于探测 Qwen Code 支持哪些 hook 事件（Stop / PostToolUse / SessionStart 等）。
# 使用方法：临时注册到各事件，操作一轮后查看日志。
set -uo pipefail

LOG_FILE="${QWEN_EVENT_LOG:-/tmp/.qwen-event-probe.log}"
EVENT_NAME="${1:-unknown}"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') event=$EVENT_NAME ==="
  cat
  echo ""
} >> "$LOG_FILE" 2>/dev/null

echo ""
