#!/usr/bin/env bash
# init_opencode.sh
#
# 将 claude-config 中 opencode 所需的配置同步到 ~/.config/opencode/。
# 与 init_claude.sh 互补，不修改任何 Claude Code 配置。
#
# 职责：
#   - MCP server：转为 opencode 原生格式写入 opencode.json（幂等）
#   - Skills：opencode 原生读取 ~/.claude/skills/，已由 init_claude.sh 维护
#
# 不影响 ~/.claude.json / ~/.claude/，可独立运行。
# ---------------------------------------------------------------------------
set -euo pipefail

# 用 BASH_SOURCE[0] 替代 $0：即使脚本被 source 执行也能正确定位自身目录
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 确保 OpenCode 已安装 ────────────────────────────────
if ! command -v opencode >/dev/null 2>&1; then
  echo "[install] OpenCode 未安装，使用官方脚本安装..."
  curl -fsSL https://opencode.ai/install | bash
  if ! command -v opencode >/dev/null 2>&1; then
    echo "[error] OpenCode 安装失败，请手动安装后重试：https://opencode.ai"
    exit 1
  fi
  echo "[install] OpenCode 安装完成"
else
  echo "[ok] OpenCode 已安装 ($(opencode --version 2>/dev/null || echo 'version unknown'))"
fi

OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
OPENCODE_JSON="$OPENCODE_CONFIG_DIR/opencode.json"

# ── Skills ──────────────────────────────────────────────
# opencode 原生搜索路径含 ~/.claude/skills/<name>/SKILL.md，
# 由 init_claude.sh 的 sync_claude_skills 维护，无需额外操作。
echo "[skills] opencode 读取 ~/.claude/skills/，已由 init_claude.sh 维护，无需额外配置"

