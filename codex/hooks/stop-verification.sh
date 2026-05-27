#!/usr/bin/env bash
# Stop hook: 终态验证提醒。
# turn 结束时触发，提醒是否已跑验证、是否有未提交变更。
# 对齐 Claude Code 端 claude/hooks/stop-verification.sh。
echo "⚠️ 停止前确认：(1) 已运行验证命令并确认输出？(2) 有未提交变更？"
