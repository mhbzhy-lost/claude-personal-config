#!/usr/bin/env bash
# Stop hook: Codex turn 结束时触发。
#
# Codex 会解析 Stop hook 的 stdout。普通文本会被视为无效 hook 输出并在
# turn 收尾时报 hook 失败；验证/未提交变更提醒放到 push gate，避免每轮
# Stop 都打断对话收尾。
set -uo pipefail

cat >/dev/null || true
exit 0
