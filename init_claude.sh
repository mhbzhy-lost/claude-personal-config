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

# SubagentStart 保留：
#   skill-marker → 注入 capability-taxonomy 闭集，供打标使用
#
# 已废弃（迁移到 UserPromptSubmit hook → skill-catalog resolve）：
#   stack-detector / skill-matcher —— 由 skill-resolve-inject.sh 端到端替代
desired_sub_start_hooks = [
    {
        "matcher": "skill-marker",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/capability-taxonomy-inject.sh",
            }
        ],
    },
]

# UserPromptSubmit hook：每次用户提交 prompt 前跑 skill-catalog resolve，
# 把 stack + skill 检索结果作为 additionalContext 注入主 agent。
desired_user_prompt_hooks = [
    {
        "matcher": "",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/skill-resolve-inject.sh",
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

# 合并 hooks.UserPromptSubmit：按 matcher upsert
user_prompt = hooks.setdefault("UserPromptSubmit", [])
for desired in desired_user_prompt_hooks:
    matcher = desired["matcher"]
    found_idx = None
    for i, entry in enumerate(user_prompt):
        if isinstance(entry, dict) and entry.get("matcher") == matcher:
            found_idx = i
            break
    if found_idx is None:
        user_prompt.append(desired)
        changed = True
        print(f"[settings] 新增 hooks.UserPromptSubmit[matcher={matcher!r}]")
    elif user_prompt[found_idx] != desired:
        user_prompt[found_idx] = desired
        changed = True
        print(f"[settings] 更新 hooks.UserPromptSubmit[matcher={matcher!r}]")

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

# venv 创建与依赖同步分离：
#   - venv 创建：幂等，仅缺失时创建
#   - 依赖安装：每次都跑，pip install -e . 对已满足依赖是 no-op，
#     且能自动补装 pyproject.toml 新增的依赖，避免老 venv 依赖陈旧
if [ ! -f "$SKILL_CATALOG_VENV/bin/python" ]; then
  echo "[venv] 创建 skill-catalog 虚拟环境..."
  if command -v uv >/dev/null 2>&1; then
    uv venv "$SKILL_CATALOG_VENV" --python ">=3.11"
  elif command -v python3 >/dev/null 2>&1 \
      && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null; then
    python3 -m venv "$SKILL_CATALOG_VENV"
  else
    echo "[error] 需要 python>=3.11 或 uv 来初始化 skill-catalog 环境，跳过"
  fi
else
  echo "[venv] skill-catalog 环境已存在，跳过创建"
fi

if [ -f "$SKILL_CATALOG_VENV/bin/python" ]; then
  echo "[venv] 同步 skill-catalog 依赖（pyproject.toml）..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$SKILL_CATALOG_VENV/bin/python" -e "$SKILL_CATALOG_DIR" >/dev/null
  else
    "$SKILL_CATALOG_VENV/bin/pip" install -e "$SKILL_CATALOG_DIR" >/dev/null
  fi
  echo "[venv] skill-catalog 环境就绪: $SKILL_CATALOG_VENV"
fi

# ---------------------------------------------------------------------------
# 初始化本地 LLM 后端：ollama + Qwen3 4B（项目内完全自包含部署）
#
#   设计哲学：像 .venv/ 一样，ollama binary + 模型数据 + 运行时状态都落在
#   mcp/skill-catalog/ 目录内，不干涉用户系统环境，不占 brew services，
#   不写 ~/.ollama/。默认端口 11435 避免与用户可能自行安装的系统 ollama
#   (11434) 冲突。
#
#   选型：Qwen3 4B（Apache 2.0、Q4_K_M ~2.5GB、中文开源 SOTA、原生 JSON
#   structured output），M 级 Mac 上 50-70 tok/s。
#
#   目录布局（均在 .gitignore）：
#     vendor/ollama/      binary + MLX/GGML 后端 (~170MB)
#     .ollama-models/     qwen3:4b 权重 (~2.5GB)
#     .ollama-runtime/    ollama.pid / ollama.log
#
#   幂等策略：
#     - binary 已存在 → 跳过下载
#     - daemon 已监听 → 跳过启动
#     - 模型已 pull → 跳过
#     - 任一步失败告警但不退出，后续 MCP 注册仍能完成，LLM 能力 lazy 启用
# ---------------------------------------------------------------------------
OLLAMA_VERSION="${OLLAMA_VERSION:-v0.21.0}"
OLLAMA_MODEL="${SKILL_CATALOG_OLLAMA_MODEL:-qwen3:4b}"
OLLAMA_PORT="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
OLLAMA_HOST_URL="http://127.0.0.1:$OLLAMA_PORT"

OLLAMA_DIR="$SRC/mcp/skill-catalog/vendor/ollama"
OLLAMA_BIN="$OLLAMA_DIR/ollama"
OLLAMA_MODELS_DIR="$SRC/mcp/skill-catalog/.ollama-models"
OLLAMA_RUNTIME_DIR="$SRC/mcp/skill-catalog/.ollama-runtime"

mkdir -p "$OLLAMA_DIR" "$OLLAMA_MODELS_DIR" "$OLLAMA_RUNTIME_DIR"

# 注意：daemon 生命周期由 MCP server 自动管理（见 skill_catalog.lifecycle）
#   - MCP server 启动时 acquire daemon（多 server 共享，引用计数）
#   - MCP server 退出时 release，计数归零后自动 kill
# 本脚本只负责 binary 下载 + 首次模型 pull（pull 需要临时 daemon），
# 不保留长期 daemon。

# 1. 下载 binary（若未安装）
if [ -x "$OLLAMA_BIN" ]; then
  echo "[ok] ollama binary 已就绪: $OLLAMA_BIN"
else
  OS=$(uname -s)
  case "$OS" in
    Darwin)
      # macOS 官方发布是 universal binary（单 tarball 覆盖 arm64/amd64）
      TARBALL_URL="https://github.com/ollama/ollama/releases/download/$OLLAMA_VERSION/ollama-darwin.tgz"
      TMPFILE="$OLLAMA_DIR/ollama-darwin.tgz"
      echo "[ollama] 下载 $OLLAMA_VERSION for macOS（约 124MB）..."
      if curl -fL -o "$TMPFILE" "$TARBALL_URL"; then
        tar -xzf "$TMPFILE" -C "$OLLAMA_DIR"
        rm -f "$TMPFILE"
        echo "[ok] ollama binary 下载并解压到 $OLLAMA_DIR"
      else
        echo "[warn] ollama binary 下载失败，跳过 LLM 初始化"
      fi
      ;;
    Linux)
      ARCH=$(uname -m)
      case "$ARCH" in
        x86_64) OLLAMA_ARCH="amd64" ;;
        aarch64|arm64) OLLAMA_ARCH="arm64" ;;
        *) echo "[warn] Linux 架构未支持: $ARCH，LLM 功能不可用" ; OLLAMA_ARCH="" ;;
      esac
      if [ -n "$OLLAMA_ARCH" ]; then
        TARBALL_URL="https://github.com/ollama/ollama/releases/download/$OLLAMA_VERSION/ollama-linux-$OLLAMA_ARCH.tar.zst"
        TMPFILE="$OLLAMA_DIR/ollama-linux.tar.zst"
        echo "[ollama] 下载 $OLLAMA_VERSION for Linux $OLLAMA_ARCH..."
        if curl -fL -o "$TMPFILE" "$TARBALL_URL"; then
          if command -v zstd >/dev/null 2>&1; then
            zstd -d "$TMPFILE" -o "${TMPFILE%.zst}"
            tar -xf "${TMPFILE%.zst}" -C "$OLLAMA_DIR"
            rm -f "$TMPFILE" "${TMPFILE%.zst}"
            echo "[ok] ollama binary 下载并解压到 $OLLAMA_DIR"
          else
            echo "[warn] Linux 需要 zstd 解压 tar.zst，请先安装（apt/yum install zstd）后重跑"
            rm -f "$TMPFILE"
          fi
        else
          echo "[warn] ollama binary 下载失败，跳过 LLM 初始化"
        fi
      fi
      ;;
    *)
      echo "[warn] 操作系统未支持: $OS，LLM 功能不可用"
      ;;
  esac
