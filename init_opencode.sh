#!/usr/bin/env bash
# init_opencode.sh
#
# 将 claude-config 中 opencode 所需的配置同步到 ~/.config/opencode/。
# 与 init_claude.sh 互补，不修改任何 Claude Code 配置。
#
# 职责：
#   - MCP server：转为 opencode 原生格式写入 opencode.json（幂等）
#   - Skills：opencode 原生读取 ~/.claude/skills/，已由 init_claude.sh 维护
#   - OpenAI-compatible cache proxy：调用 vendor/opencode-cache-proxy 自带配置入口
#
# 不影响 ~/.claude.json / ~/.claude/，可独立运行。
#
# Library mode（仅供单测）：
#   OPENCODE_INIT_AS_LIBRARY=1 source init_opencode.sh
# 该模式下脚本只加载 sync_opencode_*() 函数定义，跳过 opencode 安装检查、
# 软链同步、opencode.json 写入与 ~/.zshrc 注册等所有副作用。
# ---------------------------------------------------------------------------
set -euo pipefail

# 用 BASH_SOURCE[0] 替代 $0：即使脚本被 source 执行也能正确定位自身目录
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
OPENCODE_JSON="$OPENCODE_CONFIG_DIR/opencode.json"
BAILIAN_CACHE_PROXY_PORT="${BAILIAN_CACHE_PROXY_PORT:-48761}"

# ===========================================================================
# === Function definitions (safe to source) =================================
# ===========================================================================

