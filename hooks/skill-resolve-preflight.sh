#!/usr/bin/env bash
# PreToolUse hook: 对 mcp__skill-catalog__resolve 做准入校验。
# 要求 tool_input.tech_stack 与 tool_input.capability 至少一个非空列表。
# 两者都空 / 缺失 → deny，强制调用方先做意图识别。
# 其他工具 / stdin 解析失败 → 放行（空输出 = 默认 allow）。

set -uo pipefail

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/skill-resolve-preflight.log"
mkdir -p "$LOG_DIR" 2>/dev/null || true

STDIN="$(cat)"

log() {
  # pid | iso-ts | message
  printf '%s | %s | %s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE" 2>/dev/null || true
}

log "fired"

RESPONSE="$(STDIN_PAYLOAD="$STDIN" python3 <<'PY' 2>/dev/null
import json
import os
import sys

raw = os.environ.get("STDIN_PAYLOAD", "")
try:
    payload = json.loads(raw)
except Exception as exc:
    # JSON 损坏 → 静默放行，stderr 记一行
    sys.stderr.write(f"skill-resolve-preflight: stdin parse failed: {exc}\n")
    print("")
    sys.exit(0)

tool_name = payload.get("tool_name") or ""
if tool_name != "mcp__skill-catalog__resolve":
    # 不该拦的工具 → 直接放行
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
tech_stack = tool_input.get("tech_stack")
language = tool_input.get("language")
capability = tool_input.get("capability")

def _nonempty(v):
    return isinstance(v, list) and len(v) > 0 and any(
        isinstance(x, str) and x.strip() for x in v
    )

if _nonempty(tech_stack) or _nonempty(language) or _nonempty(capability):
    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        }
    }
    # 把决策信号顺便写到 stderr 供上层日志
    sys.stderr.write("skill-resolve-preflight: allow\n")
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(0)

reason = (
    "调用 mcp__skill-catalog__resolve 必须携带意图识别结果："
    "tech_stack / language / capability 三个参数至少一个为非空数组。"
    "请基于当前会话上下文（user_prompt + workspace 信号）先做意图识别，"
    "分别判断涉及的技术栈、编程语言、能力域，再从合法 tag 闭集中挑选若干标签后重试。"
    "纯语言题（如'写一段 C++ 模板'）可仅填 language。"
    "合法闭集参见 SubagentStart 注入的 %skill 规范；"
    "若未触发 %skill 注入，请勿调用 mcp__skill-catalog__list_skills —— "
    "具体流程见 guidelines/knowledge-retrieval-process.md。"
)
out = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}
sys.stderr.write("skill-resolve-preflight: deny (no tags)\n")
print(json.dumps(out, ensure_ascii=False))
PY
)"

PY_EXIT=$?

if [ $PY_EXIT -ne 0 ]; then
  log "python error (exit=$PY_EXIT), falling back to allow"
  # python 本身挂了也不能拖垮工具调用
  exit 0
fi

# 记录最终决策摘要（仅看 permissionDecision 字段）
if [ -n "$RESPONSE" ]; then
  DECISION="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get("hookSpecificOutput",{}).get("permissionDecision","?"))
except Exception:
    print("?")' 2>/dev/null)"
  log "decision=$DECISION"
else
  log "decision=allow(empty)"
fi

printf '%s' "$RESPONSE"
