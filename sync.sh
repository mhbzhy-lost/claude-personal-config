#!/usr/bin/env bash
# 将本工程中除脚本自身、所有隐藏文件/文件夹（. 开头）之外的所有文件同步到 ~/.claude/
# 注意：目标路径使用 ~ 而非硬编码，以适配任意用户的 HOME 环境
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

cd "$REPO_DIR"

# 确保目标目录存在（~ 在运行时由 shell 展开为当前用户的 HOME）
mkdir -p ~/.claude/

rsync -av \
  --exclude=".*" \
  --exclude="/$SCRIPT_NAME" \
  ./ ~/.claude/

echo "[sync.sh] 已将 $REPO_DIR 同步到 ~/.claude/"

# 注入 claude 会话链式执行包装函数到 ~/.zshrc
ZSHRC="${HOME}/.zshrc"
CHAIN_MARKER="claude_chain_next"

if [[ -f "$ZSHRC" ]] && grep -q "$CHAIN_MARKER" "$ZSHRC"; then
  echo "[sync.sh] ~/.zshrc 中已有 claude 包装函数，跳过注入"
else
  cat >> "$ZSHRC" << 'EOF'

# claude 会话链式执行包装函数（由 claude-config/sync.sh 注入）
function claude() {
    command claude "$@"
    local next_file="${HOME}/.claude_chain_next"
    if [[ -f "$next_file" ]]; then
        local next_task
        next_task=$(cat "$next_file")
        rm -f "$next_file"
        exec command claude "$next_task"
    fi
}
EOF
  echo "[sync.sh] 已将 claude 包装函数注入 ~/.zshrc（重新打开终端或 source ~/.zshrc 后生效）"
fi