# ── Plugin ──────────────────────────────────────────────
# opencode 不兼容 Claude Code 的 settings.json hooks，改用原生 plugin 机制。
# 策略：
#   - 目标目录不存在 → 创建真实目录，仓内 plugin 逐文件软链进去
#   - 目标已是本仓整目录软链 → 迁移为真实目录 + 逐文件软链
#   - 目标已是旧版本仓软链 → 迁移为真实目录 + 逐文件软链
#   - 目标已是软链但指向他处 → 警告
#   - 目标是真目录（混着用户自管 plugin）→ per-file symlink 模式：
#       · 仓内 plugin 各自建独立软链让仓改动自动同步
#       · 真文件副本与仓内一致时静默升级为软链
#       · 真文件副本与仓内不一致时警告保留（疑似用户本地改动）
#       · 用户自管文件（不在仓内 opencode/plugins/ 中）原样不动
sync_opencode_plugins() {
  local src_path="$SRC/opencode/plugins"
  local dst_path="$OPENCODE_CONFIG_DIR/plugins"

  if [ ! -d "$src_path" ]; then
    echo "[skip]  opencode/plugins/ 不存在，跳过"
    return
  fi

  mkdir -p "$OPENCODE_CONFIG_DIR"

  # 不存在 → 创建真实目录，避免 cache proxy 子仓配置写入时被整目录软链
  # 重新映射回主仓 opencode/plugins/。
  if [ ! -e "$dst_path" ] && [ ! -L "$dst_path" ]; then
    mkdir -p "$dst_path"
    echo "[plugin] $dst_path 已创建（per-file symlink 模式）"
  fi

  # 已是本仓整目录软链 → 迁移为真实目录。cache proxy 插件现在由子仓
  # 配置入口管理，继续保留整目录软链会把子仓写入反向落到主仓。
  if [ -L "$dst_path" ]; then
    local cur legacy_src_path
    cur=$(readlink "$dst_path")
    legacy_src_path="$SRC/opencode-plugins"
    if [ "$cur" = "$src_path" ]; then
      rm -f "$dst_path"
      mkdir -p "$dst_path"
      echo "[plugin] $dst_path 从整目录软链迁移为 per-file symlink 模式"
    elif [ "$cur" = "$legacy_src_path" ]; then
      rm -f "$dst_path"
      mkdir -p "$dst_path"
      echo "[plugin] $dst_path 从旧路径 ${legacy_src_path} 迁移为 per-file symlink 模式"
    else
      echo "[warn]  $dst_path 是软链但指向 ${cur}（非本仓 opencode/plugins/），人工核对后再处理"
      return
    fi
  fi

  # 是真目录 → per-file symlink 模式
  echo "[plugin] $dst_path 是真目录，进入 per-file symlink 模式"

  # 清理旧版逐文件软链残留（指向已废弃路径）
  local legacy_link="$dst_path/git-commit-hint.js"
  if [ -L "$legacy_link" ]; then
    local legacy_target
    legacy_target=$(readlink "$legacy_link")
    if [ "$legacy_target" = "$SRC/opencode-plugins/git-commit-hint.js" ]; then
      rm -f "$legacy_link"
      echo "[plugin] 已清理旧路径软链 $legacy_link"
    fi
  fi

  # 仓内 opencode/plugins/ 目前是平铺文件，不递归处理子目录；若未来添加
  # 子目录形态的 plugin，需要在此扩展递归逻辑。
  local src_file dst_file basename current_target
  for src_file in "$src_path"/*; do
    [ -e "$src_file" ] || continue
    if [ -d "$src_file" ]; then
      basename=$(basename "$src_file")
      echo "[plugin] 跳过仓内子目录 $basename/（per-file 模式只处理平铺文件）"
      continue
    fi
    [ -f "$src_file" ] || continue
    basename=$(basename "$src_file")
    dst_file="$dst_path/$basename"

    # 已是正确软链 → 跳过
    if [ -L "$dst_file" ] && [ "$(readlink "$dst_file")" = "$src_file" ]; then
      continue
    fi

    # 是软链但指向其他位置 → 警告不动
    if [ -L "$dst_file" ]; then
      current_target=$(readlink "$dst_file")
      echo "[warn]  $dst_file 是软链但指向 ${current_target}，人工核对后再处理"
      continue
    fi

    # 是真文件
    if [ -f "$dst_file" ]; then
      if cmp -s "$src_file" "$dst_file"; then
        # 内容与仓内一致 → 静默升级为软链（user 没有改过这份 cp 副本）
        rm -f "$dst_file"
        ln -s "$src_file" "$dst_file"
        echo "[plugin] $basename 升级为软链（内容与仓内一致）"
      else
        # 内容不一致 → 可能是 user 本地改动，保留真文件不覆盖
        echo "[warn]  $dst_file 与仓内不一致；若是本仓 plugin 想保留的本地改动请 PR 回仓，否则 rm 后重跑 init 自动建软链"
      fi
      continue
    fi

    # 是目录（与本仓 plugin 同名的目录）→ 警告不动，避免 ln -s 失败让
    # set -e 中断整个 init 流程
    if [ -d "$dst_file" ]; then
      echo "[warn]  $dst_file 是目录，与本仓 plugin 同名；人工核对（移除或重命名）后再重跑 init"
      continue
    fi

    # 不存在 → 直接建软链
    ln -s "$src_file" "$dst_file"
    echo "[plugin] $basename → 软链（首次同步）"
  done

  # 扫描 dst 中指向本仓但本仓已无该文件的孤儿软链（仓内删 plugin 后 user
  # 环境的残留）。只 warn 不自动删——保守，让 user 自己决定；自动删可能
  # 误删 user 改过软链 target 的情况。
  local dst_entry orphan_target
  for dst_entry in "$dst_path"/*; do
    [ -L "$dst_entry" ] || continue
    orphan_target=$(readlink "$dst_entry")
    case "$orphan_target" in
      "$src_path"/*)
        if [ ! -e "$orphan_target" ]; then
          echo "[warn]  $dst_entry 是指向本仓的软链但 target ${orphan_target} 已不存在；本仓可能删除了该 plugin，请确认后 rm $dst_entry"
        fi
        ;;
    esac
  done
}

configure_opencode_cache_proxy() {
  local config_cli="$SRC/vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs"
  local plugin_dir="${OPENCODE_CACHE_PROXY_PLUGIN_DIR:-$OPENCODE_CONFIG_DIR/plugins}"

  if [ ! -f "$config_cli" ]; then
    echo "[skip]  vendor/opencode-cache-proxy 配置入口不存在，跳过 OpenAI-compatible cache proxy"
    return
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "[warn]  node 不可用，无法运行 OpenAI-compatible cache proxy 配置入口，跳过"
    return
  fi

  node "$config_cli" opencode \
    --repo-root "$SRC/vendor/opencode-cache-proxy" \
    --opencode-config "$OPENCODE_JSON" \
    --opencode-plugin-mode symlink \
    --opencode-plugin-dir "$plugin_dir" \
    --opencode-api-key-env "${OPENCODE_CACHE_PROXY_API_KEY_ENV:-DASHSCOPE_API_KEY}" \
    --port "$BAILIAN_CACHE_PROXY_PORT"
}

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

# ── docs/ 软链 ──────────────────────────────────────────
# OpenCode plugin（如 git-commit-hint.js）会在 hint 文本里嵌入指向 docs/knowledge/
# 的绝对路径。CLAUDE_CONFIG_HOME 未注入时（如 GUI 启动），fallback 路径解析到
# ~/.config/opencode/docs/...，需要软链才能让 user 真能点开那个 README。
sync_opencode_docs() {
  local src_path="$SRC/docs"
  local dst_path="$OPENCODE_CONFIG_DIR/docs"

  if [ ! -d "$src_path" ]; then
    echo "[skip]  docs/ 不存在，跳过"
    return
  fi

  mkdir -p "$OPENCODE_CONFIG_DIR"

  if [ ! -e "$dst_path" ] && [ ! -L "$dst_path" ]; then
    ln -s "$src_path" "$dst_path"
    echo "[docs]   $dst_path -> ${src_path}"
    return
  fi

  if [ -L "$dst_path" ]; then
    local cur
    cur=$(readlink "$dst_path")
    if [ "$cur" = "$src_path" ]; then
      echo "[docs]   $dst_path -> ${src_path}（已就绪）"
    else
      echo "[warn]  $dst_path 是软链但指向 ${cur}（非本仓 docs/），人工核对后再处理"
    fi
    return
  fi

  echo "[warn]  $dst_path 已存在且不是软链；请手动核对后指向 $src_path"
}

# ===========================================================================
# === Library guard =========================================================
# 单测把 OPENCODE_INIT_AS_LIBRARY=1 之后 source 此脚本，期望只加载上面的
# sync_opencode_*() 函数定义、跳过下面所有副作用（opencode 安装检查 / 软链
# 创建 / opencode.json 写入 / ~/.zshrc 注册）。
# ===========================================================================
[ "${OPENCODE_INIT_AS_LIBRARY:-0}" = "1" ] && return 0 2>/dev/null

# ===========================================================================
# === Main flow =============================================================
# ===========================================================================

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

# ── Skills ──────────────────────────────────────────────
# opencode 原生搜索路径含 ~/.claude/skills/<name>/SKILL.md，
# 由 init_claude.sh 的 sync_claude_skills 维护，无需额外操作。
echo "[skills] opencode 读取 ~/.claude/skills/，已由 init_claude.sh 维护，无需额外配置"

# ── Run sync ────────────────────────────────────────────
sync_opencode_plugins
configure_opencode_cache_proxy
sync_opencode_shared
sync_opencode_docs

# ── MCP 变量（与 init_claude.sh 保持一致） ──────────────
SKILL_CATALOG_DIR="$SRC/mcp/skill-catalog"
SKILL_CATALOG_VENV="$SKILL_CATALOG_DIR/.venv"
MCP_CMD="$SKILL_CATALOG_VENV/bin/python"

EMBEDDING_MODEL="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
OLLAMA_PORT="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
OLLAMA_HOST_URL="http://127.0.0.1:$OLLAMA_PORT"
ENABLE_INTENT_ENHANCEMENT="${ENABLE_INTENT_ENHANCEMENT:-true}"

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

$PY -c '
import json, os, sys

config_path = os.environ["OPENCODE_JSON"]
venv_python = os.environ["MCP_CMD"]
bc_python = os.environ["BC_CMD"]
src = os.environ["SRC"]
embedding_model = os.environ["EMBEDDING_MODEL"]
ollama_host = os.environ["OLLAMA_HOST_URL"]
intent_enhancement = os.environ["ENABLE_INTENT_ENHANCEMENT"]

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
# 暴露两个 server，agent 自由选用：
#   - playwright-mcp           （headed，默认；本地调试看得见浏览器）
#   - playwright-mcp-headless  （--headless；自动化 / 远程 / CI 友好）
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

desired_pw_headless = {
    "type": "local",
    "command": ["npx", "-y", "@playwright/mcp", "--headless"],
    "enabled": True,
}
existing_pw_headless = mcp.get("playwright-mcp-headless")
if existing_pw_headless != desired_pw_headless:
    if existing_pw_headless is not None:
        print("[mcp] playwright-mcp-headless 已有配置，更新为最新")
    else:
        print("[mcp] playwright-mcp-headless 新增")
    mcp["playwright-mcp-headless"] = desired_pw_headless
    changed = True
else:
    print("[mcp] playwright-mcp-headless 已是最新")

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

# ── Permission ──
# opencode-permission.json 是 SSOT 模板，写入 opencode.json.permission。
# 不做增量合并：整体替换模板内容，保持与仓内 SSOT 文件一致。
permission_path = os.path.join(src, "opencode", "opencode-permission.json")
if os.path.exists(permission_path):
    try:
        with open(permission_path) as f:
            perm_ssot_content = json.load(f)
        perm_template = perm_ssot_content.get("template")
        if perm_template:
            existing_perm = config.get("permission")
            if existing_perm != perm_template:
                if existing_perm is not None:
                    print("[permission] permission 已有配置，更新为 SSOT 模板")
                else:
                    print("[permission] permission 新增")
                config["permission"] = perm_template
                changed = True
            else:
                print("[permission] permission 已是最新")
        else:
            print(f"[warn]  {permission_path} 中无 template 字段，跳过")
    except json.JSONDecodeError as e:
        print(f"[warn]  {permission_path} 不是合法 JSON：{e}，跳过", file=sys.stderr)
else:
    print(f"[skip]  opencode/opencode-permission.json 不存在，跳过 permission 同步")

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
