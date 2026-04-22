#!/usr/bin/env bash
# UserPromptSubmit hook: 将 %skill 替换为知识检索流程文档内容
# 失败策略：永远不阻断用户 prompt

set -euo pipefail

LOG_FILE="${SKILL_RESOLVE_INJECT_LOG:-$HOME/.claude/logs/skill-resolve-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"

emit_empty() {
  echo '{"hookEventName":"UserPromptSubmit"}'
}

# 1. 读取输入
INPUT="$(cat 2>/dev/null || true)"

if [[ -z "$INPUT" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] empty stdin, skip" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

# 2. 提取 prompt（简单的文本查找，不是 JSON 解析）
# 查找 "prompt":"..." 模式
PROMPT=""
if [[ "$INPUT" =~ \"prompt\":\"([^\"]*)\" ]]; then
  PROMPT="${BASH_REMATCH[1]}"
fi

# 3. 检查是否包含 %skill
if ! [[ "$PROMPT" == *%skill* ]]; then
  emit_empty
  exit 0
fi

# 4. 定位并读取知识检索文档
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
KNOWLEDGE_PATH="$SRC_ROOT/guidelines/knowledge-retrieval-process.md"

KNOWLEDGE_CONTENT=""
if [[ -f "$KNOWLEDGE_PATH" ]]; then
  KNOWLEDGE_CONTENT="$(cat "$KNOWLEDGE_PATH" 2>/dev/null || true)"
fi

FOOTER="你必须首先执行知识检索流程，然后再完成接下来的任务。"
FULL_CONTENT="$KNOWLEDGE_CONTENT"$'\n'"$FOOTER"

# 转义内容以适合 JSON
ESCAPED_CONTENT="$(printf '%s' "$FULL_CONTENT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/'\''/\\'\''/g; s/\t/\\t/g; s/\n/\\n/g; s/\r/\\r/g')"

# 5. 生成输出
echo '{"hookEventName":"UserPromptSubmit","additionalContext":"'"$ESCAPED_CONTENT"'"}'

echo "[$(date '+%Y-%m-%d %H:%M:%S')] processed prompt with knowledge retrieval content" >> "$LOG_FILE"
