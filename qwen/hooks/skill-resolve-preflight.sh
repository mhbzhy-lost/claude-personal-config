#!/usr/bin/env bash
# Qwen Code PreToolUse hook: 对 mcp__skill-catalog__resolve 做准入校验。
# 要求 tool_input.tech_stack / language / capability 至少一个非空字符串列表。
# 文案与 escape hatch 从 shared/policies/skill-resolve-preflight.json 读取，
# 多端 wrapper 引用同一份避免 drift。
# 其他工具 / stdin 解析失败 → 放行（空输出 = 默认 allow）。

set -uo pipefail

LOG_DIR="$HOME/.qwen/logs"
LOG_FILE="$LOG_DIR/skill-resolve-preflight.log"
mkdir -p "$LOG_DIR" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_PATH="${SCRIPT_DIR}/../../shared/policies/skill-resolve-preflight.json"

STDIN="$(cat)"

log() {
  printf '%s | %s | %s\n' "$$" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE" 2>/dev/null || true
}

log "fired"

RESPONSE="$(POLICY_PATH="$POLICY_PATH" HINT_HOST="qwen" STDIN_PAYLOAD="$STDIN" python3 <<'PY' 2>>"$LOG_FILE"
import json
import os
import sys
from pathlib import Path

raw = os.environ.get("STDIN_PAYLOAD", "")
try:
    payload = json.loads(raw)
except Exception as exc:
    sys.stderr.write(f"skill-resolve-preflight: stdin parse failed: {exc}\n")
    print("")
    sys.exit(0)

policy_path = Path(os.environ["POLICY_PATH"]).resolve()
try:
    policy = json.loads(policy_path.read_text(encoding="utf-8"))
except Exception as exc:
    sys.stderr.write(f"skill-resolve-preflight: policy load failed: {exc}\n")
    print("")
    sys.exit(0)

host = os.environ.get("HINT_HOST", "qwen")
target_tool = (policy.get("tool_names") or {}).get(host)
if not target_tool:
    sys.stderr.write(f"skill-resolve-preflight: missing tool_names.{host} in {policy_path}\n")
    print("")
    sys.exit(0)

tool_name = payload.get("tool_name") or ""
if tool_name != target_tool:
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}

# Qwen Code 嵌套参数: tool_input.parameters.{tech_stack,...}
# Claude Code 扁平参数: tool_input.{tech_stack,...}
params = tool_input.get("parameters") or tool_input
tech_stack = params.get("tech_stack") or tool_input.get("tech_stack")
language = params.get("language") or tool_input.get("language")
capability = params.get("capability") or tool_input.get("capability")

def _parse(v):
    """Qwen Code passes tag arrays as JSON strings, not native lists."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except (json.JSONDecodeError, TypeError):
            return v
    return v

tech_stack = _parse(tech_stack)
language = _parse(language)
capability = _parse(capability)

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
    sys.stderr.write("skill-resolve-preflight: allow\n")
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(0)

template_lines = policy.get("deny_reason_template") or []
reason = "".join(template_lines).replace("{tool_name}", target_tool)

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
  exit 0
fi

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
