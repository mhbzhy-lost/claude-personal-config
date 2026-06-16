#!/usr/bin/env bash
# init_opencode.sh
#
# 将 claude-config 中 opencode 所需的配置同步到 ~/.config/opencode/。
# 与 init_claude.sh 互补，不修改任何 Claude Code 配置。
#
# 职责：
#   - MCP server：转为 opencode 原生格式写入 opencode.json（幂等）
#   - Skills：关闭 Claude Code 兼容加载；保留 OpenCode 原生 skills / plugin
#   - Instructions：同步 AGENTS.md / Superpowers.md 到 OpenCode 全局规则入口
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

# ── Submodules ──────────────────────────────────────────
opencode_submodule_declared() {
  local submodule_path="$1"
  local git_cmd="${GIT_CMD:-git}"

  [ -f "$SRC/.gitmodules" ] || return 1

  local config_key configured_path
  while read -r config_key configured_path; do
    [ "${configured_path:-}" = "$submodule_path" ] && return 0
  done < <("$git_cmd" config --file "$SRC/.gitmodules" --get-regexp '^submodule\..*\.path$' 2>/dev/null || true)

  return 1
}

ensure_opencode_submodule_ready() {
  local submodule_path="$1"
  local required_path="$2"
  local git_cmd="${GIT_CMD:-git}"

  if [ -e "$required_path" ]; then
    echo "[submodule] ${submodule_path} 已就绪"
    return 0
  fi

  if ! command -v "$git_cmd" >/dev/null 2>&1; then
    echo "[error] git 不可用，无法初始化 ${submodule_path}"
    return 1
  fi

  if ! opencode_submodule_declared "$submodule_path"; then
    echo "[error] .gitmodules 未声明 ${submodule_path}，无法自动初始化"
    return 1
  fi

  echo "[submodule] ${submodule_path} 未初始化或内容不完整，执行 git submodule update"
  if ! "$git_cmd" -C "$SRC" submodule update --init --recursive -- "$submodule_path"; then
    echo "[error] ${submodule_path} 初始化失败，请检查网络或 git 凭据"
    return 1
  fi

  if [ ! -e "$required_path" ]; then
    echo "[error] ${submodule_path} 初始化后仍缺少 ${required_path}"
    return 1
  fi

  echo "[submodule] ${submodule_path} 已拉取"
}

ensure_opencode_required_submodules() {
  ensure_opencode_submodule_ready \
    "vendor/opencode-cache-proxy" \
    "$SRC/vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs"
  ensure_opencode_submodule_ready \
    "vendor/superpowers" \
    "$SRC/vendor/superpowers/skills"
  ensure_opencode_submodule_ready \
    "vendor/opencode-dynamic-workflow" \
    "$SRC/vendor/opencode-dynamic-workflow/lib/runner.mjs"
}

# ── OpenCode binary ─────────────────────────────────────
find_opencode_binary() {
  if command -v opencode >/dev/null 2>&1; then
    command -v opencode
    return 0
  fi

  local candidate
  for candidate in \
    "${OPENCODE_BIN:-}" \
    "$HOME/.opencode/bin/opencode" \
    "$HOME/.local/bin/opencode" \
    "/opt/homebrew/bin/opencode" \
    "/usr/local/bin/opencode"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

activate_opencode_binary() {
  local opencode_bin="$1"
  local opencode_dir
  opencode_dir="$(dirname "$opencode_bin")"

  case ":$PATH:" in
    *":$opencode_dir:"*) ;;
    *) export PATH="$opencode_dir:$PATH" ;;
  esac
}

