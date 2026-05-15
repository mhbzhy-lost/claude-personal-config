#!/usr/bin/env bash
# init_codex.sh
#
# 将 claude-config 中可直接复用到 Codex 的共享 agent runtime 资源接到
# Codex 约定位置。脚本本身通过 shell 执行，但生成的是可被 Codex CLI、
# Codex app、IDE extension 共同消费的配置层：
#   - `claude/CLAUDE.md`          -> `~/AGENTS.md`
#   - `memory.md`                 -> `~/.codex/memory.md`
#   - `claude-skills/<name>`      -> `~/.agents/skills/<name>`（共享 skill 白名单）
#   - `vendor/superpowers`        -> 注册为本地 marketplace 并启用 plugin
#   - `codex/hooks.json`          -> 渲染到 `~/.codex/hooks.json`
#   - `mcp/*`                     -> 合并到 `~/.codex/config.toml`
#
# 设计原则：
#   - 幂等：重复执行不应产生额外副作用
#   - 保守：若目标已是真实文件/目录，报警但不覆盖
#   - 单源：claude-config/ 为事实源，Codex 侧仅做共享 runtime 挂载
#   - 渐进迁移：`skills/` 继续通过 skill-catalog MCP 暴露，不强行扁平化为
#     Codex 原生 skills；仅将已验证可直用的 `claude-skills/` 白名单暴露出来
#   - 不写入 app-only 配置：外观、通知、browser use、桌面权限等均不在此脚本管理

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
USER_SKILLS_DIR="$HOME/.agents/skills"
GLOBAL_AGENTS_PATH="$HOME/AGENTS.md"
CODEX_MEMORY_PATH="$CODEX_HOME/memory.md"
HOOKS_TEMPLATE="$SRC/codex/hooks.json"
HOOKS_OUTPUT="$CODEX_HOME/hooks.json"
CONFIG_PATH="$CODEX_HOME/config.toml"
BEGIN_MARKER="# >>> claude-config codex init >>>"
END_MARKER="# <<< claude-config codex init <<<"

read_list_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%% #*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    printf '%s\n' "$line"
  done < "$file"
}

link_path() {
  local src_path="$1"
  local dst_path="$2"

  if [ ! -e "$src_path" ] && [ ! -L "$src_path" ]; then
    echo "[skip] source $src_path does not exist"
    return
  fi

  if [ -L "$dst_path" ]; then
    local cur
    cur="$(readlink "$dst_path")"
    if [ "$cur" = "$src_path" ]; then
      echo "[ok] $dst_path -> $src_path"
    elif [ "$dst_path" = "$GLOBAL_AGENTS_PATH" ] && [ "$cur" = "$SRC/codex/AGENTS.md" ]; then
      rm -f "$dst_path"
      ln -s "$src_path" "$dst_path"
      echo "[migrated] $dst_path -> $src_path"
    else
      echo "[warn] $dst_path is a symlink pointing to $cur (expected $src_path). Please verify and fix manually."
    fi
  elif [ -e "$dst_path" ]; then
    echo "[warn] $dst_path exists as real file/dir. Not overwriting."
  else
    mkdir -p "$(dirname "$dst_path")"
    ln -s "$src_path" "$dst_path"
    echo "[linked] $dst_path -> $src_path"
  fi
}

ensure_codex_installed() {
  if command -v codex >/dev/null 2>&1; then
    echo "[ok] Codex CLI is installed ($(codex --version 2>/dev/null || echo 'version unknown'))"
    return
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "[error] Codex CLI is not installed and npm is unavailable."
    echo "        Install Node.js/npm, then rerun this script."
    exit 1
  fi

  echo "[install] Codex CLI is missing, installing with npm..."
  npm i -g @openai/codex@latest

  if ! command -v codex >/dev/null 2>&1; then
    echo "[error] Codex CLI installation failed."
    exit 1
  fi

  echo "[install] Codex CLI installation completed"
}

sync_codex_skills() {
  local list_file="$SRC/codex/skills.list"
  mkdir -p "$USER_SKILLS_DIR"

  if [ ! -f "$list_file" ]; then
    echo "[warn] skills list not found at $list_file; skipping Codex native skills"
    return
  fi

  local skill_name src_skill dst_skill
  while IFS= read -r skill_name; do
    src_skill="$SRC/claude-skills/$skill_name"
    dst_skill="$USER_SKILLS_DIR/$skill_name"

    if [ ! -d "$src_skill" ]; then
      echo "[warn] skill '$skill_name' is listed for Codex, but $src_skill is missing"
      continue
    fi

    link_path "$src_skill" "$dst_skill"
  done < <(read_list_file "$list_file")
}

