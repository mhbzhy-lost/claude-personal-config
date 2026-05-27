#!/usr/bin/env bash
# Stop hook: 结构化终态验证。
# 检测 git 未提交变更 + 最近测试失败状态，有问题才输出告警，正常静默。
set -uo pipefail

SESSION_KEY="${CLAUDE_SESSION_KEY:-$PPID}"
LAST_TEST_FILE="/tmp/.claude-last-test-exit-${SESSION_KEY}"

warnings=""

# 检查 git 未提交变更
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  uncommitted="$(git status --porcelain 2>/dev/null)"
  if [ -n "$uncommitted" ]; then
    file_count="$(echo "$uncommitted" | wc -l | tr -d ' ')"
    warnings="${warnings}• 有 ${file_count} 个未提交变更\n"
  fi
fi

# 检查最近测试是否失败
if [ -f "$LAST_TEST_FILE" ]; then
  test_status="$(cat "$LAST_TEST_FILE" 2>/dev/null)"
  if [ "$test_status" = "1" ]; then
    warnings="${warnings}• 最近一次测试执行失败\n"
  fi
fi

if [ -n "$warnings" ]; then
  printf '⚠️ 停止前确认以下问题已处理：\n%b' "$warnings"
else
  echo ""
fi
