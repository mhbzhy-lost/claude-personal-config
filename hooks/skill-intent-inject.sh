#!/usr/bin/env bash
# UserPromptSubmit hook: 触发 %skill 时，注入主-agent 版知识检索规范
# 以及"合法 tag 闭集"（由 skill-catalog CLI tags 子命令产出）。
#
# 设计：
# - 意图识别改由主 agent 承担（Opus 级判断），hook 不再预跑 resolve
# - hook 只拉合法 tag 闭集，供主 agent 调 resolve 时填 tool_input
# - tags CLI 失败/超时/解析异常 → 回退为注入原版文档 + 降级提示
# - 永远不阻断 UserPromptSubmit
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
  # $1 = context 字符串
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

# 3. 是否触发 %skill
if [[ "$PROMPT" != *%skill* ]]; then
  emit_empty
  exit 0
fi

# 4. 定位文档
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
MAIN_DOC="$SRC_ROOT/guidelines/knowledge-retrieval-process-main.md"
FALLBACK_DOC="$SRC_ROOT/guidelines/knowledge-retrieval-process.md"

read_file() {
  [[ -f "$1" ]] && cat "$1" 2>/dev/null || true
}

MAIN_CONTENT="$(read_file "$MAIN_DOC")"
FALLBACK_CONTENT="$(read_file "$FALLBACK_DOC")"

FOOTER="你必须首先执行知识检索流程，然后再完成接下来的任务。"

# 5. 调 tags CLI 拉合法 tag 闭集
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
        # 闭集至少有一个维度非空才算成功
        if tech or lang or cap:
            lines = [
                "主 agent 在调 `mcp__skill-catalog__resolve` 时，`tech_stack` / `language` / `capability` 字段**只能**取下列值：",
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
PARSE_OK="$PARSE_OK_FLAG"

# 6. 组装最终注入内容
if [[ "$PARSE_OK" == "1" ]]; then
  BODY="$MAIN_CONTENT"
  if [[ -z "$BODY" ]]; then
    BODY="（警告：未找到主 agent 版知识检索文档，请按下方合法 tag 闭集自行调用 mcp__skill-catalog__resolve。）"
  fi
  FULL_CONTENT="$BODY"$'\n\n'"## 合法 tag 闭集（resolve 必填）"$'\n\n'"$FORMATTED"$'\n\n'"$FOOTER"
  log "tags ok (exit=$CLI_EXIT, len=${#FORMATTED})"
else
  # Fallback：注入原版文档 + 降级提示
  BODY="$FALLBACK_CONTENT"
  if [[ -z "$BODY" ]]; then
    BODY="（警告：知识检索文档缺失，请手动调用 mcp__skill-catalog__resolve。）"
  fi
  WARN="> ⚠️ hook 拉取合法 tag 闭集失败（CLI exit=${CLI_EXIT}），已降级为原版流程：主 agent 直接调用 \`mcp__skill-catalog__resolve\`，可不带 tag，由 server 端 classifier 兜底。"
  FULL_CONTENT="$BODY"$'\n\n'"$WARN"$'\n\n'"$FOOTER"
  log "tags failed; fallback (exit=$CLI_EXIT, parse_ok=$PARSE_OK)"
fi

emit_context "$FULL_CONTENT"