fi

# 2. 确保模型就绪：manifest 目录存在即视为已 pull（无需 daemon 介入判断）。
#    未就绪时，临时拉起 daemon → pull → 关闭（daemon 长期生命周期交给 MCP server）
MODEL_NAME="${OLLAMA_MODEL%%:*}"
MODEL_TAG="${OLLAMA_MODEL##*:}"
MODEL_MANIFEST="$OLLAMA_MODELS_DIR/manifests/registry.ollama.ai/library/$MODEL_NAME/$MODEL_TAG"

if [ -e "$MODEL_MANIFEST" ]; then
  echo "[ok] ollama 模型 ${OLLAMA_MODEL} 已就绪（manifest: ${MODEL_MANIFEST}）"
elif [ ! -x "$OLLAMA_BIN" ]; then
  echo "[warn] ollama binary 未就绪，跳过模型 pull"
else
  DAEMON_ALREADY_RUNNING=false
  TEMP_DAEMON_PID=""

  if curl -sf --max-time 1 "$OLLAMA_HOST_URL/api/tags" >/dev/null 2>&1; then
    DAEMON_ALREADY_RUNNING=true
    echo "[ollama] daemon 已在 $OLLAMA_HOST_URL 运行，复用以 pull 模型"
  else
    echo "[ollama] 临时启动 daemon 以 pull 模型（pull 完将关闭）..."
    OLLAMA_HOST="127.0.0.1:$OLLAMA_PORT" \
    OLLAMA_MODELS="$OLLAMA_MODELS_DIR" \
    OLLAMA_KEEP_ALIVE="5m" \
    nohup "$OLLAMA_BIN" serve > "$OLLAMA_RUNTIME_DIR/ollama-init.log" 2>&1 &
    TEMP_DAEMON_PID=$!
    disown || true
    for i in 1 2 3 4 5 6 7 8 9 10; do
      if curl -sf --max-time 1 "$OLLAMA_HOST_URL/api/tags" >/dev/null 2>&1; then
        echo "[ok] 临时 daemon 就绪（${i}s，pid=${TEMP_DAEMON_PID}）"
        break
      fi
      sleep 1
    done
  fi

  echo "[ollama] 拉取模型 ${OLLAMA_MODEL}（首次 ~2.5GB，视网络耗时数分钟）..."
  if OLLAMA_HOST="$OLLAMA_HOST_URL" "$OLLAMA_BIN" pull "$OLLAMA_MODEL"; then
    echo "[ok] 模型 $OLLAMA_MODEL 拉取完成"
  else
    echo "[warn] 模型 $OLLAMA_MODEL 拉取失败，请检查网络后重跑 init_claude.sh"
  fi

  # 关闭临时 daemon（仅当本脚本起的）
  if [ "$DAEMON_ALREADY_RUNNING" = "false" ] && [ -n "$TEMP_DAEMON_PID" ]; then
    kill -TERM "$TEMP_DAEMON_PID" 2>/dev/null || true
    for i in 1 2 3 4 5; do
      if ! kill -0 "$TEMP_DAEMON_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    kill -9 "$TEMP_DAEMON_PID" 2>/dev/null || true
    echo "[ok] 临时 daemon 已关闭（daemon 生命周期移交给 MCP server lifecycle）"
  fi
