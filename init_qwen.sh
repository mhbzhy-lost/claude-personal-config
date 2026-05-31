#!/usr/bin/env bash
# init_qwen.sh
#
# 将 claude-config 中 Qwen Code 所需的外围服务配置同步到 ~/.qwen/。
# 与 init_claude.sh / init_opencode.sh / init_codex.sh 并列，不修改其他端配置。
#
# 职责：
#   - MCP server：写入 ~/.qwen/settings.json 的 mcpServers（完全覆盖）
#   - Hooks：写入 ~/.qwen/settings.json 的本仓 hooks（完全覆盖）
#   - Bailian cache proxy：调用 vendor/opencode-cache-proxy 自带配置入口
#   - Permissions：写入 ~/.qwen/settings.json 的 permissions.allow（并集合并）
#   - Skills：按 agents/skills.list 软链到 ~/.qwen/skills/
#
# 不影响 ~/.claude.json / ~/.claude/ / ~/.config/opencode/ / ~/.codex/，可独立运行。
#
# 合并策略：
#   - env / model / providerMetadata / $version → 不碰
#   - mcpServers / 本仓 hooks → 完全覆盖（init 是唯一管理方）
#   - cache proxy provider / SessionStart / SessionEnd → 交给 vendor/opencode-cache-proxy 合并
#   - permissions.allow → 并集合并（只增不删）
# ---------------------------------------------------------------------------
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QWEN_CONFIG_DIR="${QWEN_CONFIG_DIR:-$HOME/.qwen}"
QWEN_SETTINGS="$QWEN_CONFIG_DIR/settings.json"

# ===========================================================================
# === 前置检查 ===============================================================
# ===========================================================================

if ! command -v python3 >/dev/null 2>&1; then
  echo "[error] Python3 不可用，请安装后重试"
  exit 1
fi

# ===========================================================================
# === MCP / Hooks / Permissions 合并写入 settings.json =======================
# ===========================================================================

# 路径变量（供 Python 脚本读取）
SKILL_CATALOG_VENV="$SRC/mcp/skill-catalog/.venv"
BLOCK_CATALOG_VENV="$SRC/mcp/block-catalog/.venv"

EMBEDDING_MODEL="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
OLLAMA_PORT="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
OLLAMA_HOST_URL="http://127.0.0.1:$OLLAMA_PORT"
ENABLE_INTENT_ENHANCEMENT="${ENABLE_INTENT_ENHANCEMENT:-true}"
BAILIAN_CACHE_PROXY_PORT="${BAILIAN_CACHE_PROXY_PORT:-48761}"
QWEN_BAILIAN_MODEL_IDS="${QWEN_BAILIAN_MODEL_IDS:-qwen3.6-plus,qwen3.7-max}"
QWEN_BAILIAN_STALE_MODEL_IDS="${QWEN_BAILIAN_STALE_MODEL_IDS:-qwen3-coder-plus}"
QWEN_BAILIAN_PROVIDER_BASE_URL="${QWEN_BAILIAN_PROVIDER_BASE_URL:-http://127.0.0.1:${BAILIAN_CACHE_PROXY_PORT}/v1}"
QWEN_BAILIAN_PROVIDER_ENV_KEY="${QWEN_BAILIAN_PROVIDER_ENV_KEY:-BAILIAN_TOKEN_PLAN_API_KEY}"
QWEN_BAILIAN_CONTEXT_WINDOW_SIZE="${QWEN_BAILIAN_CONTEXT_WINDOW_SIZE:-1000000}"

mkdir -p "$QWEN_CONFIG_DIR"

export QWEN_SETTINGS="$QWEN_SETTINGS"
export SRC="$SRC"
export SKILL_CATALOG_VENV="$SKILL_CATALOG_VENV"
export BLOCK_CATALOG_VENV="$BLOCK_CATALOG_VENV"
export EMBEDDING_MODEL="$EMBEDDING_MODEL"
export OLLAMA_HOST_URL="$OLLAMA_HOST_URL"
export ENABLE_INTENT_ENHANCEMENT="$ENABLE_INTENT_ENHANCEMENT"

python3 -c '
import json, os, sys, tempfile

settings_path = os.environ["QWEN_SETTINGS"]
src = os.environ["SRC"]
sc_venv = os.environ["SKILL_CATALOG_VENV"]
bc_venv = os.environ["BLOCK_CATALOG_VENV"]
embedding_model = os.environ["EMBEDDING_MODEL"]
ollama_host = os.environ["OLLAMA_HOST_URL"]
intent_enhancement = os.environ["ENABLE_INTENT_ENHANCEMENT"]

# ── 读取现有 settings.json ──
settings = {}
if os.path.exists(settings_path):
    try:
        with open(settings_path) as f:
            settings = json.load(f)
    except json.JSONDecodeError as e:
        print(f"[error] {settings_path} 不是合法 JSON：{e}", file=sys.stderr)
        sys.exit(1)

