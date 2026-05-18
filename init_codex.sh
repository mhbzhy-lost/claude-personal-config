#!/usr/bin/env bash
# init_codex.sh
#
# 将 claude-config 中可直接复用到 Codex 的共享 agent runtime 资源接到
# Codex 约定位置。脚本本身通过 shell 执行，但生成的是可被 Codex CLI、
# Codex app、IDE extension 共同消费的配置层：
#   - `claude/CLAUDE.md`          -> `~/.codex/agents.md`
#   - `memory.md`                 -> `~/.codex/memory.md`
#   - `claude-skills/<name>`      -> `~/.agents/skills/<name>`（共享 skill 白名单）
#   - `vendor/superpowers/skills` -> `~/.agents/skills/<name>`（Codex local plugin
#                                      skills 暂不暴露时的 fallback）
#   - `codex/hooks.json`          -> 渲染到 `~/.codex/hooks.json`
#   - `mcp/*`                     -> 合并到 `~/.codex/config.toml`
#   - `mcp/skill-catalog/vendor/ollama` 与 `bge-m3` embedding 模型
#                                  -> skill-catalog MCP 启动所需的本地运行时
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
CODEX_AGENTS_PATH="$CODEX_HOME/agents.md"
LEGACY_GLOBAL_AGENTS_PATH="$HOME/AGENTS.md"
CODEX_MEMORY_PATH="$CODEX_HOME/memory.md"
HOOKS_TEMPLATE="$SRC/codex/hooks.json"
CODEX_HOOKS_DIR="$SRC/codex/hooks"
CODEX_SKILL_PREFLIGHT_HOOK_REL="codex/hooks/skill-resolve-preflight.sh"
CODEX_GIT_COMMIT_HOOK_REL="codex/hooks/git-commit-hint.sh"
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

