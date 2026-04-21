#!/usr/bin/env bash
# UserPromptSubmit hook: 在用户每次提交 prompt 前，调用 skill-catalog resolve
# 自动完成 stack detect + skill match，把结果作为 additionalContext 注入主 agent
# 上下文，替代原 stack-detector / skill-matcher SubagentStart 链路。
#
# 失败策略：**永远不阻断用户 prompt**。任一步异常都输出空 additionalContext
# 并以 exit 0 退出。
#
# stdin:  Claude Code UserPromptSubmit hook JSON
#         { "hook_event_name": "UserPromptSubmit",
#           "prompt": "...",
#           "session_id": "...",
#           "cwd": "..." }
# stdout: { "hookEventName": "UserPromptSubmit", "additionalContext": "..." }
# stderr: 仅作为异常 fallback 日志（主日志走 $LOG_FILE）

set -euo pipefail

LOG_FILE="${SKILL_RESOLVE_INJECT_LOG:-$HOME/.claude/logs/skill-resolve-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"

emit_empty() {
  # 输出一个不携带 additionalContext 的合法 hook 响应
  printf '{"hookEventName":"UserPromptSubmit"}\n'
}

# 读 stdin（hook JSON）
INPUT=$(cat || true)

if [ -z "$INPUT" ]; then
  printf '[%s] empty stdin, skip\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

# 探测 python 解释器
if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v uv >/dev/null 2>&1; then
  PY="uv run python"
else
  printf '[%s] no python, skip\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

# 从 hook JSON 中提取 prompt / cwd（分两次调用 python，避免 shell 分隔符问题）
EXTRACT_PROMPT='
import json, sys
try:
    data = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)
sys.stdout.write(data.get("prompt") or "")
'
EXTRACT_CWD='
import json, sys
try:
    data = json.loads(sys.stdin.read())
except Exception:
    sys.exit(0)
sys.stdout.write(data.get("cwd") or data.get("workspace_dir") or "")
'
# shellcheck disable=SC2086
PROMPT=$($PY -c "$EXTRACT_PROMPT" <<< "$INPUT" || true)
# shellcheck disable=SC2086
CWD=$($PY -c "$EXTRACT_CWD" <<< "$INPUT" || true)

# 降级 cwd
if [ -z "$CWD" ]; then
  CWD="${CLAUDE_PROJECT_DIR:-$PWD}"
fi

printf '[%s] fired cwd=%s prompt_len=%d\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$CWD" "${#PROMPT}" >> "$LOG_FILE"

# 空 prompt 跳过
if [ -z "$PROMPT" ]; then
  emit_empty
  exit 0
fi

# 定位 skill-catalog CLI
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
SKILL_CATALOG_DIR="$SRC_ROOT/mcp/skill-catalog"
CLI="$SKILL_CATALOG_DIR/.venv/bin/skill-catalog-cli"

if [ ! -x "$CLI" ]; then
  printf '[%s] cli missing: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$CLI" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

# 设置环境变量（与 MCP server 注册保持一致）
export SKILL_LIBRARY_PATH="${SKILL_LIBRARY_PATH:-$SRC_ROOT/skills}"
export SKILL_CATALOG_OLLAMA_HOST="${SKILL_CATALOG_OLLAMA_HOST:-http://127.0.0.1:11435}"
export SKILL_CATALOG_OLLAMA_MODEL="${SKILL_CATALOG_OLLAMA_MODEL:-qwen3:4b}"

# 调 CLI，超时保护。stderr 转日志避免污染 hook 响应通道
# 探测可用的 timeout 命令（macOS 无内置 timeout，有 gtimeout 时优先用；否则裸跑）
RESOLVE_TIMEOUT="${SKILL_RESOLVE_INJECT_TIMEOUT:-12}"
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$RESOLVE_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$RESOLVE_TIMEOUT")
else
  TIMEOUT_CMD=()
fi

RESOLVE_OUTPUT=$("${TIMEOUT_CMD[@]+"${TIMEOUT_CMD[@]}"}" "$CLI" resolve \
  --prompt "$PROMPT" \
  --cwd "$CWD" \
  --text-output \
  2>>"$LOG_FILE" || true)

if [ -z "$RESOLVE_OUTPUT" ]; then
  printf '[%s] resolve empty (timeout/error)\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

# 把 resolve 结果包装成 additionalContext（via env var，避免 shell 转义问题）
WRAP_SCRIPT='
import json, os
body = os.environ.get("RESOLVE_OUTPUT", "").strip()
if not body:
    print(json.dumps({"hookEventName": "UserPromptSubmit"}))
else:
    wrapped = (
        "[harness auto skill retrieval]\n"
        + body
        + "\n\n"
        + "主 agent 派发 coding-expert 时请在 prompt 中携带上述 skill 名字；\n"
        + "子 agent 可自行调 mcp__skill-catalog__get_skill 读取 skill 详情。\n"
        + "若任务不涉及框架/组件（纯文档/配置），可忽略此段。"
    )
    print(json.dumps({
        "hookEventName": "UserPromptSubmit",
        "additionalContext": wrapped,
    }, ensure_ascii=False))
'

# shellcheck disable=SC2086
RESOLVE_OUTPUT="$RESOLVE_OUTPUT" $PY -c "$WRAP_SCRIPT"

printf '[%s] injected ok, %d bytes\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "${#RESOLVE_OUTPUT}" >> "$LOG_FILE"