# ── Plugin ──────────────────────────────────────────────
# opencode 不兼容 Claude Code 的 settings.json hooks，改用原生 plugin 机制。
# 策略：
#   - 目标目录不存在 → 整目录软链到 opencode/plugins/（新增插件即时生效）
#   - 目标已是正确软链 → 保留不动
#   - 目标已是旧版本仓软链 → 自动迁移到 opencode/plugins/
#   - 目标已是软链但指向他处 → 警告
#   - 目标是真目录 → rsync 纳管文件，不加 --delete（保留用户自管插件）
sync_opencode_plugins() {
  local src_path="$SRC/opencode/plugins"
  local dst_path="$OPENCODE_CONFIG_DIR/plugins"

  if [ ! -d "$src_path" ]; then
    echo "[skip]  opencode/plugins/ 不存在，跳过"
    return
  fi

  mkdir -p "$OPENCODE_CONFIG_DIR"

  # 不存在 → 直接软链
  if [ ! -e "$dst_path" ] && [ ! -L "$dst_path" ]; then
    ln -s "$src_path" "$dst_path"
    echo "[plugin] $dst_path -> ${src_path}（整目录软链）"
    return
  fi

  # 已是软链 → 校验目标后保留
  if [ -L "$dst_path" ]; then
    local cur legacy_src_path
    cur=$(readlink "$dst_path")
    legacy_src_path="$SRC/opencode-plugins"
    if [ "$cur" = "$src_path" ]; then
      echo "[plugin] $dst_path -> ${src_path}（已就绪）"
    elif [ "$cur" = "$legacy_src_path" ]; then
      rm -f "$dst_path"
      ln -s "$src_path" "$dst_path"
      echo "[plugin] $dst_path 从旧路径 ${legacy_src_path} 迁移到 ${src_path}"
    else
      echo "[warn]  $dst_path 是软链但指向 ${cur}（非本仓 opencode/plugins/），人工核对后再处理"
    fi
    return
  fi

  # 是真目录 → rsync 模式，不加 --delete 以保留用户自管插件
  echo "[plugin] $dst_path 是真目录，进入 rsync 保护模式"

  # 清理旧版逐文件软链残留
  local legacy_link="$dst_path/git-commit-hint.js"
  if [ -L "$legacy_link" ]; then
    rm -f "$legacy_link"
    echo "[plugin] 已清理旧版逐文件软链 $legacy_link"
  fi

  if ! command -v rsync >/dev/null 2>&1; then
    echo "[warn]  rsync 不可用，跳过插件同步；请手动复制 $src_path/ 到 $dst_path/"
    return
  fi

  local src_file dst_file basename
  for src_file in "$src_path"/*; do
    [ -e "$src_file" ] || continue
    basename=$(basename "$src_file")
    dst_file="$dst_path/$basename"

    # 已是软链指向源文件 → 跳过
    if [ -L "$dst_file" ] && [ "$(readlink "$dst_file")" = "$src_file" ]; then
      continue
    fi

    if [ -f "$src_file" ]; then
      if [ -e "$dst_file" ]; then
        # 已存在且内容一致 → 跳过；不一致 → 告警
        if cmp -s "$src_file" "$dst_file"; then
          continue
        else
          echo "[warn]  $dst_file 与源不一致，请手动核对"
          continue
        fi
      fi
      cp "$src_file" "$dst_file"
      echo "[plugin] $basename 已同步"
    fi
  done
}

sync_opencode_plugins

sync_opencode_proxy() {
  local src_path="$SRC/opencode/proxy"
  local dst_path="$OPENCODE_CONFIG_DIR/proxy"

  if [ ! -d "$src_path" ]; then
    echo "[skip]  opencode/proxy/ 不存在，跳过"
    return
  fi

  mkdir -p "$OPENCODE_CONFIG_DIR"

  if [ ! -e "$dst_path" ] && [ ! -L "$dst_path" ]; then
    ln -s "$src_path" "$dst_path"
    echo "[proxy]  $dst_path -> ${src_path}"
    return
  fi

  if [ -L "$dst_path" ]; then
    local cur
    cur=$(readlink "$dst_path")
    if [ "$cur" = "$src_path" ]; then
      echo "[proxy]  $dst_path -> ${src_path}（已就绪）"
    else
      echo "[warn]  $dst_path 是软链但指向 ${cur}（非本仓 opencode/proxy/），人工核对后再处理"
    fi
    return
  fi

  echo "[warn]  $dst_path 已存在且不是软链；请手动核对后指向 $src_path"
}

sync_opencode_proxy

# ── shared/policies SSOT 软链 ────────────────────────────
# OpenCode 端 plugin 是 cp 副本（不是软链整目录，因为要保留用户自管 plugin），
# 副本的 __dirname/../../ fallback 路径会解析到 ~/.config/opencode/，需要
# shared/ 软链到本仓让 cp 副本仍能找到 SSOT 文件——即使没有 CLAUDE_CONFIG_HOME
# 环境变量也能工作（GUI 启动 OpenCode 不读 ~/.zshrc 时）。
sync_opencode_shared() {
  local src_path="$SRC/shared"
  local dst_path="$OPENCODE_CONFIG_DIR/shared"

  if [ ! -d "$src_path" ]; then
    echo "[skip]  shared/ 不存在，跳过"
    return
  fi

  mkdir -p "$OPENCODE_CONFIG_DIR"

  if [ ! -e "$dst_path" ] && [ ! -L "$dst_path" ]; then
    ln -s "$src_path" "$dst_path"
    echo "[shared] $dst_path -> ${src_path}"
    return
  fi

  if [ -L "$dst_path" ]; then
    local cur
    cur=$(readlink "$dst_path")
    if [ "$cur" = "$src_path" ]; then
      echo "[shared] $dst_path -> ${src_path}（已就绪）"
    else
      echo "[warn]  $dst_path 是软链但指向 ${cur}（非本仓 shared/），人工核对后再处理"
    fi
    return
  fi

  echo "[warn]  $dst_path 已存在且不是软链；请手动核对后指向 $src_path"
}

sync_opencode_shared

# ── MCP 变量（与 init_claude.sh 保持一致） ──────────────
SKILL_CATALOG_DIR="$SRC/mcp/skill-catalog"
SKILL_CATALOG_VENV="$SKILL_CATALOG_DIR/.venv"
MCP_CMD="$SKILL_CATALOG_VENV/bin/python"

EMBEDDING_MODEL="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
OLLAMA_PORT="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
OLLAMA_HOST_URL="http://127.0.0.1:$OLLAMA_PORT"
ENABLE_INTENT_ENHANCEMENT="${ENABLE_INTENT_ENHANCEMENT:-true}"
BAILIAN_CACHE_PROXY_PORT="${BAILIAN_CACHE_PROXY_PORT:-48761}"

BLOCK_CATALOG_DIR="$SRC/mcp/block-catalog"
BLOCK_CATALOG_VENV="$BLOCK_CATALOG_DIR/.venv"
BC_CMD="$BLOCK_CATALOG_VENV/bin/python"

mkdir -p "$OPENCODE_CONFIG_DIR"

# 探测 Python 解释器
if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1; then
  PY="python"
else
  echo "[error] Python 不可用，无法合并 opencode.json。请安装 Python 后重试"
  exit 1
fi

# ── MCP：合并到 opencode.json ────────────────────────────
# 使用 Python 做 JSON 深度比较与合并，保持幂等：
#   - 已有且值一致 → no-op
#   - 已有但值不同 → 覆盖（告警）
#   - 不存在 → 新增
export OPENCODE_JSON="$OPENCODE_JSON"
export MCP_CMD="$MCP_CMD"
export SRC="$SRC"
export EMBEDDING_MODEL="$EMBEDDING_MODEL"
export OLLAMA_HOST_URL="$OLLAMA_HOST_URL"
export ENABLE_INTENT_ENHANCEMENT="$ENABLE_INTENT_ENHANCEMENT"
export BC_CMD="$BC_CMD"
export BAILIAN_CACHE_PROXY_PORT="$BAILIAN_CACHE_PROXY_PORT"

$PY -c '
import json, os, sys

config_path = os.environ["OPENCODE_JSON"]
venv_python = os.environ["MCP_CMD"]
bc_python = os.environ["BC_CMD"]
src = os.environ["SRC"]
embedding_model = os.environ["EMBEDDING_MODEL"]
ollama_host = os.environ["OLLAMA_HOST_URL"]
intent_enhancement = os.environ["ENABLE_INTENT_ENHANCEMENT"]
bailian_cache_proxy_port = os.environ["BAILIAN_CACHE_PROXY_PORT"]

config = {}
if os.path.exists(config_path):
    try:
        with open(config_path) as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        print(f"[error] {config_path} 不是合法 JSON：{e}", file=sys.stderr)
        sys.exit(1)

mcp = config.setdefault("mcp", {})
changed = False

# ── skill-catalog ──
if os.path.exists(venv_python):
    desired = {
        "type": "local",
        "command": [venv_python, "-m", "skill_catalog.server"],
        "enabled": True,
        "environment": {
            "SKILL_LIBRARY_PATH": f"{src}/skills",
            "SKILL_CATALOG_EMBEDDING_MODEL": embedding_model,
            "SKILL_CATALOG_OLLAMA_HOST": ollama_host,
            "ENABLE_INTENT_ENHANCEMENT": intent_enhancement,
        },
    }
    existing = mcp.get("skill-catalog")
    if existing != desired:
        if existing is not None:
            print("[mcp] skill-catalog 已有配置，更新为最新")
        else:
            print("[mcp] skill-catalog 新增")
        mcp["skill-catalog"] = desired
        changed = True
    else:
        print("[mcp] skill-catalog 已是最新")
else:
    # venv 未初始化但仍写入配置（路径稳定，venv 后续可用 init_claude.sh 补建）
    print(f"[warn]  skill-catalog venv 不存在 ({venv_python})，先写入配置，venv 请用 init_claude.sh 初始化")
    desired = {
        "type": "local",
        "command": [venv_python, "-m", "skill_catalog.server"],
        "enabled": True,
        "environment": {
            "SKILL_LIBRARY_PATH": f"{src}/skills",
            "SKILL_CATALOG_EMBEDDING_MODEL": embedding_model,
            "SKILL_CATALOG_OLLAMA_HOST": ollama_host,
            "ENABLE_INTENT_ENHANCEMENT": intent_enhancement,
        },
    }
    existing = mcp.get("skill-catalog")
    if existing != desired:
        mcp["skill-catalog"] = desired
        changed = True
        print("[mcp] skill-catalog 配置已写入（venv 待初始化）")

# ── block-catalog ──
if os.path.exists(bc_python):
    desired_bc = {
        "type": "local",
        "command": [bc_python, "-m", "block_catalog.server"],
        "enabled": True,
        "environment": {
            "BLOCK_LIBRARY_PATH": f"{src}/blocks",
        },
    }
    existing_bc = mcp.get("block-catalog")
    if existing_bc != desired_bc:
        if existing_bc is not None:
            print("[mcp] block-catalog 已有配置，更新为最新")
        else:
            print("[mcp] block-catalog 新增")
        mcp["block-catalog"] = desired_bc
        changed = True
    else:
        print("[mcp] block-catalog 已是最新")
else:
    print(f"[warn]  block-catalog venv 不存在 ({bc_python})，先写入配置，venv 请用 init_claude.sh 初始化")
    desired_bc = {
        "type": "local",
        "command": [bc_python, "-m", "block_catalog.server"],
        "enabled": True,
        "environment": {
            "BLOCK_LIBRARY_PATH": f"{src}/blocks",
        },
    }
    existing_bc = mcp.get("block-catalog")
    if existing_bc != desired_bc:
        mcp["block-catalog"] = desired_bc
        changed = True
        print("[mcp] block-catalog 配置已写入（venv 待初始化）")
    else:
        print("[mcp] block-catalog 已是最新（venv 待初始化）")

# ── playwright-mcp ──
desired_pw = {
    "type": "local",
    "command": ["npx", "-y", "@playwright/mcp"],
    "enabled": True,
}
existing_pw = mcp.get("playwright-mcp")
if existing_pw != desired_pw:
    if existing_pw is not None:
        print("[mcp] playwright-mcp 已有配置，更新为最新")
    else:
        print("[mcp] playwright-mcp 新增")
    mcp["playwright-mcp"] = desired_pw
    changed = True
else:
    print("[mcp] playwright-mcp 已是最新")

# ── Plugin ──
desired_plugins = [f"{src}/vendor/superpowers"]
existing_plugins = config.get("plugin")
if existing_plugins != desired_plugins:
    if existing_plugins is not None:
        print("[plugin] plugin 已有配置，更新为最新")
    else:
        print("[plugin] plugin 新增")
    config["plugin"] = desired_plugins
    changed = True
else:
    print("[plugin] plugin 已是最新")

# ── Bailian cache proxy provider ──
# 只新增一个显式的百炼 provider；其他 provider 不会经过本地代理。
providers = config.setdefault("provider", {})
desired_bailian_cache = {
    "npm": "@ai-sdk/openai-compatible",
    "name": "Bailian custom cached",
    "options": {
        "baseURL": f"http://127.0.0.1:{bailian_cache_proxy_port}/compatible-mode/v1",
        "apiKey": "{env:DASHSCOPE_API_KEY}",
    },
    "models": {
        "qwen3.6-plus": {"name": "Qwen 3.6 Plus"},
        "qwen3.6-max": {"name": "Qwen 3.6 Max"},
        "qwen-plus": {"name": "Qwen Plus"},
        "qwen-max": {"name": "Qwen Max"},
        "qwen-turbo": {"name": "Qwen Turbo"},
        "qwen-coder-plus": {"name": "Qwen Coder Plus"},
        "qwen-coder-max": {"name": "Qwen Coder Max"},
    },
}
if providers.pop("bailian-cache", None) is not None:
    print("[provider] 已移除旧名 bailian-cache，改用 bailian-custom-cached")
    changed = True
existing_bailian_cache = providers.get("bailian-custom-cached")
if existing_bailian_cache != desired_bailian_cache:
    if existing_bailian_cache is not None:
        print("[provider] bailian-custom-cached 已有配置，更新为本地缓存代理")
    else:
        print("[provider] bailian-custom-cached 新增（仅该 provider 走本地缓存代理）")
    providers["bailian-custom-cached"] = desired_bailian_cache
    changed = True
else:
    print("[provider] bailian-custom-cached 已是最新")

# ── LSP ──
# 内置 LSP 仅支持 boolean (true/false) 或 object (disable/custom)。
# 空对象 {} 违反 schema 会导致 ConfigInvalidError，改用 lsp: true
# 全局启用。各 LSP 按文件扩展名 + 依赖检测惰性启动，无前提条件者不启动。
existing_lsp = config.get("lsp")
if existing_lsp is None or existing_lsp is False:
    config["lsp"] = True
    changed = True
    print("[lsp] 全局启用所有内置 LSP（按扩展名+依赖惰性启动）")
elif existing_lsp is True:
    print("[lsp] LSP 已全局启用")
elif isinstance(existing_lsp, dict):
    # 旧格式（如空对象）无效，回退为 true
    config["lsp"] = True
    changed = True
    print("[lsp] 检测到旧对象格式，回退为全局启用")
else:
    print("[warn]  lsp 字段类型异常，跳过")

if changed:
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[mcp] 已写入 {config_path}")
else:
    print("[mcp] opencode.json 已是最新，无需改动")
'

# ── CLAUDE_CONFIG_HOME 注册到 ~/.zshrc ──────────────────
# OpenCode 的 opencode.json 没有 top-level env 字段（仅 mcp.<name>.environment
# 可设；不覆盖 agent 主进程），shell 环境变量是 skill 中
# ${CLAUDE_CONFIG_HOME} 引用的唯一一致来源。逻辑与
# init_claude.sh / init_codex.sh 保持一致：
#   行内容 (export ...) 已存在 → no-op
#   CLAUDE_CONFIG_HOME 存在但路径不同 → warn 不覆盖
#   完全不存在 → 追加
ZSHRC="$HOME/.zshrc"
EXPORT_LINE="export CLAUDE_CONFIG_HOME=\"$SRC\""

if [ ! -f "$ZSHRC" ]; then
  echo "[skip] ~/.zshrc not found, please export CLAUDE_CONFIG_HOME manually"
elif grep -Fq "CLAUDE_CONFIG_HOME=" "$ZSHRC"; then
  if grep -Fxq "$EXPORT_LINE" "$ZSHRC"; then
    echo "[ok] CLAUDE_CONFIG_HOME already set to $SRC in ~/.zshrc"
  else
    echo "[warn] CLAUDE_CONFIG_HOME exists in ~/.zshrc but points elsewhere; please verify manually"
  fi
else
  printf '\n# CLAUDE_CONFIG_HOME (auto-registered by init_opencode.sh)\n%s\n' "$EXPORT_LINE" >> "$ZSHRC"
  echo "[linked] CLAUDE_CONFIG_HOME=$SRC registered in ~/.zshrc"
fi

echo "[done] init_opencode.sh 完成"