fi

# ---------------------------------------------------------------------------
# 注册 MCP server：通过 claude CLI 注册到 user scope (~/.claude.json)
# Claude Code 不从 settings.json 读取 MCP 配置，必须用 CLI 注册
# ---------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  MCP_CMD="$SKILL_CATALOG_VENV/bin/python"

  # 检查是否已注册且配置一致（所有 env 变量必须全部匹配）
  CURRENT=$(claude mcp get skill-catalog 2>&1 || true)
  if echo "$CURRENT" | grep -q "Connected" \
      && echo "$CURRENT" | grep -q "$MCP_CMD" \
      && echo "$CURRENT" | grep -q "SKILL_LIBRARY_PATH=$SRC/skills" \
      && echo "$CURRENT" | grep -q "SKILL_CATALOG_OLLAMA_MODEL=$OLLAMA_MODEL" \
      && echo "$CURRENT" | grep -q "SKILL_CATALOG_OLLAMA_HOST=$OLLAMA_HOST_URL"; then
    echo "[mcp] skill-catalog 已注册且配置一致"
  else
    # 先移除旧注册（如有），再重新注册
    claude mcp remove skill-catalog -s user 2>/dev/null || true
    claude mcp add -s user \
      -e "SKILL_LIBRARY_PATH=$SRC/skills" \
      -e "SKILL_CATALOG_OLLAMA_MODEL=$OLLAMA_MODEL" \
      -e "SKILL_CATALOG_OLLAMA_HOST=$OLLAMA_HOST_URL" \
      -- skill-catalog "$MCP_CMD" -m skill_catalog.server
    echo "[mcp] skill-catalog 已注册到 user scope（model=${OLLAMA_MODEL}）"
  fi
else
  echo "[warn] claude CLI 不可用，跳过 MCP server 注册。请手动执行："
  echo "  claude mcp add -s user \\"
  echo "    -e SKILL_LIBRARY_PATH=$SRC/skills \\"
  echo "    -e SKILL_CATALOG_OLLAMA_MODEL=$OLLAMA_MODEL \\"
  echo "    -e SKILL_CATALOG_OLLAMA_HOST=$OLLAMA_HOST_URL \\"
  echo "    -- skill-catalog $SKILL_CATALOG_VENV/bin/python -m skill_catalog.server"
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
