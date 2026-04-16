#!/usr/bin/env bash
# init_claude.sh
#
# 将 claude-config 中需要被 Claude Code 加载的配置项，以符号链接形式挂到
# ~/.claude/ 下。相比历史版本（rsync 复制内容），本脚本：
#   - 幂等：已是正确软链接时 no-op
#   - 保守：目标已是真实文件/目录时告警，不覆盖，不删除
#   - 单源：claude-config/ 是唯一事实源，~/.claude/ 只做 runtime 加载入口
#
# MCP server 通过 `claude mcp add -s user` 注册到 ~/.claude.json（user scope），
# 而非写入 settings.json（Claude Code 不从 settings.json 读取 MCP 配置）。
#
# skills/ 故意不走软链接 —— MCP 架构下 skill 由 skill-catalog server 服务，
# ~/.claude/skills/ 不应存在；若仍存在本脚本会告警，由用户自查后手动清理。
#
# 同时保留历史版本中 "claude 会话链式执行包装函数" 的 ~/.zshrc 注入逻辑。

set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$HOME/.claude"

mkdir -p "$DST"

link_item() {
  local item="$1"
  local src_path="$SRC/$item"
  local dst_path="$DST/$item"

  if [ ! -e "$src_path" ] && [ ! -L "$src_path" ]; then
    echo "[skip] source $src_path does not exist"
    return
  fi

  if [ -L "$dst_path" ]; then
    local cur
    cur=$(readlink "$dst_path")
    if [ "$cur" = "$src_path" ]; then
      echo "[ok] $dst_path -> $src_path"
    else
      echo "[warn] $dst_path is a symlink pointing to $cur (expected $src_path). Please verify and fix manually."
    fi
  elif [ -e "$dst_path" ]; then
    echo "[warn] $dst_path exists as real file/dir. Check if backup needed, then 'rm -rf $dst_path' and rerun init_claude.sh."
  else
    ln -s "$src_path" "$dst_path"
    echo "[linked] $dst_path -> $src_path"
  fi
}

# Items that should live as symlinks under ~/.claude/
link_item "CLAUDE.md"
link_item "agents"
link_item "guidelines"

# skills/ 必须不存在（MCP 架构下禁用原生 skill 加载）
if [ -e "$DST/skills" ] || [ -L "$DST/skills" ]; then
  echo "[warn] $DST/skills still exists. MCP architecture disables native skill loading. Check if backup needed, then 'rm -rf $DST/skills'."
fi

# ---------------------------------------------------------------------------
# 合并 settings.json：注入 hooks.SubagentStart（仅 hooks，不含 MCP）
# 幂等：已有配置且与预期一致则 no-op；不一致则告警不覆盖
# ---------------------------------------------------------------------------
SETTINGS_JSON="$DST/settings.json"

# 探测 python 解释器（与 hooks/stack-list-inject.sh 相同策略）
if command -v python3 >/dev/null 2>&1 \
    && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,7) else 1)' 2>/dev/null; then
  PY="python3"
elif command -v uv >/dev/null 2>&1; then
  PY="uv run python"
else
  echo "[warn] 无 python3 / uv，跳过 settings.json 合并。请手动配置 $SETTINGS_JSON"
  PY=""
fi

