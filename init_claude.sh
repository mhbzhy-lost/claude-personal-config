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

# SubagentStart 需要的全部 hook：
#   stack-detector → 注入 stack-list，供 source-planner 等 agent 参考
#   skill-marker   → 注入 capability-taxonomy 闭集，供打标使用
#   skill-matcher  → 同上，供候选筛选使用
desired_sub_start_hooks = [
    {
        "matcher": "stack-detector",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/stack-list-inject.sh",
            }
        ],
    },
    {
        "matcher": "skill-marker",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/capability-taxonomy-inject.sh",
            }
        ],
    },
    {
        "matcher": "skill-matcher",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/capability-taxonomy-inject.sh",
            }
        ],
    },
]

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

# 合并 hooks.SubagentStart：按 matcher upsert，不动其他 matcher 的条目
hooks = data.setdefault("hooks", {})
sub_start = hooks.setdefault("SubagentStart", [])
for desired in desired_sub_start_hooks:
    matcher = desired["matcher"]
    found_idx = None
    for i, entry in enumerate(sub_start):
        if isinstance(entry, dict) and entry.get("matcher") == matcher:
            found_idx = i
            break
    if found_idx is None:
        sub_start.append(desired)
        changed = True
        print(f"[settings] 新增 hooks.SubagentStart[matcher={matcher}]")
    elif sub_start[found_idx] != desired:
        sub_start[found_idx] = desired
        changed = True
        print(f"[settings] 更新 hooks.SubagentStart[matcher={matcher}]")

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
# 初始化 skill-catalog MCP server 的 Python 虚拟环境
# ---------------------------------------------------------------------------
SKILL_CATALOG_DIR="$SRC/mcp/skill-catalog"
SKILL_CATALOG_VENV="$SKILL_CATALOG_DIR/.venv"

if [ ! -f "$SKILL_CATALOG_VENV/bin/python" ]; then
  echo "[venv] 创建 skill-catalog 虚拟环境..."
  if command -v uv >/dev/null 2>&1; then
    uv venv "$SKILL_CATALOG_VENV" --python ">=3.11"
    uv pip install --python "$SKILL_CATALOG_VENV/bin/python" -e "$SKILL_CATALOG_DIR"
  elif command -v python3 >/dev/null 2>&1 \
      && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null; then
    python3 -m venv "$SKILL_CATALOG_VENV"
    "$SKILL_CATALOG_VENV/bin/pip" install -e "$SKILL_CATALOG_DIR"
  else
    echo "[error] 需要 python>=3.11 或 uv 来初始化 skill-catalog 环境，跳过"
  fi
  if [ -f "$SKILL_CATALOG_VENV/bin/python" ]; then
    echo "[venv] skill-catalog 环境就绪: $SKILL_CATALOG_VENV"
  fi
else
  echo "[venv] skill-catalog 环境已存在，跳过创建"
fi

# ---------------------------------------------------------------------------
# 注册 MCP server：通过 claude CLI 注册到 user scope (~/.claude.json)
# Claude Code 不从 settings.json 读取 MCP 配置，必须用 CLI 注册
# ---------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  MCP_CMD="$SKILL_CATALOG_VENV/bin/python"
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
  echo "[warn] claude CLI 不可用，跳过 MCP server 注册。请手动执行：claude mcp add -s user -e SKILL_LIBRARY_PATH=$SRC/skills -- skill-catalog $SKILL_CATALOG_VENV/bin/python -m skill_catalog.server"
fi

# ---------------------------------------------------------------------------
# 注册设计软件 MCP server：Figma（远程）+ Sketch（本地）
#   - Figma：远程官方 MCP，OAuth 自动处理，无需本地服务
#     文档：https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
#   - Sketch：Sketch 桌面版（2025.2.4+）内置 MCP，需在 Sketch 中按 ⌘K → "Start MCP Server"
#     文档：https://www.sketch.com/docs/mcp-server/
# 幂等：URL 一致则 no-op；否则 remove+add 重新注册。注册行为本身不依赖目标在线
# ---------------------------------------------------------------------------
register_http_mcp() {
  local name="$1"
  local url="$2"

  if ! command -v claude >/dev/null 2>&1; then
    echo "[warn] claude CLI 不可用，跳过 $name 注册。请手动执行：claude mcp add -s user --transport http $name $url"
    return
  fi

  local current
  current=$(claude mcp get "$name" 2>&1 || true)
  if echo "$current" | grep -Fq "$url"; then
    echo "[mcp] $name 已注册且 URL 一致"
  else
    claude mcp remove "$name" -s user 2>/dev/null || true
    claude mcp add -s user --transport http "$name" "$url"
    echo "[mcp] $name 已注册到 user scope ($url)"
  fi
}

register_http_mcp figma  "https://mcp.figma.com/mcp"
register_http_mcp sketch "http://localhost:31126/mcp"

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
