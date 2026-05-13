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
# claude-skills/ 暴露给 ~/.claude/skills，承载 Claude Code 原生 user-invocable
# Skill（如 /git-commit、/knowledge-retrieval）。两种暴露模式：
#   1. 整目录软链 ~/.claude/skills → claude-skills/（默认；编辑即生效）
#   2. 真目录 + 按 lists/skills.list 逐 skill rsync --delete（清单白名单
#      模式，能与用户其他 skill 共存）
# 策略：~/.claude/skills 不存在 → 走 link_item 软链化；已是指向本仓的软链
# → 保留不动；已是真目录 → 走 rsync 模式（不主动转回软链）；已是软链但
# 指向其他位置 → 警告人工处理。
#
# 这与 MCP skill-catalog 知识库检索系统（索引 claude-config/skills/，由
# server 端按 tag 命中后吐 markdown）是两套完全独立的方案：前者走 Claude
# Code 内置 skill loader，后者走 MCP tool。
# ---------------------------------------------------------------------------
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$HOME/.claude"

mkdir -p "$DST"

link_item() {
  local item="$1"
  local dst_name="${2:-$item}"
  local src_path="$SRC/$item"
  local dst_path="$DST/$dst_name"

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

# 读清单文件：跳过 # 行首注释、剥离 " #..." 行内注释、trim 首尾空白后逐行
# stdout 输出。文件不存在时直接返回（无输出），调用方需自行检查。
read_list_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    # 剥离行内注释：从首个 " #" 开始截掉（要求空格前缀，避免误删 plugin 名里的 #）
    line="${line%% #*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    printf '%s\n' "$line"
  done < "$file"
}

# 解析清单文件路径：优先 lists/<name>.local.list（用户私有，git 不追踪），
# 不存在则回退 lists/<name>.list（默认，随仓库提交）。两份都缺时输出空。
resolve_list_file() {
  local name="$1"
  if [ -f "$SRC/lists/${name}.local.list" ]; then
    printf '%s\n' "$SRC/lists/${name}.local.list"
  elif [ -f "$SRC/lists/${name}.list" ]; then
    printf '%s\n' "$SRC/lists/${name}.list"
  fi
}

# Items that should live as symlinks under ~/.claude/
link_item "CLAUDE.md"
link_item "guidelines"
link_item "memory.md"

# claude-skills 特殊处理（按 ~/.claude/skills 当前形态分流）：
#   - 不存在               → 软链化（link_item，编辑即生效）
#   - 已是指向 claude-skills/ 的软链 → 保留不动
#   - 是软链但指向其他位置 → 警告，人工核对
#   - 是真目录             → 按 lists/skills.list 逐 skill rsync --delete
#                            （白名单模式，与用户自管 skill 共存）
sync_claude_skills() {
  local src_path="$SRC/claude-skills"
  local dst_path="$DST/skills"

  if [ ! -d "$src_path" ]; then
    echo "[skip] source $src_path does not exist"
    return
  fi

  # 不存在 → 直接软链
  if [ ! -e "$dst_path" ] && [ ! -L "$dst_path" ]; then
    ln -s "$src_path" "$dst_path"
    echo "[linked] $dst_path -> $src_path"
    return
  fi

  # 已是软链 → 校验目标后保留
  if [ -L "$dst_path" ]; then
    local cur
    cur=$(readlink "$dst_path")
    if [ "$cur" = "$src_path" ]; then
      echo "[ok] $dst_path -> $src_path （保留软链，编辑 claude-skills/ 即生效）"
    else
      echo "[warn] $dst_path 是软链但指向 ${cur}（非本仓 claude-skills/），人工核对后再处理"
    fi
    return
  fi

  # 是真目录 → 走 rsync 白名单模式
  echo "[info] $dst_path 是真目录，进入 rsync 白名单模式"

  # 同步清单：默认 lists/skills.list；用户可在同目录创建 skills.local.list 覆盖。
  # 加载顺序：local 优先，缺省回退 default；为完全覆盖（不合并）。
  local list_file
  list_file=$(resolve_list_file "skills")
  if [ -z "$list_file" ]; then
    echo "[warn] lists/skills.list 与 lists/skills.local.list 均不存在，跳过 skills 同步"
    return
  fi
  echo "[skills] 使用清单: $list_file"

  local sync_list=()
  local line
  while IFS= read -r line; do
    sync_list+=("$line")
  done < <(read_list_file "$list_file")

  # 已废弃同步清单：曾经同步过、现已从 sync_list 剔除的 skill。
  # 一次性清理，仅当目标的 SKILL.md 与源完全一致（确认是本仓同步残留）才删，
  # 避免误删用户手动放置的同名 skill。
  local deprecated_list=(
    "skill-distill"
  )

  if ! command -v rsync >/dev/null 2>&1; then
    echo "[warn] rsync 不可用，跳过 skills 同步；请手动同步 $src_path 到 $dst_path"
    return
  fi

  local skill_name skill_src skill_dst
  for skill_name in "${sync_list[@]}"; do
    skill_src="$src_path/$skill_name"
    skill_dst="$dst_path/$skill_name"
    if [ ! -d "$skill_src" ]; then
      echo "[warn] sync_list 含 $skill_name，但 $skill_src 不存在；请检查清单"
      continue
    fi
    if rsync -a --delete "$skill_src/" "$skill_dst/" >/dev/null; then
      echo "[synced] $skill_dst <- $skill_src/"
    else
      echo "[warn] 同步 $skill_src → $skill_dst 失败"
    fi
  done

  # 清理已从 sync_list 剔除的 skill 残留
  for skill_name in "${deprecated_list[@]}"; do
    skill_dst="$dst_path/$skill_name"
    skill_src="$src_path/$skill_name"
    [ -e "$skill_dst" ] || continue
    if [ -f "$skill_dst/SKILL.md" ] && [ -f "$skill_src/SKILL.md" ] \
        && cmp -s "$skill_dst/SKILL.md" "$skill_src/SKILL.md"; then
      rm -rf "$skill_dst"
      echo "[cleanup] 已移除 ${skill_dst}（已从 sync_list 剔除）"
    else
      echo "[warn] ${skill_dst} 不像本仓同步残留（SKILL.md 缺失或与源不一致），未自动删除"
    fi
  done
}
sync_claude_skills

