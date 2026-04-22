#!/usr/bin/env bash
# UserPromptSubmit hook: 在用户每次提交 prompt 前，调用 skill-catalog resolve
# 自动完成 stack detect + skill match，把结果作为 additionalContext 注入主 agent
# 上下文。
#
# 支持用户侧 sentinel（放在 prompt 任意位置，识别后从 classifier 输入中剔除）：
#   %skill              → strict 模式：正常 resolve + 硬口径注入尾巴
#   %skill:<n>,<n>,...  → pinned 模式：跳过 resolve，直接 get_skill 拉 body 注入
#   %skill:none         → disabled 模式：跳过所有检索
#   （无 sentinel）     → default 模式：软约束注入（现状）
#
# 失败策略：**永远不阻断用户 prompt**。任一步异常都输出空 additionalContext
# 并以 exit 0 退出。
#
# stdin:  Claude Code UserPromptSubmit hook JSON
# stdout: { "hookEventName": "UserPromptSubmit", "additionalContext": "..." }
# stderr: 仅作为异常 fallback 日志（主日志走 $LOG_FILE）

set -euo pipefail

LOG_FILE="${SKILL_RESOLVE_INJECT_LOG:-$HOME/.claude/logs/skill-resolve-inject.log}"
mkdir -p "$(dirname "$LOG_FILE")"

emit_empty() {
  printf '{"hookEventName":"UserPromptSubmit"}\n'
}

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

if [ -z "$CWD" ]; then
  CWD="${CLAUDE_PROJECT_DIR:-$PWD}"
fi

printf '[%s] fired cwd=%s prompt_len=%d\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$CWD" "${#PROMPT}" >> "$LOG_FILE"

if [ -z "$PROMPT" ]; then
  emit_empty
  exit 0
fi

# ------------------------------------------------------------------
# Sentinel 扫描：识别 %skill / %skill:<names> / %skill:none
# 输出三段，用 \x1f (unit separator) 分隔，避免 shell 边界事故
# 段1: mode (strict|pinned|disabled|default)
# 段2: names csv（仅 pinned 有值）
# 段3: 剔除 sentinel 后的 clean prompt
# ------------------------------------------------------------------
SENTINEL_SCRIPT='
import os, re, sys
prompt = os.environ.get("PROMPT", "")
pat = re.compile(r"(?:^|\s)%skill(?::([A-Za-z0-9_,\-]+))?(?=\s|$)")
m = pat.search(prompt)
if not m:
    sys.stdout.write("default\x1f\x1f" + prompt)
    sys.exit(0)
stuff = m.group(1)
if stuff is None:
    mode = "strict"
    names = ""
elif stuff.strip() == "none":
    mode = "disabled"
    names = ""
else:
    parts = [p.strip() for p in stuff.split(",")]
    parts = [p for p in parts if p]
    mode = "pinned" if parts else "strict"
    names = ",".join(parts)
# 从 prompt 剔除所有 %skill... 出现
clean = pat.sub(" ", prompt).strip()
# 压缩连续空白
clean = re.sub(r"[ \t]+", " ", clean)
sys.stdout.write(f"{mode}\x1f{names}\x1f{clean}")
'

SENTINEL_OUTPUT=$(PROMPT="$PROMPT" $PY -c "$SENTINEL_SCRIPT" || true)

if [ -z "$SENTINEL_OUTPUT" ]; then
  MODE="default"
  PINNED_NAMES=""
  CLEAN_PROMPT="$PROMPT"
else
  MODE=$(printf '%s' "$SENTINEL_OUTPUT" | $PY -c 'import sys; print(sys.stdin.read().split(chr(0x1f))[0], end="")')
  PINNED_NAMES=$(printf '%s' "$SENTINEL_OUTPUT" | $PY -c 'import sys; p=sys.stdin.read().split(chr(0x1f)); print(p[1] if len(p)>1 else "", end="")')
  CLEAN_PROMPT=$(printf '%s' "$SENTINEL_OUTPUT" | $PY -c 'import sys; p=sys.stdin.read().split(chr(0x1f)); print(chr(0x1f).join(p[2:]) if len(p)>2 else "", end="")')
fi

printf '[%s] mode=%s names=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$MODE" "$PINNED_NAMES" >> "$LOG_FILE"

# ------------------------------------------------------------------
# disabled 分支：直接输出 marker，不触 CLI
# ------------------------------------------------------------------
if [ "$MODE" = "disabled" ]; then
  WRAP='
import json
wrapped = (
    "[harness skill retrieval: user-disabled (%skill:none)]\n"
    "用户显式声明本轮不涉及框架知识检索。主 agent 直接动手即可。"
)
print(json.dumps({"hookEventName":"UserPromptSubmit","additionalContext":wrapped}, ensure_ascii=False))
'
  $PY -c "$WRAP"
  printf '[%s] disabled mode, injected marker\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  exit 0
fi

# ------------------------------------------------------------------
# 定位 CLI
# ------------------------------------------------------------------
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
SKILL_CATALOG_DIR="$SRC_ROOT/mcp/skill-catalog"
CLI="$SKILL_CATALOG_DIR/.venv/bin/skill-catalog-cli"

if [ ! -x "$CLI" ]; then
  printf '[%s] cli missing: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$CLI" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

export SKILL_LIBRARY_PATH="${SKILL_LIBRARY_PATH:-$SRC_ROOT/skills}"
export SKILL_CATALOG_OLLAMA_HOST="${SKILL_CATALOG_OLLAMA_HOST:-http://127.0.0.1:11435}"
export SKILL_CATALOG_OLLAMA_MODEL="${SKILL_CATALOG_OLLAMA_MODEL:-qwen3:4b}"