render_hooks_json() {
  if [ ! -f "$HOOKS_TEMPLATE" ]; then
    echo "[warn] hooks template not found at $HOOKS_TEMPLATE; skipping hooks rendering"
    return
  fi

  mkdir -p "$CODEX_HOME"
  SRC="$SRC" HOOKS_TEMPLATE="$HOOKS_TEMPLATE" HOOKS_OUTPUT="$HOOKS_OUTPUT" python3 <<'PY'
import os
from pathlib import Path

src_root = os.environ["SRC"]
template_path = Path(os.environ["HOOKS_TEMPLATE"])
output_path = Path(os.environ["HOOKS_OUTPUT"])

content = template_path.read_text()
content = content.replace("__CLAUDE_CONFIG_HOME__", src_root)
output_path.write_text(content)
print(f"[hooks] wrote {output_path}")
PY
}

ensure_skill_catalog_venv() {
  local venv_dir="$SRC/mcp/skill-catalog/.venv"
  local project_dir="$SRC/mcp/skill-catalog"
  local python_bin="$venv_dir/bin/python"

  if [ ! -f "$project_dir/pyproject.toml" ]; then
    echo "[skip] skill-catalog pyproject.toml is missing"
    return
  fi

  if [ ! -f "$python_bin" ]; then
    echo "[venv] creating skill-catalog environment..."
    if command -v uv >/dev/null 2>&1; then
      uv venv "$venv_dir" --python ">=3.11"
    elif command -v python3 >/dev/null 2>&1 \
      && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null; then
      python3 -m venv "$venv_dir"
    else
      echo "[error] python>=3.11 or uv is required for skill-catalog"
      return
    fi
  else
    echo "[venv] skill-catalog environment already exists"
  fi

  echo "[venv] syncing skill-catalog dependencies..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$python_bin" -e "$project_dir" >/dev/null
  else
    "$venv_dir/bin/pip" install -e "$project_dir" >/dev/null
  fi

  local ie_dir="$SRC/intent-enhancement"
  if [ -f "$ie_dir/pyproject.toml" ]; then
    echo "[venv] syncing intent-enhancement dependencies into skill-catalog environment..."
    if command -v uv >/dev/null 2>&1; then
      uv pip install --python "$python_bin" -e "$ie_dir" >/dev/null
    else
      "$venv_dir/bin/pip" install -e "$ie_dir" >/dev/null
    fi
  fi
}

ensure_block_catalog_venv() {
  local venv_dir="$SRC/mcp/block-catalog/.venv"
  local project_dir="$SRC/mcp/block-catalog"
  local python_bin="$venv_dir/bin/python"

  if [ ! -f "$project_dir/pyproject.toml" ]; then
    echo "[skip] block-catalog pyproject.toml is missing"
    return
  fi

  if [ ! -f "$python_bin" ]; then
    echo "[venv] creating block-catalog environment..."
    if command -v uv >/dev/null 2>&1; then
      uv venv "$venv_dir" --python ">=3.11"
    elif command -v python3 >/dev/null 2>&1 \
      && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null; then
      python3 -m venv "$venv_dir"
    else
      echo "[error] python>=3.11 or uv is required for block-catalog"
      return
    fi
  else
    echo "[venv] block-catalog environment already exists"
  fi

  echo "[venv] syncing block-catalog dependencies..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$python_bin" -e "$project_dir" >/dev/null
  else
    "$venv_dir/bin/pip" install -e "$project_dir" >/dev/null
  fi
}