# 一次性清理：移除指向已删除目录的失效软链
#   agents/ 已随 335213f 删除（迁移至 Superpowers 工作流），但 ~/.claude/agents
#   软链可能仍存在并指向不存在的源
LEGACY_AGENTS_LINK="$DST/agents"
if [ -L "$LEGACY_AGENTS_LINK" ] && [ ! -e "$LEGACY_AGENTS_LINK" ]; then
  rm -f "$LEGACY_AGENTS_LINK"
  echo "[cleanup] 已移除失效软链 $LEGACY_AGENTS_LINK"
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

# SubagentStart 当前不需要任何 hook（迁移至 Superpowers 工作流后，原有的
#   coding-expert / coding-expert-light / coding-expert-heavy 三档 subagent
#   已随 335213f 删除）。此列表保留为空，便于未来追加。
#
# 已废弃 hook 历史（由文件下方一次性清理逻辑负责从 settings.json 移除）：
#   skill-marker        (SubagentStart)  → capability-taxonomy-inject.sh
#       旧 skill-distill 多 agent 编排架构的角色，v0.5 重构后下线
#   coding-expert*      (SubagentStart)  → coding-expert-rules-inject.sh
#       三档 subagent 已删
#   stack-detector / skill-matcher (SubagentStart) → 由 skill-intent-inject.sh 替代后又下线
#   skill-intent-inject (UserPromptSubmit) → %skill 关键字与 /knowledge-retrieval 重合后下线
#   skill-resolve-inject (UserPromptSubmit) → 被 PreToolUse + skill-resolve-preflight 替代
#   coding-expert-audit (SubagentStop) → 只采集日志无消费，下线
desired_sub_start_hooks = []