# ── mcpServers：完全覆盖 ──
bc_python = os.path.join(bc_venv, "bin", "python")

if not os.path.exists(bc_python):
    print(f"[warn]  block-catalog venv 不存在 ({bc_python})，配置仍会写入；请先运行 init_claude.sh 初始化 venv")

mcp_servers = {
    "block-catalog": {
        "command": bc_python,
        "args": ["-m", "block_catalog.server"],
        "env": {
            "BLOCK_LIBRARY_PATH": f"{src}/blocks",
        },
    },
    "playwright-mcp": {
        "command": "npx",
        "args": ["-y", "@playwright/mcp"],
    },
    "playwright-mcp-headless": {
        "command": "npx",
        "args": ["-y", "@playwright/mcp", "--headless"],
    },
}

existing_mcp = settings.get("mcpServers")
if existing_mcp != mcp_servers:
    if existing_mcp is not None:
        print("[mcp] mcpServers 已有配置，覆盖为最新")
    else:
        print("[mcp] mcpServers 新增（4 个 server）")
    settings["mcpServers"] = mcp_servers
else:
    print("[mcp] mcpServers 已是最新")

# ── hooks：完全覆盖 ──
hooks = {
    "PreToolUse": [
        {
            "matcher": "mcp__skill-catalog__resolve",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/qwen/hooks/skill-resolve-preflight.sh",
                }
            ],
        },
        {
            # Qwen Code shell 工具名为 run_shell_command（不是 Bash）
            "matcher": "run_shell_command",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/qwen/hooks/git-commit-hint.sh",
                },
                {
                    "type": "command",
                    "command": f"{src}/shared/hooks/external-review-gate.sh",
                },
            ],
        },
        {
            # Qwen Code 编辑工具名：edit（对应 Claude Edit）、write_file（对应 Claude Write）
            "matcher": "edit|write_file",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/qwen/hooks/coding-guard.sh",
                }
            ],
        },
    ],
    "PostToolUse": [
        {
            "matcher": "run_shell_command",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/qwen/hooks/test-failure-hint.sh",
                }
            ],
        },
    ],
    "PostToolUseFailure": [
        {
            "matcher": "run_shell_command",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/qwen/hooks/circuit-breaker.sh",
                }
            ],
        },
    ],
    "SubagentStart": [
        {
            "matcher": "coding-expert",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/claude/hooks/coding-expert-rules-inject.sh",
                }
            ],
        },
        {
            "matcher": "coding-expert-light",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/claude/hooks/coding-expert-rules-inject.sh",
                }
            ],
        },
        {
            "matcher": "coding-expert-heavy",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{src}/claude/hooks/coding-expert-rules-inject.sh",
                }
            ],
        },
    ],
}

existing_hooks = settings.get("hooks")
if not isinstance(existing_hooks, dict):
    existing_hooks = {}
    settings["hooks"] = existing_hooks

hooks_changed = False
for hook_key, desired_hook_value in hooks.items():
    if existing_hooks.get(hook_key) != desired_hook_value:
        existing_hooks[hook_key] = desired_hook_value
        hooks_changed = True

# SessionStart 不是本仓独占事件，按 command upsert memory loader，保留用户
# 或其它系统已有 hook（如 cache proxy start）。
desired_session_start = {
    "hooks": [
        {
            "type": "command",
            "command": f"{src}/claude/hooks/memory-loader.sh",
        }
    ],
}
session_start = existing_hooks.setdefault("SessionStart", [])
memory_cmd = desired_session_start["hooks"][0]["command"]
found_memory = False
for idx, entry in enumerate(session_start):
    if not isinstance(entry, dict):
        continue
    if any(
        isinstance(h, dict) and h.get("command") == memory_cmd
        for h in entry.get("hooks", []) if isinstance(h, dict)
    ):
        found_memory = True
        if entry != desired_session_start:
            session_start[idx] = desired_session_start
            hooks_changed = True
        break
if not found_memory:
    session_start.append(desired_session_start)
    hooks_changed = True

existing_stop = existing_hooks.get("Stop")
if isinstance(existing_stop, list):
    pruned_stop = [
        entry for entry in existing_stop
        if not (
            isinstance(entry, dict)
            and any(
                isinstance(h, dict)
                and h.get("command", "").endswith("/stop-verification.sh")
                for h in entry.get("hooks", []) if isinstance(h, dict)
            )
        )
    ]
    if len(pruned_stop) != len(existing_stop):
        if pruned_stop:
            existing_hooks["Stop"] = pruned_stop
        else:
            existing_hooks.pop("Stop", None)
        hooks_changed = True

if hooks_changed:
    print("[hooks] 本仓 hooks 已同步（PreToolUse ×3 + PostToolUse + PostToolUseFailure + SessionStart + SubagentStart ×3；其它 hook 保留）")
else:
    print("[hooks] 本仓 hooks 已是最新")