RESOLVE_TIMEOUT="${SKILL_RESOLVE_INJECT_TIMEOUT:-12}"
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(timeout "$RESOLVE_TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD=(gtimeout "$RESOLVE_TIMEOUT")
else
  TIMEOUT_CMD=()
fi

# ------------------------------------------------------------------
# pinned 分支：对每个 name 调 get --text-output，聚合注入
# ------------------------------------------------------------------
if [ "$MODE" = "pinned" ]; then
  : > "$LOG_FILE.pinned.tmp" 2>/dev/null || true
  # 用 NUL 分段构造聚合内容（交给 python 组装 JSON）
  AGG_FILE=$(mktemp)
  MISS_FILE=$(mktemp)
  IFS=',' read -r -a NAME_ARR <<< "$PINNED_NAMES"
  for n in "${NAME_ARR[@]}"; do
    [ -z "$n" ] && continue
    BODY=$("${TIMEOUT_CMD[@]+"${TIMEOUT_CMD[@]}"}" "$CLI" get --name "$n" --text-output 2>>"$LOG_FILE" || true)
    if [ -n "$BODY" ]; then
      {
        printf '=== skill: %s ===\n' "$n"
        printf '%s\n\n' "$BODY"
      } >> "$AGG_FILE"
      printf '[%s]   pinned hit: %s (%d bytes)\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" "$n" "${#BODY}" >> "$LOG_FILE"
    else
      printf '%s\n' "$n" >> "$MISS_FILE"
      printf '[%s]   pinned miss: %s\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" "$n" >> "$LOG_FILE"
    fi
  done

  PINNED_WRAP='
import json, os
names = os.environ.get("PINNED_NAMES", "")
agg_path = os.environ.get("AGG_FILE", "")
miss_path = os.environ.get("MISS_FILE", "")
try:
    agg = open(agg_path, "r", encoding="utf-8").read() if agg_path else ""
except Exception:
    agg = ""
try:
    miss_raw = open(miss_path, "r", encoding="utf-8").read() if miss_path else ""
except Exception:
    miss_raw = ""
miss_list = [ln.strip() for ln in miss_raw.splitlines() if ln.strip()]
parts = [f"[harness skill retrieval: user-pinned mode (%skill:{names})]",
         "以下为用户显式指定的 skill 完整内容：", ""]
if agg.strip():
    parts.append(agg.rstrip())
else:
    parts.append("(无命中的 skill)")
if miss_list:
    parts.append("")
    parts.append("未找到的 skill: " + ", ".join(miss_list))
parts.append("")
parts.append("---")
parts.append("主 agent 可直接依据上述 skill 内容动手或派发 coding-expert；")
parts.append("子 agent 侧 SubagentStart hook 会独立注入规范，其自身的 resolve 流程不受本模式影响。")
wrapped = "\n".join(parts)
print(json.dumps({"hookEventName":"UserPromptSubmit","additionalContext":wrapped}, ensure_ascii=False))
'
  PINNED_NAMES="$PINNED_NAMES" AGG_FILE="$AGG_FILE" MISS_FILE="$MISS_FILE" $PY -c "$PINNED_WRAP"
  rm -f "$AGG_FILE" "$MISS_FILE" 2>/dev/null || true
  printf '[%s] pinned mode injected\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  exit 0
fi

# ------------------------------------------------------------------
# strict / default 分支：都走 resolve，差异仅在注入尾巴
# ------------------------------------------------------------------
RESOLVE_PROMPT="$CLEAN_PROMPT"
if [ -z "$RESOLVE_PROMPT" ]; then
  RESOLVE_PROMPT="$PROMPT"
fi

RESOLVE_OUTPUT=$("${TIMEOUT_CMD[@]+"${TIMEOUT_CMD[@]}"}" "$CLI" resolve \
  --prompt "$RESOLVE_PROMPT" \
  --cwd "$CWD" \
  --text-output \
  2>>"$LOG_FILE" || true)

if [ -z "$RESOLVE_OUTPUT" ]; then
  printf '[%s] resolve empty (timeout/error)\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
  emit_empty
  exit 0
fi

WRAP_SCRIPT='
import json, os
body = os.environ.get("RESOLVE_OUTPUT", "").strip()
mode = os.environ.get("MODE", "default")
if not body:
    print(json.dumps({"hookEventName": "UserPromptSubmit"}))
else:
    if mode == "strict":
        header = "[harness skill retrieval: user-strict mode (%skill)]"
        tail = (
            "[本轮为用户强制检索模式 (%skill)]\n"
            "派发 coding-expert 前，主 agent 必须在派发 prompt 里携带上述相关 skill 的 name；\n"
            "subagent 侧 SubagentStart hook 注入的规范会强制其 resolve + get_skill 读详情。\n"
            "未按此模式派发视为违规。"
        )
    else:
        header = "[harness auto skill retrieval]"
        tail = (
            "主 agent 派发 coding-expert 时请在 prompt 中携带上述 skill 名字；\n"
            "子 agent 可自行调 mcp__skill-catalog__get_skill 读取 skill 详情。\n"
            "若任务不涉及框架/组件（纯文档/配置），可忽略此段。"
        )
    wrapped = header + "\n" + body + "\n\n" + tail
    print(json.dumps({
        "hookEventName": "UserPromptSubmit",
        "additionalContext": wrapped,
    }, ensure_ascii=False))
'

# shellcheck disable=SC2086
RESOLVE_OUTPUT="$RESOLVE_OUTPUT" MODE="$MODE" $PY -c "$WRAP_SCRIPT"

printf '[%s] injected ok mode=%s\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$MODE" >> "$LOG_FILE"
