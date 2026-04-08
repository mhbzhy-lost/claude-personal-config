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
