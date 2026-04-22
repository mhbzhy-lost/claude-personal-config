#!/usr/bin/env bash
# SubagentStart hook: inject coding-expert shared rules into sub-agent context.
#
# Target sub-agents: coding-expert, coding-expert-light, coding-expert-heavy
# (via matcher in settings.json).
# Reads guidelines/knowledge-retrieval-process.md (or $CODING_EXPERT_RULES_PATH)
# and returns its body as additionalContext so sub-agents do not need to
# manually Read the file at startup.
#
# stdout: JSON SubagentStart hook response.
# stderr: one-line log.

set -euo pipefail

LOG_FILE="${CODING_EXPERT_RULES_INJECT_LOG:-$HOME/.claude/logs/coding-expert-rules-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"
printf '[%s] hook fired pid=%s ppid=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$PPID" >> "$LOG_FILE"

# 定位项目根目录（相对于 hook 脚本位置）
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
RULES_PATH="${CODING_EXPERT_RULES_PATH:-$SRC_ROOT/guidelines/knowledge-retrieval-process.md}"

if [[ ! -f "$RULES_PATH" ]]; then
  echo "[coding-expert-rules-inject] ERROR: rules not found at $RULES_PATH" >&2
  ESCAPED_PATH="$(printf '%s' "$RULES_PATH" | sed 's/\\/\\\\/g; s/"/\\"/g; s/'\''/\\'\''/g; s/\t/\\t/g; s/\n/\\n/g; s/\r/\\r/g')"
  printf '{"hookEventName":"SubagentStart","additionalContext":"[coding-expert-rules missing at %s]"}\n' "$ESCAPED_PATH"
  exit 0
fi

# 读取规则内容
BODY="$(cat "$RULES_PATH" 2>/dev/null || true)"

FOOTER="---
你必须首先执行知识检索流程，然后再完成接下来的任务。"

FULL_CONTENT="$BODY"$'\n'"$FOOTER"

# 转义内容以适合 JSON
ESCAPED_CONTENT="$(printf '%s' "$FULL_CONTENT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/'\''/\\'\''/g; s/\t/\\t/g; s/\n/\\n/g; s/\r/\\r/g')"

echo '{"hookEventName":"SubagentStart","additionalContext":"'"$ESCAPED_CONTENT"'"}'

# 获取字符数量
BODY_LENGTH="$(wc -c < "$RULES_PATH" 2>/dev/null || true)"
echo "[coding-expert-rules-inject] hook fired, injected $BODY_LENGTH chars from $RULES_PATH" >&2
