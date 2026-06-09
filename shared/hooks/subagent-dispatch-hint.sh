#!/usr/bin/env bash
# SubagentStart hook: inject the shared DAG/background/worktree dispatch hint.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_PATH="${SCRIPT_DIR}/../policies/subagent-dispatch-hint.json"

POLICY_PATH="${POLICY_PATH}" python3 -c '
import json
import os
import sys
from pathlib import Path

try:
    policy = json.loads(Path(os.environ["POLICY_PATH"]).read_text(encoding="utf-8"))
    additional_context = "\n".join(policy["template"])
except Exception as exc:
    print(f"subagent-dispatch-hint: failed to render shared policy: {exc}", file=sys.stderr)
    sys.exit(0)

out = {
    "hookSpecificOutput": {
        "hookEventName": "SubagentStart",
        "additionalContext": additional_context,
    }
}
print(json.dumps(out, ensure_ascii=False))
'