if [ -n "$PY" ]; then
  MERGE_SCRIPT=$(cat <<'PYEOF'
import json
import sys
from pathlib import Path

src_root = sys.argv[1]
settings_path = Path(sys.argv[2])

desired_hook = {
    "matcher": "stack-detector",
    "hooks": [
        {
            "type": "command",
            "command": f"{src_root}/hooks/stack-list-inject.sh",
        }
    ],
}

# 读现有 settings（不存在则从空对象起手）
if settings_path.exists():
    try:
        data = json.loads(settings_path.read_text())
    except json.JSONDecodeError as e:
        print(f"[settings] ERROR: {settings_path} 不是合法 JSON：{e}，跳过合并", file=sys.stderr)
        sys.exit(1)
else:
    data = {}

changed = False

# 合并 hooks.SubagentStart
hooks = data.setdefault("hooks", {})
sub_start = hooks.setdefault("SubagentStart", [])
found_idx = None
for i, entry in enumerate(sub_start):
    if isinstance(entry, dict) and entry.get("matcher") == "stack-detector":
        found_idx = i
        break
if found_idx is None:
    sub_start.append(desired_hook)
    changed = True
    print(f"[settings] 新增 hooks.SubagentStart[matcher=stack-detector]")
elif sub_start[found_idx] != desired_hook:
    sub_start[found_idx] = desired_hook
    changed = True
    print(f"[settings] 更新 hooks.SubagentStart[matcher=stack-detector]")

# 清理残留：移除 settings.json 中的 mcpServers（已迁移到 claude mcp add）
if "mcpServers" in data:
    del data["mcpServers"]
    changed = True
    print(f"[settings] 移除残留 mcpServers（已迁移到 ~/.claude.json）")

# 清理残留：移除 SubagentStop hook（stack-detector-print 已废弃）
sub_stop = hooks.get("SubagentStop")
if sub_stop is not None:
    del hooks["SubagentStop"]
    changed = True
    print(f"[settings] 移除 hooks.SubagentStop（stack-detector-print 已废弃）")

if changed:
    settings_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"[settings] 已写入 {settings_path}")
else:
    print(f"[settings] 已是最新，无需改动")
PYEOF
)
  # $PY 不加引号以允许 "uv run python" 分词
  # shellcheck disable=SC2086
  $PY -c "$MERGE_SCRIPT" "$SRC" "$SETTINGS_JSON"
fi

# ---------------------------------------------------------------------------
# 注册 MCP server：通过 claude CLI 注册到 user scope (~/.claude.json)
# Claude Code 不从 settings.json 读取 MCP 配置，必须用 CLI 注册
# ---------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  MCP_CMD="$SRC/mcp/skill-catalog/.venv/bin/python"
  EXPECTED_ENV="SKILL_LIBRARY_PATH=$SRC/skills"

  # 检查是否已注册且配置一致
  CURRENT=$(claude mcp get skill-catalog 2>&1 || true)
  if echo "$CURRENT" | grep -q "Connected" \
      && echo "$CURRENT" | grep -q "$MCP_CMD" \
      && echo "$CURRENT" | grep -q "$EXPECTED_ENV"; then
    echo "[mcp] skill-catalog 已注册且配置一致"
  else
    # 先移除旧注册（如有），再重新注册
    claude mcp remove skill-catalog -s user 2>/dev/null || true
    claude mcp add -s user \
      -e "SKILL_LIBRARY_PATH=$SRC/skills" \
      -- skill-catalog "$MCP_CMD" -m skill_catalog.server
    echo "[mcp] skill-catalog 已注册到 user scope"
  fi
else
  echo "[warn] claude CLI 不可用，跳过 MCP server 注册。请手动执行：claude mcp add -s user -e SKILL_LIBRARY_PATH=$SRC/skills -- skill-catalog $SRC/mcp/skill-catalog/.venv/bin/python -m skill_catalog.server"
fi

# ---------------------------------------------------------------------------
# 历史逻辑：注入 claude 会话链式执行包装函数到 ~/.zshrc（与本次重构无关，保留）
# ---------------------------------------------------------------------------
ZSHRC="$HOME/.zshrc"
CHAIN_MARKER="claude_chain_next"

if [ -f "$ZSHRC" ] && grep -q "$CHAIN_MARKER" "$ZSHRC"; then
  echo "[zshrc] 已有 claude 包装函数，跳过注入"
else
  cat >> "$ZSHRC" << 'EOF'

# claude 会话链式执行包装函数（由 claude-config/init_claude.sh 注入）
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
  echo "[zshrc] 已注入 claude 包装函数（重新打开终端或 source ~/.zshrc 后生效）"
fi