# ── permissions.allow：并集合并（最小集） ──
managed_perms = [
    "mcp__block-catalog",
    "mcp__playwright-mcp",
    "mcp__playwright-mcp-headless",
    "Bash(git commit *)",
    "Bash(git diff *)",
    "Bash(git log *)",
    "Bash(git status*)",
    "Bash(git add *)",
]

perms = settings.setdefault("permissions", {})
existing_allow = set(perms.get("allow", []))
merged_allow = sorted(existing_allow | set(managed_perms))

if merged_allow != sorted(existing_allow):
    new_count = len(merged_allow) - len(existing_allow)
    print(f"[perms] permissions.allow 新增 {new_count} 条（并集合并，现有 {len(existing_allow)} 条保留）")
    perms["allow"] = merged_allow
else:
    print("[perms] permissions.allow 已是最新")

# ── 写回 ──
settings_dir = os.path.dirname(settings_path) or "."
tmp_path = None
try:
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=settings_dir,
        delete=False,
    ) as f:
        tmp_path = f.name
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp_path, settings_path)
finally:
    if tmp_path and os.path.exists(tmp_path):
        os.unlink(tmp_path)

print(f"[done] settings.json 已更新: {settings_path}")
'

configure_qwen_cache_proxy() {
  local config_cli="$SRC/vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs"

  if [ ! -f "$config_cli" ]; then
    echo "[skip]  vendor/opencode-cache-proxy 配置入口不存在，跳过 Bailian cache proxy"
    return
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "[warn]  node 不可用，无法运行 Bailian cache proxy 配置入口，跳过"
    return
  fi

  node "$config_cli" qwen \
    --repo-root "$SRC/vendor/opencode-cache-proxy" \
    --qwen-settings "$QWEN_SETTINGS" \
    --port "$BAILIAN_CACHE_PROXY_PORT" \
    --qwen-base-url "$QWEN_BAILIAN_PROVIDER_BASE_URL" \
    --qwen-models "$QWEN_BAILIAN_MODEL_IDS" \
    --qwen-stale-models "$QWEN_BAILIAN_STALE_MODEL_IDS" \
    --qwen-env-key "$QWEN_BAILIAN_PROVIDER_ENV_KEY" \
    --qwen-context-window-size "$QWEN_BAILIAN_CONTEXT_WINDOW_SIZE"
}

configure_qwen_cache_proxy

# ===========================================================================
# === Skills 软链：agents/skills.list → ~/.qwen/skills/ =====================
# ===========================================================================

read_list_file() {
  local file="$1"
  sed -E 's/#.*$//' "$file" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$'
}

sync_qwen_skills() {
  local dst_dir="$QWEN_CONFIG_DIR/skills"
  local claude_skills_dir="$SRC/claude-skills"
  local superpowers_dir="$SRC/vendor/superpowers/skills"

  local default_list="$SRC/agents/skills.list"
  local local_list="$SRC/agents/skills.list.local"
  local list_file="$default_list"
  [ -f "$local_list" ] && list_file="$local_list"

  if [ ! -f "$list_file" ]; then
    echo "[warn] 白名单文件 $list_file 不存在，跳过 skill 同步"
    return
  fi

  if [ "$list_file" = "$SRC/agents/skills.list.local" ]; then
    echo "[skills] 使用本机覆盖清单: $list_file"
  fi

  mkdir -p "$dst_dir"

  local skill_name src_skill dst_skill cur
  while IFS= read -r skill_name; do
    if [ -d "$claude_skills_dir/$skill_name" ]; then
      src_skill="$claude_skills_dir/$skill_name"
    elif [ -d "$superpowers_dir/$skill_name" ]; then
      src_skill="$superpowers_dir/$skill_name"
    else
      echo "[warn] skill '$skill_name' 在白名单中，但 claude-skills/ 与 vendor/superpowers/skills/ 都没有"
      continue
    fi

    dst_skill="$dst_dir/$skill_name"

    if [ -L "$dst_skill" ]; then
      cur=$(readlink "$dst_skill")
      if [ "$cur" = "$src_skill" ]; then
        echo "[ok] $dst_skill -> $src_skill"
      else
        ln -sfn "$src_skill" "$dst_skill"
        echo "[relink] $dst_skill -> $src_skill (was $cur)"
      fi
    elif [ -e "$dst_skill" ]; then
      echo "[warn] $dst_skill 存在为非软链，跳过"
    else
      ln -s "$src_skill" "$dst_skill"
      echo "[linked] $dst_skill -> $src_skill"
    fi
  done < <(read_list_file "$list_file")
}

sync_qwen_skills

echo ""
echo "[summary]"
echo "  Settings:  $QWEN_SETTINGS"
echo "  Skills:    $QWEN_CONFIG_DIR/skills/"
echo "  Hooks:     $SRC/qwen/hooks/"
echo ""
echo "  请重启 Qwen Code 使配置生效。"
