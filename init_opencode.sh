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

SRC="$(cd "$(dirname "$0")" && pwd)"

OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
OPENCODE_JSON="$OPENCODE_CONFIG_DIR/opencode.json"

# ── Skills ──────────────────────────────────────────────
# opencode 原生搜索路径含 ~/.claude/skills/<name>/SKILL.md，
# 由 init_claude.sh 的 sync_claude_skills 维护，无需额外操作。
echo "[skills] opencode 读取 ~/.claude/skills/，已由 init_claude.sh 维护，无需额外配置"

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

if changed:
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[mcp] 已写入 {config_path}")
else:
    print("[mcp] opencode.json 已是最新，无需改动")
'

echo "[done] init_opencode.sh 完成"