cleanup_legacy_global_agents() {
  if [ -L "$LEGACY_GLOBAL_AGENTS_PATH" ]; then
    local cur
    cur="$(readlink "$LEGACY_GLOBAL_AGENTS_PATH")"
    if [ "$cur" = "$SRC/claude/CLAUDE.md" ] || [ "$cur" = "$SRC/codex/AGENTS.md" ]; then
      rm -f "$LEGACY_GLOBAL_AGENTS_PATH"
      echo "[cleanup] removed legacy $LEGACY_GLOBAL_AGENTS_PATH -> $cur"
    fi
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

sync_superpowers_skills_fallback() {
  local src_dir="$SRC/vendor/superpowers/skills"

  if [ ! -d "$src_dir" ]; then
    echo "[warn] superpowers skills dir not found at $src_dir; skipping fallback skills"
    return
  fi

  mkdir -p "$USER_SKILLS_DIR"

  local src_skill dst_skill skill_name
  for src_skill in "$src_dir"/*; do
    [ -d "$src_skill" ] || continue
    [ -f "$src_skill/SKILL.md" ] || continue

    skill_name="$(basename "$src_skill")"
    dst_skill="$USER_SKILLS_DIR/$skill_name"

    link_path "$src_skill" "$dst_skill"
  done
}

render_hooks_json() {
  if [ ! -f "$HOOKS_TEMPLATE" ]; then
    echo "[warn] hooks template not found at $HOOKS_TEMPLATE; skipping hooks rendering"
    return
  fi

  local required_hook
  for required_hook in \
    "$SRC/$CODEX_SKILL_PREFLIGHT_HOOK_REL" \
    "$SRC/$CODEX_GIT_COMMIT_HOOK_REL"; do
    if [ ! -f "$required_hook" ]; then
      echo "[warn] Codex hook script not found at $required_hook; skipping hooks rendering"
      return
    fi
  done

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

manifest_path_for_ollama_model() {
  local models_dir="$1"
  local model="$2"
  local name tag

  if [[ "$model" == *:* ]]; then
    name="${model%%:*}"
    tag="${model##*:}"
  else
    name="$model"
    tag="latest"
  fi

  echo "$models_dir/manifests/registry.ollama.ai/library/$name/$tag"
}

ensure_skill_catalog_ollama() {
  local ollama_version="${OLLAMA_VERSION:-v0.21.0}"
  local embedding_model="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
  local ollama_port="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
  local ollama_host_url="http://127.0.0.1:${ollama_port}"
  local ollama_dir="$SRC/mcp/skill-catalog/vendor/ollama"
  local ollama_bin="$ollama_dir/ollama"
  local ollama_models_dir="$SRC/mcp/skill-catalog/.ollama-models"
  local ollama_runtime_dir="$SRC/mcp/skill-catalog/.ollama-runtime"

  mkdir -p "$ollama_dir" "$ollama_models_dir" "$ollama_runtime_dir"

  if [ -x "$ollama_bin" ]; then
    echo "[ok] ollama binary already ready: $ollama_bin"
  else
    local os
    os="$(uname -s)"
    case "$os" in
      Darwin)
        local tmpfile="$ollama_dir/ollama-darwin.tgz"
        echo "[ollama] downloading $ollama_version for macOS..."
        if curl -fL -o "$tmpfile" "https://github.com/ollama/ollama/releases/download/$ollama_version/ollama-darwin.tgz"; then
          tar -xzf "$tmpfile" -C "$ollama_dir"
          rm -f "$tmpfile"
          echo "[ok] ollama binary downloaded to $ollama_dir"
        else
          rm -f "$tmpfile"
          echo "[warn] ollama binary download failed; skill-catalog MCP may fail until rerun"
          return
        fi
        ;;
      Linux)
        local arch ollama_arch tmpfile tarfile
        arch="$(uname -m)"
        case "$arch" in
          x86_64) ollama_arch="amd64" ;;
          aarch64|arm64) ollama_arch="arm64" ;;
          *)
            echo "[warn] unsupported Linux arch for local ollama: $arch"
            return
            ;;
        esac

        tmpfile="$ollama_dir/ollama-linux.tar.zst"
        tarfile="${tmpfile%.zst}"
        echo "[ollama] downloading $ollama_version for Linux $ollama_arch..."
        if ! curl -fL -o "$tmpfile" "https://github.com/ollama/ollama/releases/download/$ollama_version/ollama-linux-$ollama_arch.tar.zst"; then
          rm -f "$tmpfile"
          echo "[warn] ollama binary download failed; skill-catalog MCP may fail until rerun"
          return
        fi
        if ! command -v zstd >/dev/null 2>&1; then
          rm -f "$tmpfile"
          echo "[warn] zstd is required to unpack Linux ollama; install zstd and rerun"
          return
        fi
        zstd -d "$tmpfile" -o "$tarfile"
        tar -xf "$tarfile" -C "$ollama_dir"
        rm -f "$tmpfile" "$tarfile"
        echo "[ok] ollama binary downloaded to $ollama_dir"
        ;;
      *)
        echo "[warn] unsupported OS for local ollama: $os"
        return
        ;;
    esac
  fi

  if [ ! -x "$ollama_bin" ]; then
    echo "[warn] ollama binary is not executable at $ollama_bin"
    return
  fi

  local manifest
  manifest="$(manifest_path_for_ollama_model "$ollama_models_dir" "$embedding_model")"
  if [ -e "$manifest" ]; then
    echo "[ok] ollama model $embedding_model already ready"
    return
  fi

  local temp_daemon_pid=""
  local daemon_already_running=false

  if curl -sf --max-time 1 "$ollama_host_url/api/tags" >/dev/null 2>&1; then
    daemon_already_running=true
    echo "[ollama] daemon already running at $ollama_host_url; reusing it to pull $embedding_model"
  else
    echo "[ollama] starting temporary daemon to pull $embedding_model..."
    OLLAMA_HOST="127.0.0.1:$ollama_port" \
    OLLAMA_MODELS="$ollama_models_dir" \
    OLLAMA_KEEP_ALIVE="5m" \
    nohup "$ollama_bin" serve > "$ollama_runtime_dir/ollama-init.log" 2>&1 &
    temp_daemon_pid=$!

    local i
    for i in 1 2 3 4 5 6 7 8 9 10; do
      if curl -sf --max-time 1 "$ollama_host_url/api/tags" >/dev/null 2>&1; then
        echo "[ok] temporary ollama daemon ready (pid=$temp_daemon_pid)"
        break
      fi
      sleep 1
    done
  fi

  echo "[ollama] pulling model $embedding_model..."
  if OLLAMA_HOST="$ollama_host_url" OLLAMA_MODELS="$ollama_models_dir" "$ollama_bin" pull "$embedding_model"; then
    echo "[ok] ollama model $embedding_model ready"
  else
    echo "[warn] failed to pull ollama model $embedding_model; check network and rerun"
  fi

  if [ "$daemon_already_running" = "false" ] && [ -n "$temp_daemon_pid" ]; then
    kill -TERM "$temp_daemon_pid" 2>/dev/null || true
    for i in 1 2 3 4 5; do
      if ! kill -0 "$temp_daemon_pid" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    kill -9 "$temp_daemon_pid" 2>/dev/null || true
    echo "[ok] temporary ollama daemon stopped"
  fi
}

write_codex_managed_config() {
  mkdir -p "$CODEX_HOME"
  touch "$CONFIG_PATH"

  local skill_catalog_python="$SRC/mcp/skill-catalog/.venv/bin/python"
  local block_catalog_python="$SRC/mcp/block-catalog/.venv/bin/python"
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
embedding_model = os.environ["EMBEDDING_MODEL"]
ollama_host_url = os.environ["OLLAMA_HOST_URL"]
enable_intent_enhancement = os.environ["ENABLE_INTENT_ENHANCEMENT"]

raw = config_path.read_text() if config_path.exists() else ""

managed_pattern = re.compile(
    re.escape(begin_marker) + r".*?" + re.escape(end_marker) + r"\n?",
    re.S,
)
stripped = managed_pattern.sub("", raw).rstrip()


def remove_table(text, table_name):
    lines = text.splitlines()
    table_line = f"[{table_name}]"

    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == table_line)
    except StopIteration:
        return text

    end = len(lines)
    for i in range(start + 1, len(lines)):
        stripped_line = lines[i].strip()
        if stripped_line.startswith("[") and stripped_line.endswith("]"):
            end = i
            break

    del lines[start:end]
    while start < len(lines) and lines[start] == "":
        del lines[start]
    return "\n".join(lines)


stripped = remove_table(stripped, "marketplaces.superpowers-dev").rstrip()
stripped = remove_table(stripped, 'plugins."superpowers@superpowers-dev"').rstrip()

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

link_path "$SRC/claude/CLAUDE.md" "$CODEX_AGENTS_PATH"
cleanup_legacy_global_agents
link_path "$SRC/memory.md" "$CODEX_MEMORY_PATH"
sync_codex_skills
sync_superpowers_skills_fallback
render_hooks_json
ensure_skill_catalog_venv
ensure_block_catalog_venv
ensure_skill_catalog_ollama
write_codex_managed_config

echo "[done] init_codex.sh completed"