ensure_opencode_installed() {
  local opencode_bin

  if opencode_bin="$(find_opencode_binary)"; then
    activate_opencode_binary "$opencode_bin"
    echo "[ok] OpenCode 已安装 ($(opencode --version 2>/dev/null || echo 'version unknown'))"
    return 0
  fi

  echo "[install] OpenCode 未安装，使用官方脚本安装..."
  curl -fsSL https://opencode.ai/install | bash

  if opencode_bin="$(find_opencode_binary)"; then
    activate_opencode_binary "$opencode_bin"
    echo "[install] OpenCode 安装完成"
    return 0
  fi

  echo "[error] OpenCode 安装失败，请手动安装后重试：https://opencode.ai"
  return 1
}

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

  # 退役 plugin：stop-verification 曾在每个 session.idle toast 提醒，噪音过高。
  # 大型任务结束检查统一挪到 git push gate，因此本仓托管的旧软链可自动清理。
  # dag-dispatch-hint.js 由 workflow-hint.js 替代：只在新插件已就位时才退役旧插件，
  # 避免 workflow install 失败后两个都不存在。
  local retired_plugin retired_link retired_target
  for retired_plugin in "stop-verification.js"; do
    retired_link="$dst_path/$retired_plugin"
    if [ -L "$retired_link" ]; then
      retired_target=$(readlink "$retired_link")
      case "$retired_target" in
        "$src_path/$retired_plugin")
          rm -f "$retired_link"
          echo "[plugin] 已移除退役 plugin 软链 $retired_link"
          ;;
      esac
    fi
  done
  # dag-dispatch-hint.js 只在 workflow-hint.js 已安装时退役
  local dag_link="$dst_path/dag-dispatch-hint.js"
  local wf_link="$dst_path/workflow-hint.js"
  if [ -L "$dag_link" ] && { [ -L "$wf_link" ] || [ -f "$wf_link" ]; }; then
    retired_target=$(readlink "$dag_link")
    case "$retired_target" in
      "$src_path/dag-dispatch-hint.js")
        rm -f "$dag_link"
        echo "[plugin] 已移除退役 plugin 软链 $dag_link（workflow-hint.js 已就位）"
        ;;
    esac
  fi

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

  local configure_args=(
    "$config_cli" opencode
    --repo-root "$SRC/vendor/opencode-cache-proxy" \
    --opencode-config "$OPENCODE_JSON" \
    --opencode-plugin-mode symlink \
    --opencode-plugin-dir "$plugin_dir" \
    --port "$BAILIAN_CACHE_PROXY_PORT"
  )

  node "${configure_args[@]}"
  printf '[auth] Cached provider key 可通过子仓交互命令录入: node "%s/vendor/opencode-cache-proxy/proxy/bin/opencode-cache-proxy-auth.mjs"\n' "$SRC"
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

