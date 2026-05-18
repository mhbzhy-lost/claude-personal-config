#!/usr/bin/env bash
# PreToolUse hook: 检测 Bash 工具是否在执行 git commit。
# 是则**阻断**执行，要求 agent 先调用 git-commit + external-llm-review skill。
# 逃生舱：tool_input.description 含 "skip-git-commit-hint" 即放行（agent 完成 skill
# 流程后带此标记重试本次 commit）。

set -uo pipefail

STDIN="$(cat)"

RESPONSE="$(STDIN_PAYLOAD="$STDIN" python3 <<'PY' 2>/dev/null
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

if payload.get("tool_name") != "Bash":
    print("")
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
cmd = tool_input.get("command", "") or ""
description = tool_input.get("description", "") or ""

# 仅匹配 git commit（排除 git commit-tree / git commit-graph 等子命令）
if not re.search(r'(^|[^\w-])git\s+commit(\s|$)', cmd):
    print("")
    sys.exit(0)

# 逃生舱：description 含特殊标记则放行
if re.search(r'skip-git-commit-hint', description, re.IGNORECASE):
    print("")
    sys.exit(0)

reason = (
    "[git-commit hook] 准备执行 git commit，提交前必须完成以下两件事：\n"
    "1) 通过 Skill 工具调用 git-commit skill 获取 commit message 规范，再生成 message；\n"
    "2) 通过 Skill 工具调用 external-llm-review skill，对本次 staged diff "
    "（`git diff --cached`）跑一次外源评审；未给出 non-blocking 结论前不得 commit，"
    "fix 后需重新跑直到收敛。\n"
    "若满足 CLAUDE.md「异源复审 / 何时不必用」豁免条件（纯文档配置、作用域<50 行且无外部依赖、"
    "无 API 凭据、项目合规策略禁止外发），可跳过第 2 步并在 commit message 注明豁免原因。\n"
    "完成上述步骤后，请在本次 Bash 工具的 description 字段中包含字符串 "
    "\"skip-git-commit-hint\" 以放行 commit。"
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

printf '%s' "$RESPONSE"
