#!/usr/bin/env bash
# SubagentStart hook: inject coding-expert shared rules into sub-agent context.
#
# Target sub-agents: coding-expert, coding-expert-light, coding-expert-heavy
# (via matcher in settings.json).
# Reads guidelines/knowledge-retrieval-process.md (or $CODING_EXPERT_RULES_PATH)
# and returns its body as additionalContext so sub-agents do not need to
# manually Read the file at startup.
#
# Also attempts to fetch the legal tag closure from skill-catalog CLI and
# appends it as a "## 合法 tag 闭集（resolve 必填）" section.
#
# stdout: JSON SubagentStart hook response.
# stderr: one-line log.
#
# 环境变量覆盖：
#   SKILL_CATALOG_CLI         覆盖 CLI 可执行路径（默认走 .venv 的 python -m）
#   CODING_EXPERT_RULES_PATH  覆盖规则文档路径
#   CODING_EXPERT_RULES_INJECT_LOG  日志路径

set -euo pipefail

LOG_FILE="${CODING_EXPERT_RULES_INJECT_LOG:-$HOME/.claude/logs/coding-expert-rules-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"
printf '[%s] hook fired pid=%s ppid=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$PPID" >> "$LOG_FILE"

# 定位项目根目录（相对于 hook 脚本位置）
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
RULES_PATH="${CODING_EXPERT_RULES_PATH:-$SRC_ROOT/guidelines/knowledge-retrieval-process.md}"

if [[ ! -f "$RULES_PATH" ]]; then
  echo "[coding-expert-rules-inject] ERROR: rules not found at $RULES_PATH" >&2
  MISSING_MSG="[coding-expert-rules missing at $RULES_PATH]" \
    python3 -c 'import json,os; print(json.dumps({"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":os.environ["MISSING_MSG"]}}))'
  exit 0
fi

# 读取规则内容
BODY="$(cat "$RULES_PATH" 2>/dev/null || true)"

FOOTER="---
你必须首先执行知识检索流程，然后再完成接下来的任务。"

# 尝试拉取 tag 闭集
SKILL_CATALOG_ROOT="$SRC_ROOT/mcp/skill-catalog"
DEFAULT_CLI_PATH="$SKILL_CATALOG_ROOT/.venv/bin/python"
CLI_OVERRIDE="${SKILL_CATALOG_CLI:-}"
TIMEOUT_SECS=5
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
    "ENABLE_INTENT_ENHANCEMENT": "false",
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
                "## 合法 tag 闭集（resolve 必填）",
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

# 组装最终注入内容
if [[ "$PARSE_OK_FLAG" == "1" ]]; then
  FULL_CONTENT="$BODY"$'\n\n'"$FORMATTED"$'\n\n'"$FOOTER"
  echo "[coding-expert-rules-inject] tags ok (exit=$CLI_EXIT), tag_section_len=${#FORMATTED}" >&2
else
  # 降级：正文 + FOOTER，不含 tag 闭集
  echo "[coding-expert-rules-inject] tags failed (exit=$CLI_EXIT), fallback to doc-only" >&2
  FULL_CONTENT="$BODY"$'\n'"$FOOTER"
fi

# 用 python3 做 JSON 转义，sed 无法正确处理换行等控制字符
FULL_CONTENT="$FULL_CONTENT" python3 -c 'import json,os,sys; sys.stdout.write(json.dumps({"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":os.environ["FULL_CONTENT"]}}))'
echo

# 获取字符数量
BODY_LENGTH="$(wc -c < "$RULES_PATH" 2>/dev/null || true)"
echo "[coding-expert-rules-inject] injected total ${#FULL_CONTENT} chars (rules file: $BODY_LENGTH bytes)" >&2