# ── Global instructions 软链 ────────────────────────────
# OpenCode 在 OPENCODE_DISABLE_CLAUDE_CODE=1 时不会读取 ~/.claude/CLAUDE.md，
# 因此需要把本仓全局规则接到 OpenCode 原生全局入口：
#   ~/.config/opencode/AGENTS.md -> claude/CLAUDE.md
# Superpowers.md 由 opencode.json.instructions 显式注入；同目录保留软链用于
# 让该 instruction 能解析到本仓选择性 Superpowers 规则。
sync_opencode_instructions() {
  mkdir -p "$OPENCODE_CONFIG_DIR"

  local src_path dst_path cur
  for entry in "claude/CLAUDE.md:AGENTS.md" "claude/Superpowers.md:Superpowers.md"; do
    src_path="$SRC/${entry%%:*}"
    dst_path="$OPENCODE_CONFIG_DIR/${entry##*:}"

    if [ ! -e "$src_path" ] && [ ! -L "$src_path" ]; then
      echo "[skip]  ${src_path} 不存在，跳过 OpenCode instructions 同步"
      continue
    fi

    if [ -L "$dst_path" ]; then
      cur=$(readlink "$dst_path")
      if [ "$cur" = "$src_path" ]; then
        echo "[instructions] ${dst_path} -> ${src_path}（已就绪）"
      else
        echo "[warn]  ${dst_path} 是软链但指向 ${cur}（预期 ${src_path}），人工核对"
      fi
    elif [ -e "$dst_path" ]; then
      echo "[warn]  ${dst_path} 已存在且不是软链；请手动核对后指向 ${src_path}"
    else
      ln -s "$src_path" "$dst_path"
      echo "[instructions] $dst_path -> $src_path"
    fi
  done
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

# ── Submodules ──────────────────────────────────────────
ensure_opencode_required_submodules

# ── 确保 OpenCode 已安装 ────────────────────────────────
ensure_opencode_installed

# ── Skills ──────────────────────────────────────────────
# 默认关闭 OpenCode 的 Claude Code 兼容加载，避免把 ~/.claude/CLAUDE.md 和
# ~/.claude/skills/ 叠加进 OpenCode 首轮上下文；OpenCode 原生 skills / plugin
# 仍由自身配置加载。
echo "[skills] OpenCode Claude Code compatibility loading disabled via OPENCODE_DISABLE_CLAUDE_CODE"

# ── Run sync ────────────────────────────────────────────
sync_opencode_plugins
configure_opencode_cache_proxy
sync_opencode_instructions
sync_opencode_shared
sync_opencode_docs

# ── Workflow 子模块配置 ─────────────────────────────────
# install-opencode.sh 内含 npm install（网络操作），失败不应中断整个 init 流程。
workflow_install="$SRC/vendor/opencode-dynamic-workflow/install-opencode.sh"
if [ -f "$workflow_install" ]; then
  if ! bash "$workflow_install" --no-interactive \
    --plugin-dir "$OPENCODE_CONFIG_DIR/plugins" \
    --skill-dir "$OPENCODE_CONFIG_DIR/skills"; then
    echo "[warn]  workflow 子模块安装失败，workflow-hint 插件将保留为 fallback"
  fi
else
  echo "[skip]  vendor/opencode-dynamic-workflow 不存在，跳过 workflow 配置"
fi

# ── MCP 变量（与 init_claude.sh 保持一致） ──────────────
SKILL_CATALOG_DIR="$SRC/mcp/skill-catalog"
SKILL_CATALOG_VENV="$SKILL_CATALOG_DIR/.venv"
MCP_CMD="$SKILL_CATALOG_VENV/bin/python"

EMBEDDING_MODEL="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
OLLAMA_PORT="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
OLLAMA_HOST_URL="http://127.0.0.1:$OLLAMA_PORT"
ENABLE_INTENT_ENHANCEMENT="${ENABLE_INTENT_ENHANCEMENT:-true}"

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
$PY -c '
import json, os, sys

config_path = os.environ["OPENCODE_JSON"]
venv_python = os.environ["MCP_CMD"]
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

if "skill-catalog" in mcp:
    mcp.pop("skill-catalog", None)
    changed = True
    print("[mcp] skill-catalog 已移除（源码保留）")

if "block-catalog" in mcp:
    mcp.pop("block-catalog", None)
    changed = True
    print("[mcp] block-catalog 已移除（源码保留）")

# ── Instructions ──
# OpenCode 不展开 AGENTS.md 里的 @file 引用；通过原生 instructions 字段
# 让 Superpowers.md 与 AGENTS.md 一起注入。
desired_instruction = "Superpowers.md"
existing_instructions = config.get("instructions")
if existing_instructions is None:
    config["instructions"] = [desired_instruction]
    changed = True
    print("[instructions] Superpowers.md 新增")
elif isinstance(existing_instructions, list):
    if desired_instruction not in existing_instructions:
        existing_instructions.append(desired_instruction)
        changed = True
        print("[instructions] Superpowers.md 已追加")
    else:
        print("[instructions] Superpowers.md 已是最新")
else:
    print("[warn]  instructions 字段不是 list，跳过 Superpowers.md 自动追加")

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
existing_plugins = config.get("plugin")
retired_plugins = {f"{src}/vendor/superpowers"}
if isinstance(existing_plugins, list):
    kept_plugins = [item for item in existing_plugins if item not in retired_plugins]
    if kept_plugins != existing_plugins:
        if kept_plugins:
            config["plugin"] = kept_plugins
        else:
            config.pop("plugin", None)
        changed = True
        print("[plugin] 已移除 vendor/superpowers plugin，保留用户自管 plugin")
    else:
        print("[plugin] plugin 已是最新")
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

# ── OpenCode 运行环境注册到 ~/.zshrc ──────────────────
# OpenCode 的 opencode.json 没有 top-level env 字段（仅 mcp.<name>.environment
# 可设；不覆盖 agent 主进程），shell 环境变量是 skill 中
# ${CLAUDE_CONFIG_HOME} 引用的唯一一致来源。逻辑与
# init_claude.sh / init_codex.sh 保持一致：
#   变量存在且值一致（允许前后空白、可选 export、尾部注释）→ no-op
#   变量存在但值不同 → warn 不覆盖
#   完全不存在 → 追加
ZSHRC="$HOME/.zshrc"

zshrc_export_state() {
  local env_name="$1"
  local expected_value="$2"

  "$PY" - "$ZSHRC" "$env_name" "$expected_value" <<'PY'
import re
import shlex
import sys
from pathlib import Path

zshrc = Path(sys.argv[1])
env_name = sys.argv[2]
expected_value = sys.argv[3]


def normalize(value: str) -> str:
    value = value.strip()
    try:
        parsed = shlex.split("x=" + value, posix=True)
    except ValueError:
        return value.strip("\"'")
    if parsed and parsed[0].startswith("x="):
        return parsed[0][2:]
    return value.strip("\"'")


pattern = re.compile(
    r"^\s*(?:export\s+)?" + re.escape(env_name) + r"\s*=\s*(.*?)\s*(?:#.*)?\r?$"
)
expected = normalize(expected_value)

for line in zshrc.read_text(encoding="utf-8").splitlines():
    match = pattern.match(line)
    if not match:
        continue
    print("match" if normalize(match.group(1)) == expected else "different")
    raise SystemExit(0)

print("missing")
PY
}

register_zshrc_export() {
  local env_name="$1"
  local export_line="$2"
  local display_value="$3"
  local comment="$4"
  local expected_value="${export_line#*=}"
  local state

  if [ ! -f "$ZSHRC" ]; then
    echo "[skip] ~/.zshrc not found, please set ${env_name} manually"
  else
    state="$(zshrc_export_state "$env_name" "$expected_value")"
    if [ "$state" = "match" ]; then
      echo "[ok] ${env_name} already set to ${display_value} in ~/.zshrc"
    elif [ "$state" = "different" ]; then
      echo "[warn] ${env_name} exists in ~/.zshrc but points elsewhere; please verify manually"
    else
      printf '\n# %s (auto-registered by init_opencode.sh)\n%s\n' "$comment" "$export_line" >> "$ZSHRC"
      echo "[linked] ${env_name}=${display_value} registered in ~/.zshrc"
    fi
  fi
}

register_zshrc_export \
  "CLAUDE_CONFIG_HOME" \
  "export CLAUDE_CONFIG_HOME=\"$SRC\"" \
  "$SRC" \
  "CLAUDE_CONFIG_HOME"

register_zshrc_export \
  "OPENCODE_DISABLE_CLAUDE_CODE" \
  "export OPENCODE_DISABLE_CLAUDE_CODE=1" \
  "1" \
  "Disable OpenCode Claude Code compatibility loading"

register_zshrc_export \
  "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS" \
  "export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true" \
  "true" \
  "Enable OpenCode experimental background subagents"

if command -v lsof >/dev/null 2>&1 \
    && lsof -nP -iTCP:48761 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "======================================================================"
  echo "[warn] opencode-cache-proxy 正在监听 127.0.0.1:48761"
  echo "       若刚更新 proxy 代码，请重启该进程以加载最新修复。"
  echo "======================================================================"
fi

echo "[done] init_opencode.sh 完成"