write_codex_managed_config() {
  mkdir -p "$CODEX_HOME"
  touch "$CONFIG_PATH"

  local skill_catalog_python="$SRC/mcp/skill-catalog/.venv/bin/python"
  local block_catalog_python="$SRC/mcp/block-catalog/.venv/bin/python"
  local superpowers_source="$SRC/vendor/superpowers"
  local embedding_model="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
  local ollama_port="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
  local ollama_host_url="http://127.0.0.1:${ollama_port}"
  local enable_intent_enhancement="${ENABLE_INTENT_ENHANCEMENT:-true}"

  CONFIG_PATH="$CONFIG_PATH" \
  BEGIN_MARKER="$BEGIN_MARKER" \
  END_MARKER="$END_MARKER" \
  SRC="$SRC" \
  SKILL_CATALOG_PYTHON="$skill_catalog_python" \
  BLOCK_CATALOG_PYTHON="$block_catalog_python" \
  SUPERPOWERS_SOURCE="$superpowers_source" \
  EMBEDDING_MODEL="$embedding_model" \
  OLLAMA_HOST_URL="$ollama_host_url" \
  ENABLE_INTENT_ENHANCEMENT="$enable_intent_enhancement" \
  python3 <<'PY'
import os
import re
from pathlib import Path

config_path = Path(os.environ["CONFIG_PATH"])
begin_marker = os.environ["BEGIN_MARKER"]
end_marker = os.environ["END_MARKER"]
src = os.environ["SRC"]
skill_catalog_python = os.environ["SKILL_CATALOG_PYTHON"]
block_catalog_python = os.environ["BLOCK_CATALOG_PYTHON"]
superpowers_source = os.environ["SUPERPOWERS_SOURCE"]
embedding_model = os.environ["EMBEDDING_MODEL"]
ollama_host_url = os.environ["OLLAMA_HOST_URL"]
enable_intent_enhancement = os.environ["ENABLE_INTENT_ENHANCEMENT"]

raw = config_path.read_text() if config_path.exists() else ""

managed_pattern = re.compile(
    re.escape(begin_marker) + r".*?" + re.escape(end_marker) + r"\n?",
    re.S,
)
stripped = managed_pattern.sub("", raw).rstrip()

for needle in (
    '[mcp_servers."skill-catalog"]',
    '[mcp_servers."block-catalog"]',
):
    if needle in stripped:
        print(
            f"[warn] {config_path} already contains {needle} outside the managed block; "
            "skipping config update to avoid duplicate TOML tables."
        )
        raise SystemExit(0)

managed_sections = [begin_marker]

if '[features]' not in stripped:
    managed_sections.extend([
        '[features]',
        'multi_agent = true',
        '',
    ])
elif 'multi_agent' not in stripped:
    print('[warn] existing [features] table found outside managed block; not auto-setting multi_agent')

if '[marketplaces.superpowers-dev]' not in stripped:
    managed_sections.extend([
        '[marketplaces.superpowers-dev]',
        'source_type = "local"',
        f'source = "{superpowers_source}"',
        '',
    ])

if '[plugins."superpowers@superpowers-dev"]' not in stripped:
    managed_sections.extend([
        '[plugins."superpowers@superpowers-dev"]',
        'enabled = true',
        '',
    ])

managed_sections.extend([
f'''[mcp_servers."skill-catalog"]
command = "{skill_catalog_python}"
args = ["-m", "skill_catalog.server"]
env = {{ SKILL_LIBRARY_PATH = "{src}/skills", SKILL_CATALOG_EMBEDDING_MODEL = "{embedding_model}", SKILL_CATALOG_OLLAMA_HOST = "{ollama_host_url}", ENABLE_INTENT_ENHANCEMENT = "{enable_intent_enhancement}" }}
enabled = true

[mcp_servers."block-catalog"]
command = "{block_catalog_python}"
args = ["-m", "block_catalog.server"]
env = {{ BLOCK_LIBRARY_PATH = "{src}/blocks" }}
enabled = true
''',
end_marker,
])

managed_block = "\n".join(part for part in managed_sections if part is not None).strip()

final = stripped + ("\n\n" if stripped else "") + managed_block + "\n"
config_path.write_text(final)
print(f"[config] wrote managed MCP block to {config_path}")
PY
}

ensure_codex_installed
mkdir -p "$CODEX_HOME" "$USER_SKILLS_DIR"

link_path "$SRC/claude/CLAUDE.md" "$GLOBAL_AGENTS_PATH"
link_path "$SRC/memory.md" "$CODEX_MEMORY_PATH"
sync_codex_skills
render_hooks_json
ensure_skill_catalog_venv
ensure_block_catalog_venv
write_codex_managed_config

echo "[done] init_codex.sh completed"
