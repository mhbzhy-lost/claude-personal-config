#!/usr/bin/env bash
# UserPromptSubmit hook: %skill 关键字强制主 agent 执行知识检索流程。
#
# 背景：知识检索流程已常驻 CLAUDE.md，主 agent 始终可见。
# 本 hook 仅处理 %skill 关键字——注入强制信号 + tag 闭集，
# 要求 agent 立即调 resolve → get_skill，不得跳过。
#
# 环境变量覆盖：
#   SKILL_CATALOG_CLI         覆盖 CLI 可执行路径（默认走 .venv 的 python -m）
#   SKILL_INTENT_INJECT_LOG   日志路径
#   SKILL_INTENT_TIMEOUT      CLI 超时秒数（默认 5）

set -euo pipefail

LOG_FILE="${SKILL_INTENT_INJECT_LOG:-$HOME/.claude/logs/skill-intent-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"

emit_empty() {
  python3 -c 'import json,sys; sys.stdout.write(json.dumps({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit"}}))'
  echo
}

emit_context() {
  CTX="$1" python3 -c 'import json,os,sys; sys.stdout.write(json.dumps({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":os.environ["CTX"]}}))'
  echo
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# 1. 读取输入
INPUT="$(cat 2>/dev/null || true)"
if [[ -z "$INPUT" ]]; then
  log "empty stdin, skip"
  emit_empty
  exit 0
fi

# 2. 稳健解析 stdin JSON（取 prompt / cwd）
PARSED="$(INPUT="$INPUT" python3 - <<'PY' 2>/dev/null || true
import json, os, sys
raw = os.environ.get("INPUT", "")
try:
    data = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)
prompt = data.get("prompt", "") or ""
cwd = data.get("cwd", "") or ""
sys.stdout.write(prompt + "\x1f" + cwd)
PY
)"

PROMPT="${PARSED%%$'\x1f'*}"
CWD="${PARSED#*$'\x1f'}"
if [[ "$CWD" == "$PARSED" ]]; then
  CWD=""
fi

# 3. 未带 %skill —— 不做任何注入（知识检索流程已在 CLAUDE.md 中常驻）
if [[ "$PROMPT" != *%skill* ]]; then
  emit_empty
  exit 0
fi

log "detected %skill in prompt"

# 4. 定位项目根
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"

# 5. 拉取合法 tag 闭集
SKILL_CATALOG_ROOT="$SRC_ROOT/mcp/skill-catalog"
DEFAULT_CLI_PATH="$SKILL_CATALOG_ROOT/.venv/bin/python"
CLI_OVERRIDE="${SKILL_CATALOG_CLI:-}"
TIMEOUT_SECS="${SKILL_INTENT_TIMEOUT:-5}"
SKILLS_LIB="$SRC_ROOT/skills"

RESULT="$(CLI_OVERRIDE="$CLI_OVERRIDE" DEFAULT_CLI_PATH="$DEFAULT_CLI_PATH" \
  SKILLS_LIB="$SKILLS_LIB" TIMEOUT_SECS="$TIMEOUT_SECS" \
  python3 - <<'PY' 2>/dev/null || true
import json, os, subprocess, sys

override = os.environ.get("CLI_OVERRIDE", "")
default_py = os.environ.get("DEFAULT_CLI_PATH", "")
skills_lib = os.environ.get("SKILLS_LIB", "")
try:
    timeout = float(os.environ.get("TIMEOUT_SECS", "5"))
except Exception:
    timeout = 5.0

env = os.environ.copy()
env.update({
    "SKILL_LIBRARY_PATH": skills_lib,
    "SKILL_CATALOG_EMBEDDING_MODEL": "bge-m3",
    "SKILL_CATALOG_OLLAMA_HOST": "http://127.0.0.1:11435",
})

if override:
    cmd = [override, "tags"]
else:
    cmd = [default_py, "-m", "skill_catalog.cli", "tags"]

exit_code = 0
raw = ""
try:
    cp = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    exit_code = cp.returncode
    raw = cp.stdout or ""
except subprocess.TimeoutExpired:
    exit_code = 124
except FileNotFoundError:
    exit_code = 127
except Exception:
    exit_code = 1

ok = False
formatted = ""
if exit_code == 0 and raw.strip():
    try:
        data = json.loads(raw)
        tech = data.get("tech_stack") or []
        lang = data.get("language") or []
        cap = data.get("capability") or []
        if tech or lang or cap:
            lines = [
                "调 `mcp__skill-catalog__resolve` 时，`tech_stack` / `language` / `capability` 字段**只能**取下列值：",
                "",
                f"**tech_stack**: {json.dumps(sorted(tech), ensure_ascii=False)}",
                "",
                f"**language**: {json.dumps(sorted(lang), ensure_ascii=False)}",
                "",
                f"**capability**: {json.dumps(sorted(cap), ensure_ascii=False)}",
            ]
            formatted = "\n".join(lines)
            ok = True
    except Exception:
        ok = False

sys.stdout.write(f"{'1' if ok else '0'}\x1e{exit_code}\x1e{formatted}")
PY
)"

PARSE_OK_FLAG="${RESULT%%$'\x1e'*}"
REST="${RESULT#*$'\x1e'}"
CLI_EXIT="${REST%%$'\x1e'*}"
FORMATTED="${REST#*$'\x1e'}"

if [[ -z "$PARSE_OK_FLAG" ]]; then
  PARSE_OK_FLAG=0
fi
if [[ -z "$CLI_EXIT" ]]; then
  CLI_EXIT=1
fi

# 6. 组装强制检索上下文
FORCE_HEADER="用户通过 \`%skill\` 关键字**强制要求**你立即执行知识检索流程。你必须**先**调 \`/knowledge-retrieval\` 获取完整检索规范，严格按照规范描述执行检索，**再**处理用户原任务。禁止跳过。"

if [[ "$PARSE_OK_FLAG" == "1" ]]; then
  FULL_CONTENT="$FORCE_HEADER"$'\n\n## 合法 tag 闭集（resolve 必填）\n\n'"$FORMATTED"
  log "tags ok (exit=$CLI_EXIT, len=${#FORMATTED})"
else
  FULL_CONTENT="$FORCE_HEADER"$'\n\n> ⚠️ 拉取合法 tag 闭集失败（CLI exit='"$CLI_EXIT"'），请根据任务上下文自行推断标签后调 resolve，server 端 classifier 会做 allowlist 过滤。'
  log "tags failed; bare force injected (exit=$CLI_EXIT)"
fi

emit_context "$FULL_CONTENT"
