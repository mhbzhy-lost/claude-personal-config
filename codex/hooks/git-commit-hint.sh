#!/usr/bin/env bash
# Codex PreToolUse hook: detect git commit and require the review/commit workflow.
#
# Codex does not expose Claude Code's Bash tool_input.description field through
# exec_command. The escape hatch therefore lives in the command text itself:
# include "skip-git-commit-hint" in the shell command after completing the
# required checks or documenting an allowed exemption.

set -uo pipefail

STDIN="$(cat)"

RESPONSE="$(STDIN_PAYLOAD="${STDIN}" python3 <<'PY' 2>/dev/null
import json
import os
import re
import sys

raw = os.environ.get("STDIN_PAYLOAD", "")
try:
    payload = json.loads(raw)
except Exception:
    print("")
    sys.exit(0)

tool_name = payload.get("tool_name") or ""
if tool_name not in {"Bash", "exec_command", "functions.exec_command"}:
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
cmd = tool_input.get("command") or tool_input.get("cmd") or ""
description = tool_input.get("description") or ""

# Match git commit only, not git commit-tree / git commit-graph.
if not re.search(r'(^|[^\w-])git\s+commit(\s|$)', cmd):
    print("")
    sys.exit(0)

# Codex-friendly escape hatch: marker in command text. Description is accepted
# as a defensive fallback for future tool schema changes, but the user-facing
# instruction below names command text only.
if re.search(r'skip-git-commit-hint', cmd, re.IGNORECASE) or re.search(
    r'skip-git-commit-hint', description, re.IGNORECASE
):
    print("")
    sys.exit(0)

reason = (
    "[codex git-commit hook] 准备执行 git commit，提交前必须完成以下两件事：\n"
    "1) 读取 git-commit skill 获取 commit message 规范，再生成 message；\n"
    "2) 读取 external-llm-review skill，对本次 staged diff（`git diff --cached`）"
    "跑一次外源评审；未给出 non-blocking 结论前不得 commit，fix 后需重新跑直到收敛。\n"
    "若满足 CLAUDE.md「异源复审 / 何时不必用」豁免条件（纯文档配置、作用域<50 行且无外部依赖、"
    "无 API 凭据、项目合规策略禁止外发），可跳过第 2 步并在 commit message 注明豁免原因。\n"
    "Codex 没有可写的 Bash 放行字段；完成上述步骤后，请在命令文本中包含 "
    "\"skip-git-commit-hint\" 以放行本次 commit。"
)

out = {
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}
print(json.dumps(out, ensure_ascii=False))
PY
)"

if [ $? -ne 0 ]; then
  exit 0
fi

printf '%s' "${RESPONSE}"