# PreToolUse hook：拦截 mcp__skill-catalog__resolve 调用，硬约束调用方必须
# 在 tool_input 里携带 tech_stack / capability 至少一个非空，避免 resolve
# 在无意图信号的情况下退化成全量检索。
desired_pretooluse_hooks = [
    {
        "matcher": "mcp__skill-catalog__resolve",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/skill-resolve-preflight.sh",
            }
        ],
    },
    {
        "matcher": "Bash",
        "hooks": [
            {
                "type": "command",
                "command": f"{src_root}/hooks/git-commit-hint.sh",
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

# 合并 hooks.PreToolUse：按 matcher upsert
pretool_use = hooks.setdefault("PreToolUse", [])
for desired in desired_pretooluse_hooks:
    matcher = desired["matcher"]
    found_idx = None
    for i, entry in enumerate(pretool_use):
        if isinstance(entry, dict) and entry.get("matcher") == matcher:
            found_idx = i
            break
    if found_idx is None:
        pretool_use.append(desired)
        changed = True
        print(f"[settings] 新增 hooks.PreToolUse[matcher={matcher!r}]")
    elif pretool_use[found_idx] != desired:
        pretool_use[found_idx] = desired
        changed = True
        print(f"[settings] 更新 hooks.PreToolUse[matcher={matcher!r}]")

# 一次性清理：移除已废弃的 SubagentStart hooks
#   skill-marker        → capability-taxonomy-inject.sh （旧 skill-distill 多 agent 编排架构遗留）
#   coding-expert*      → coding-expert-rules-inject.sh （三档 subagent 已随 335213f 删除）
# 仅当 (matcher, command 后缀) 双匹配才删除，避免误伤用户自定义 hook。
deprecated_sub_start_specs = [
    ("skill-marker", "/capability-taxonomy-inject.sh"),
    ("coding-expert", "/coding-expert-rules-inject.sh"),
    ("coding-expert-light", "/coding-expert-rules-inject.sh"),
    ("coding-expert-heavy", "/coding-expert-rules-inject.sh"),
]
existing_sub_start = hooks.get("SubagentStart")
if isinstance(existing_sub_start, list):
    pruned = [
        entry for entry in existing_sub_start
        if not (
            isinstance(entry, dict)
            and any(
                entry.get("matcher") == m
                and any(
                    isinstance(h, dict) and h.get("command", "").endswith(suffix)
                    for h in entry.get("hooks", []) if isinstance(h, dict)
                )
                for m, suffix in deprecated_sub_start_specs
            )
        )
    ]
    if len(pruned) != len(existing_sub_start):
        if pruned:
            hooks["SubagentStart"] = pruned
        else:
            hooks.pop("SubagentStart", None)
        changed = True
        print(
            "[settings] 已清理废弃的 SubagentStart hooks"
            "（skill-marker / coding-expert*）"
        )

# 一次性清理：移除已废弃的 SubagentStop hooks（coding-expert-audit.sh）
# 该 hook 只采集日志无消费，已下线。仅当条目同时满足"matcher 在我们曾管理的
# 列表"+"command 指向 coding-expert-audit.sh"才删除，避免误伤用户自定义 hook。
deprecated_audit_matchers = {"coding-expert", "coding-expert-light", "coding-expert-heavy"}
existing_sub_stop = hooks.get("SubagentStop")
if isinstance(existing_sub_stop, list):
    pruned = [
        entry for entry in existing_sub_stop
        if not (
            isinstance(entry, dict)
            and entry.get("matcher") in deprecated_audit_matchers
            and any(
                isinstance(h, dict) and h.get("command", "").endswith("/coding-expert-audit.sh")
                for h in entry.get("hooks", []) if isinstance(h, dict)
            )
        )
    ]
    if len(pruned) != len(existing_sub_stop):
        if pruned:
            hooks["SubagentStop"] = pruned
        else:
            hooks.pop("SubagentStop", None)
        changed = True
        print("[settings] 已清理废弃的 SubagentStop hooks（coding-expert-audit）")

# 一次性清理：移除已废弃的 UserPromptSubmit hooks
#   skill-intent-inject.sh  —— %skill 关键字开关，与 /knowledge-retrieval 重合后下线
#   skill-resolve-inject.sh —— 早期知识检索注入器，被 PreToolUse + skill-resolve-preflight
#                              替代后随 533a684 一并删除文件，但 settings.json 残留死引用
# 仅当条目的 command 指向上述脚本才删除，避免误伤用户自定义 hook。
deprecated_user_prompt_scripts = (
    "/skill-intent-inject.sh",
    "/skill-resolve-inject.sh",
)
existing_user_prompt = hooks.get("UserPromptSubmit")
if isinstance(existing_user_prompt, list):
    pruned = [
        entry for entry in existing_user_prompt
        if not (
            isinstance(entry, dict)
            and any(
                isinstance(h, dict)
                and h.get("command", "").endswith(deprecated_user_prompt_scripts)
                for h in entry.get("hooks", []) if isinstance(h, dict)
            )
        )
    ]
    if len(pruned) != len(existing_user_prompt):
        if pruned:
            hooks["UserPromptSubmit"] = pruned
        else:
            hooks.pop("UserPromptSubmit", None)
        changed = True
        print(
            "[settings] 已清理废弃的 UserPromptSubmit hooks"
            f"（{', '.join(s.lstrip('/') for s in deprecated_user_prompt_scripts)}）"
        )

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
# 同步 intent-enhancement 运行时依赖到 skill-catalog 的 venv
#   两个子项目各自维护独立的 pyproject.toml 声明依赖，由 uv 的 resolver 在
#   装入同一 venv 时自动去重。两者在同进程共用 —— pipeline.py 通过 sys.path
#   注入加载 intent-enhancement —— 因此装到 skill-catalog venv 即可。
#   （后续若依赖规模扩大再升级到 uv workspace 统一管理）
# ---------------------------------------------------------------------------
INTENT_ENHANCEMENT_DIR="$SRC/intent-enhancement"
if [ -f "$INTENT_ENHANCEMENT_DIR/pyproject.toml" ] && [ -f "$SKILL_CATALOG_VENV/bin/python" ]; then
  echo "[venv] 同步 intent-enhancement 依赖（pyproject.toml）..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$SKILL_CATALOG_VENV/bin/python" -e "$INTENT_ENHANCEMENT_DIR" >/dev/null
  else
    "$SKILL_CATALOG_VENV/bin/pip" install -e "$INTENT_ENHANCEMENT_DIR" >/dev/null
  fi
  echo "[venv] intent-enhancement 依赖就绪"
fi

# ---------------------------------------------------------------------------
# 初始化 block-catalog MCP server 的 Python 虚拟环境
# 与 skill-catalog 区分开：本 MCP 索引 blocks/ 目录下的业务模式预制件，
# 让 agent 能 list / get / search / copy 这些 block 作为 SDK 模板复用。
# 无 ollama / embedding 依赖；纯 tag + 关键词匹配（block 数量小 ~10 个）。
# ---------------------------------------------------------------------------
BLOCK_CATALOG_DIR="$SRC/mcp/block-catalog"
BLOCK_CATALOG_VENV="$BLOCK_CATALOG_DIR/.venv"

if [ -f "$BLOCK_CATALOG_DIR/pyproject.toml" ]; then
  if [ ! -f "$BLOCK_CATALOG_VENV/bin/python" ]; then
    echo "[venv] 创建 block-catalog 虚拟环境..."
    if command -v uv >/dev/null 2>&1; then
      uv venv "$BLOCK_CATALOG_VENV" --python ">=3.11"
    elif command -v python3 >/dev/null 2>&1 \
        && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null; then
      python3 -m venv "$BLOCK_CATALOG_VENV"
    else
      echo "[error] 需要 python>=3.11 或 uv 来初始化 block-catalog 环境，跳过"
    fi
  else
    echo "[venv] block-catalog 环境已存在，跳过创建"
  fi

  if [ -f "$BLOCK_CATALOG_VENV/bin/python" ]; then
    echo "[venv] 同步 block-catalog 依赖（pyproject.toml）..."
    if command -v uv >/dev/null 2>&1; then
      uv pip install --python "$BLOCK_CATALOG_VENV/bin/python" -e "$BLOCK_CATALOG_DIR" >/dev/null
    else
      "$BLOCK_CATALOG_VENV/bin/pip" install -e "$BLOCK_CATALOG_DIR" >/dev/null
    fi
    echo "[venv] block-catalog 环境就绪: $BLOCK_CATALOG_VENV"
  fi
fi

# ---------------------------------------------------------------------------
# 初始化本地 LLM 后端：ollama + bge-m3 embedding（项目内完全自包含部署）
#
#   设计哲学：像 .venv/ 一样，ollama binary + 模型数据 + 运行时状态都落在
#   mcp/skill-catalog/ 目录内，不干涉用户系统环境，不占 brew services，
#   不写 ~/.ollama/。默认端口 11435 避免与用户可能自行安装的系统 ollama
#   (11434) 冲突。
#
#   仅需 bge-m3 embedding（~568MB），用于 IntentFallback（规则+embedding 双层）
#   的语义检索。历史上的 qwen2.5:7b classifier 已由 IntentFallback 全面替代
#   （见 intent-enhancement/tests/intent_fallback_regression.md），不再拉取。
#
#   目录布局（均在 .gitignore）：
#     vendor/ollama/      binary + MLX/GGML 后端 (~170MB)
#     .ollama-models/     bge-m3 权重 (~568MB)
#     .ollama-runtime/    ollama.pid / ollama.log
#
#   幂等策略：
#     - binary 已存在 → 跳过下载
#     - daemon 已监听 → 跳过启动
#     - 模型已 pull → 跳过
#     - 任一步失败告警但不退出，后续 MCP 注册仍能完成，LLM 能力 lazy 启用
# ---------------------------------------------------------------------------
OLLAMA_VERSION="${OLLAMA_VERSION:-v0.21.0}"
EMBEDDING_MODEL="${SKILL_CATALOG_EMBEDDING_MODEL:-bge-m3}"
OLLAMA_PORT="${SKILL_CATALOG_OLLAMA_PORT:-11435}"
OLLAMA_HOST_URL="http://127.0.0.1:$OLLAMA_PORT"

# 意图增强开关：默认启用，允许外部 `ENABLE_INTENT_ENHANCEMENT=false bash init_claude.sh` 覆盖
ENABLE_INTENT_ENHANCEMENT="${ENABLE_INTENT_ENHANCEMENT:-true}"

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
#    仅需一类模型：
#      EMBEDDING_MODEL   — IntentFallback 语义检索 embedding（bge-m3，~568MB）
#    未就绪时，临时拉起 daemon → pull → 关闭。
manifest_path_for() {
  local model="$1"
  local name tag
  if [[ "$model" == *:* ]]; then
    name="${model%%:*}"
    tag="${model##*:}"
  else
    name="$model"
    tag="latest"
  fi
  echo "$OLLAMA_MODELS_DIR/manifests/registry.ollama.ai/library/$name/$tag"
}

MODELS_TO_PULL=()
for M in "$EMBEDDING_MODEL"; do
  MANIFEST=$(manifest_path_for "$M")
  if [ -e "$MANIFEST" ]; then
    echo "[ok] ollama 模型 ${M} 已就绪（manifest: ${MANIFEST}）"
  else
    MODELS_TO_PULL+=("$M")
  fi
done

if [ ${#MODELS_TO_PULL[@]} -eq 0 ]; then
  :  # 全部就绪，跳过 daemon 启动
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

  for M in "${MODELS_TO_PULL[@]}"; do
    echo "[ollama] 拉取模型 ${M}（视网络耗时）..."
    if OLLAMA_HOST="$OLLAMA_HOST_URL" "$OLLAMA_BIN" pull "$M"; then
      echo "[ok] 模型 $M 拉取完成"
    else
      echo "[warn] 模型 $M 拉取失败，请检查网络后重跑 init_claude.sh（不阻断后续流程）"
    fi
  done

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

  # --- skill-catalog MCP ---
  # 检查是否已注册且配置一致（所有 env 变量必须全部匹配）
  # 历史曾注入 SKILL_CATALOG_OLLAMA_MODEL（qwen classifier），现已下线；
  # 旧 state 若仍带该 env 视为配置不一致，触发一次性 re-register。
  CURRENT=$(claude mcp get skill-catalog 2>&1 || true)
  if echo "$CURRENT" | grep -q "Connected" \
      && echo "$CURRENT" | grep -q "$MCP_CMD" \
      && echo "$CURRENT" | grep -q "SKILL_LIBRARY_PATH=$SRC/skills" \
      && echo "$CURRENT" | grep -q "SKILL_CATALOG_EMBEDDING_MODEL=$EMBEDDING_MODEL" \
      && echo "$CURRENT" | grep -q "SKILL_CATALOG_OLLAMA_HOST=$OLLAMA_HOST_URL" \
      && echo "$CURRENT" | grep -q "ENABLE_INTENT_ENHANCEMENT=$ENABLE_INTENT_ENHANCEMENT" \
      && ! echo "$CURRENT" | grep -q "SKILL_CATALOG_OLLAMA_MODEL="; then
    echo "[mcp] skill-catalog 已注册且配置一致"
  else
    # 先移除旧注册（如有），再重新注册
    claude mcp remove skill-catalog -s user 2>/dev/null || true
    claude mcp add -s user \
      -e "SKILL_LIBRARY_PATH=$SRC/skills" \
      -e "SKILL_CATALOG_EMBEDDING_MODEL=$EMBEDDING_MODEL" \
      -e "SKILL_CATALOG_OLLAMA_HOST=$OLLAMA_HOST_URL" \
      -e "ENABLE_INTENT_ENHANCEMENT=$ENABLE_INTENT_ENHANCEMENT" \
      -- skill-catalog "$MCP_CMD" -m skill_catalog.server
    echo "[mcp] skill-catalog 已注册到 user scope（embedding=${EMBEDDING_MODEL}, intent_enhancement=${ENABLE_INTENT_ENHANCEMENT}）"
  fi

  # --- block-catalog MCP：业务模式 block 索引 + copy ---
  if [ -f "$BLOCK_CATALOG_VENV/bin/python" ]; then
    BC_CMD="$BLOCK_CATALOG_VENV/bin/python"
    BC_CURRENT=$(claude mcp get block-catalog 2>&1 || true)
    if echo "$BC_CURRENT" | grep -q "Connected" \
        && echo "$BC_CURRENT" | grep -q "$BC_CMD" \
        && echo "$BC_CURRENT" | grep -q "BLOCK_LIBRARY_PATH=$SRC/blocks"; then
      echo "[mcp] block-catalog 已注册且配置一致"
    else
      claude mcp remove block-catalog -s user 2>/dev/null || true
      claude mcp add -s user \
        -e "BLOCK_LIBRARY_PATH=$SRC/blocks" \
        -- block-catalog "$BC_CMD" -m block_catalog.server
      echo "[mcp] block-catalog 已注册到 user scope（library=$SRC/blocks）"
    fi
  else
    echo "[mcp] block-catalog venv 未就绪，跳过 MCP 注册"
  fi

  # --- playwright-mcp MCP：浏览器自动化 ---
  if claude mcp get playwright-mcp 2>&1 | grep -q "Connected"; then
    echo "[mcp] playwright-mcp 已注册"
  else
    claude mcp remove playwright-mcp -s user 2>/dev/null || true
    if claude mcp add -s user -- playwright-mcp npx -y @playwright/mcp; then
      echo "[mcp] playwright-mcp 已注册到 user scope"
    else
      echo "[warn] playwright-mcp 注册失败，请确保 npx 可用"
    fi
  fi
else
  echo "[warn] claude CLI 不可用，跳过 MCP server / 插件注册。"
fi

# ---------------------------------------------------------------------------
# 安装插件：幂等检查 installed_plugins.json
# ---------------------------------------------------------------------------
if command -v claude >/dev/null 2>&1; then
  PLUGINS_JSON="$DST/plugins/installed_plugins.json"

  # 确保 marketplace 已注册
  if [ ! -f "$DST/plugins/known_marketplaces.json" ] \
      || ! grep -q '"claude-plugins-official"' "$DST/plugins/known_marketplaces.json" 2>/dev/null; then
    echo "[plugins] 注册 marketplace claude-plugins-official ..."
    claude plugins marketplace add claude-plugins-official github anthropics/claude-plugins-official 2>/dev/null || true
  fi

  # 插件清单：默认 lists/plugins.list；存在 lists/plugins.local.list 则优先（覆盖）。
  PLUGINS_LIST_FILE=$(resolve_list_file "plugins")
  if [ -z "$PLUGINS_LIST_FILE" ]; then
    echo "[warn] lists/plugins.list 与 lists/plugins.local.list 均不存在，跳过插件安装"
  else
    echo "[plugins] 使用清单: $PLUGINS_LIST_FILE"

    # 解析 installed_plugins.json 中某 plugin@marketplace 的 gitCommitSha
    get_installed_sha() {
      local key="$1"
      [ -f "$PLUGINS_JSON" ] || { printf ''; return; }
      [ -n "$PY" ] || { printf ''; return; }
      $PY -c "
import json, sys
try:
    d = json.load(open('$PLUGINS_JSON'))
except Exception:
    sys.exit(0)
for entry in d.get('plugins', {}).get('$key', []):
    sha = entry.get('gitCommitSha', '')
    if sha:
        print(sha)
        sys.exit(0)
" 2>/dev/null
    }

    # 从 marketplace.json 推 plugin 的 upstream URL
    # 支持 source.source = "url" / "github"；其他类型返回空
    get_upstream_url() {
      local marketplace="$1" plugin="$2"
      local mjson="$DST/plugins/marketplaces/$marketplace/.claude-plugin/marketplace.json"
      [ -f "$mjson" ] || { printf ''; return; }
      [ -n "$PY" ] || { printf ''; return; }
      $PY -c "
import json, sys
try:
    d = json.load(open('$mjson'))
except Exception:
    sys.exit(0)
for p in d.get('plugins', []):
    if p.get('name') == '$plugin':
        s = p.get('source', {})
        t = s.get('source')
        if t == 'url':
            print(s.get('url', ''))
        elif t == 'github':
            repo = s.get('repo', '')
            if repo:
                print(f'https://github.com/{repo}.git')
        sys.exit(0)
" 2>/dev/null
    }

    # Pin 模式：克隆 upstream + checkout 到指定 commit SHA。绕过
    # `claude plugins install`。手写 installed_plugins.json 条目。
    # 失败时返回非 0；caller 打 warn 但不阻断后续 plugin
    install_pinned_plugin() {
      local plugin_name="$1" marketplace="$2" sha="$3"
      local key="$plugin_name@$marketplace"

      # 验证 SHA 形态：7-40 位 hex（git 内部要求）
      if [[ ! "$sha" =~ ^[0-9a-f]{7,40}$ ]]; then
        echo "[warn] $key 第三段 '$sha' 不是有效 commit SHA（要求 7-40 位 hex），跳过 pin" >&2
        return 1
      fi

      # 幂等快速路径：仅当用户给的是完整 40 位 SHA 才比较已装与期望
      # （短 SHA 模糊匹配复杂，直接走 clone 路径让 git 自己解析）
      if [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
        local installed_sha
        installed_sha=$(get_installed_sha "$key")
        if [ "$installed_sha" = "$sha" ]; then
          echo "[plugins] $key 已 pin 在 $sha"
          return 0
        fi
      fi

      local upstream
      upstream=$(get_upstream_url "$marketplace" "$plugin_name")
      if [ -z "$upstream" ]; then
        echo "[warn] $key 推不出 upstream URL（marketplace.json 缺失或 source 类型未支持）" >&2
        return 1
      fi

      echo "[plugins] $key pinning 到 $sha — clone $upstream..."
      local tmp_dir
      tmp_dir=$(mktemp -d)
      if ! git clone --quiet "$upstream" "$tmp_dir" 2>&1 | sed 's/^/  /'; then
        echo "[warn] clone $upstream 失败" >&2
        rm -rf "$tmp_dir"
        return 1
      fi
      if ! git -C "$tmp_dir" checkout --quiet "$sha" 2>&1; then
        echo "[warn] checkout $sha 失败（commit 不在 upstream 历史中？）" >&2
        rm -rf "$tmp_dir"
        return 1
      fi

      # 拿到 git 解析后的完整 SHA（短 SHA 输入时也能拿到 40 位）
      local actual_sha
      actual_sha=$(git -C "$tmp_dir" rev-parse HEAD 2>/dev/null || echo "$sha")

      # 短 SHA 输入：clone 完才比对完整 SHA，已对齐则丢弃 tmp_dir 跳过
      if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
        local installed_sha
        installed_sha=$(get_installed_sha "$key")
        if [ "$installed_sha" = "$actual_sha" ]; then
          echo "[plugins] $key 已 pin 在 $actual_sha (short ref $sha)"
          rm -rf "$tmp_dir"
          return 0
        fi
      fi

      # cache 子目录命名：仍按 claude 约定用 plugin.json 的 version 字段
      # （只是目录命名，与 pin 语义无关）
      local version="unknown"
      if [ -f "$tmp_dir/.claude-plugin/plugin.json" ]; then
        version=$($PY -c "
import json
try:
    print(json.load(open('$tmp_dir/.claude-plugin/plugin.json')).get('version', 'unknown'))
except Exception:
    print('unknown')
" 2>/dev/null || echo "unknown")
      fi

      local target_cache="$DST/plugins/cache/$marketplace/$plugin_name/$version"
      rm -rf "$target_cache"
      mkdir -p "$(dirname "$target_cache")"
      mv "$tmp_dir" "$target_cache"
      rm -rf "$target_cache/.git"

      $PY -c "
import json, datetime
from pathlib import Path
p = Path('$PLUGINS_JSON')
if p.exists():
    try:
        d = json.loads(p.read_text())
    except Exception:
        d = {'version': 2, 'plugins': {}}
else:
    d = {'version': 2, 'plugins': {}}
d.setdefault('plugins', {})
key = '$key'
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')
existing = d['plugins'].get(key, [])
installed_at = now
for e in existing:
    if e.get('scope') == 'user' and e.get('installedAt'):
        installed_at = e['installedAt']
        break
d['plugins'][key] = [{
    'scope': 'user',
    'installPath': '$target_cache',
    'version': '$version',
    'installedAt': installed_at,
    'lastUpdated': now,
    'gitCommitSha': '$actual_sha',
}]
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
"
      echo "[plugins] $key pinned 完成（version=$version, sha=${actual_sha:0:12}）"
      return 0
    }

    while IFS= read -r line; do
      case "$line" in
        *:*) ;;
        *)
          echo "[warn] 跳过无效行（缺少 marketplace 部分）: $line"
          continue
          ;;
      esac
      # 解析 name:marketplace[:sha]
      plugin_name="${line%%:*}"
      rest="${line#*:}"
      if [[ "$rest" == *:* ]]; then
        marketplace="${rest%%:*}"
        sha="${rest#*:}"
      else
        marketplace="$rest"
        sha=""
      fi

      key="$plugin_name@$marketplace"

      # Pinned plugin：走 git clone + checkout SHA 路径
      if [ -n "$sha" ]; then
        install_pinned_plugin "$plugin_name" "$marketplace" "$sha" || \
          echo "[warn] $key pin 失败，请检查 upstream 网络与 SHA 正确性"
        continue
      fi

      # 未 pin：原 claude plugins install 路径
      if [ -f "$PLUGINS_JSON" ] && grep -q "\"$key\"" "$PLUGINS_JSON" 2>/dev/null; then
        echo "[plugins] $key 已安装（未 pin，跟随 marketplace HEAD）"
        continue
      fi

      echo "[plugins] 安装 ${key}（未 pin）..."
      if claude plugins install "$key" 2>&1; then
        echo "[plugins] $key 安装完成"
      else
        echo "[warn] 插件 $key 安装失败，请手动安装"
      fi
    done < <(read_list_file "$PLUGINS_LIST_FILE")
  fi
fi

# 提示：已不再使用的 qwen2.5:7b 模型可手动清理（留给用户自决）
if [ -x "$OLLAMA_BIN" ] && [ -e "$(manifest_path_for "qwen2.5:7b")" ]; then
  echo "[hint] qwen2.5:7b 模型已不再使用，可用 'OLLAMA_HOST=$OLLAMA_HOST_URL OLLAMA_MODELS=$OLLAMA_MODELS_DIR $OLLAMA_BIN rm qwen2.5:7b' 手动清理（~4.7GB）"
fi

# ---------------------------------------------------------------------------
# 注册 claude-launchers.zsh 到 ~/.zshrc
# 提供 claude / claude-qwen / claude-deepseek / claude-log 等 shell 函数
# ---------------------------------------------------------------------------
LAUNCHERS_LINE="[[ -f $SRC/scripts/claude-launchers.zsh ]] && source $SRC/scripts/claude-launchers.zsh"
ZSHRC="$HOME/.zshrc"

if [ ! -f "$ZSHRC" ]; then
  echo "[skip] ~/.zshrc not found, please source $SRC/scripts/claude-launchers.zsh manually"
elif grep -Fq "claude-launchers.zsh" "$ZSHRC"; then
  echo "[ok] claude-launchers already registered in ~/.zshrc"
else
  printf '\n# claude-launchers (auto-registered by init_claude.sh)\n%s\n' "$LAUNCHERS_LINE" >> "$ZSHRC"
  echo "[linked] claude-launchers registered in ~/.zshrc"
fi

# ---------------------------------------------------------------------------
# 一次性清理：移除 b9219f0 refactor 之前由 init_claude.sh 直接注入到 ~/.zshrc
# 的两个函数定义（_claude_should_autoresume + claude_ccr_wrapper_v5）。
# 它们已抽到 scripts/claude-launchers.zsh 并由 source 加载，旧定义会被同名
# 函数覆盖（功能正常），但永久污染 zshrc。anchor 用 marker 字符串识别。
# ---------------------------------------------------------------------------
if [ -f "$ZSHRC" ] && grep -Fq "claude_ccr_wrapper_v5" "$ZSHRC"; then
  echo "[cleanup] 检测到历史注入的 ccr wrapper v5 块，自动清理..."
  TMP_ZSHRC=$(mktemp)
  awk '
    BEGIN { skip = 0; close_count = 0 }
    skip == 0 && /^# claude 自动续聊/ { skip = 1; close_count = 0; next }
    skip == 1 {
      if ($0 ~ /^\}[[:space:]]*$/) {
        close_count += 1
        if (close_count == 2) { skip = 0 }
        next
      }
      next
    }
    { print }
  ' "$ZSHRC" > "$TMP_ZSHRC"
  mv "$TMP_ZSHRC" "$ZSHRC"
  echo "[cleanup] 已从 ~/.zshrc 清理 _claude_should_autoresume + claude_ccr_wrapper_v5"
fi

# ---------------------------------------------------------------------------
# 提示 settings/.env 状态（含 deepseek/qwen 凭据，不入 git）
# ---------------------------------------------------------------------------
ENV_FILE="$SRC/settings/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[hint] $ENV_FILE 不存在；请从 settings/.env.example 复制并填入 token："
  echo "       cp $SRC/settings/.env.example $ENV_FILE && \$EDITOR $ENV_FILE"
fi

# ---------------------------------------------------------------------------
# Docker 预检：可执行 sandbox skill (executable_sandbox) 用 docker 隔离
# 工具运行环境，不污染用户主机。检测缺失/未跑时给出平台安装指引；不阻断
# init —— 知识类 skill 不依赖 docker，executable_sandbox 是可选特性。
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "[docker] ⚠ docker CLI 未安装。executable_sandbox 类 skill 需要 docker（知识类 skill 不需要）。"
  case "$(uname -s)" in
    Darwin)
      echo "  macOS 安装方案（任选其一）："
      echo "    A. Docker Desktop (官方 GUI):  https://www.docker.com/products/docker-desktop/"
      echo "    B. colima (轻量 CLI-only):     brew install colima docker && colima start"
      ;;
    Linux)
      echo "  Linux 安装方案："
      echo "    Debian/Ubuntu: curl -fsSL https://get.docker.com | sudo bash && sudo usermod -aG docker \$USER"
      echo "    Fedora/RHEL:   sudo dnf install -y docker && sudo systemctl enable --now docker"
      echo "    （安装后需重新登录使 docker 组生效）"
      ;;
    *)
      echo "  其他平台请参考 https://docs.docker.com/engine/install/"
      ;;
  esac
elif ! docker info >/dev/null 2>&1; then
  echo "[docker] ⚠ docker CLI 已装但 daemon 未跑。executable_sandbox 类 skill 需要 daemon 在线。"
  case "$(uname -s)" in
    Darwin) echo "  macOS: open -a Docker（Docker Desktop）；或 colima start（若用 colima）" ;;
    Linux)  echo "  Linux: sudo systemctl start docker" ;;
    *)      echo "  请按平台启动 docker daemon" ;;
  esac
else
  DOCKER_VERSION=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',' || echo "?")
  echo "[docker] ✓ docker ${DOCKER_VERSION} daemon 在线（executable_sandbox skill 可用）"
fi
