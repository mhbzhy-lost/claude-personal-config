#!/usr/bin/env bash
# SubagentStop hook: coding-expert 三档指标采集.
#
# 扫 subagent transcript，统计知识检索相关指标，按 JSON Lines 写审计日志
# ~/.claude/logs/coding-expert-audit.log。
#
# 纯数据采集，不向主 agent 返回任何信号。
# 永不阻断 subagent 交付：任何异常都输出合法空响应 exit 0。

set -u

LOG_FILE="${CODING_EXPERT_AUDIT_LOG:-$HOME/.claude/logs/coding-expert-audit.log}"
DEBUG_LOG="${CODING_EXPERT_AUDIT_DEBUG_LOG:-$HOME/.claude/logs/coding-expert-audit-payload.log}"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
mkdir -p "$(dirname "$DEBUG_LOG")" 2>/dev/null || true

emit_empty() {
  printf '{"hookEventName":"SubagentStop"}\n'
  exit 0
}

# 探测 python
if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v uv >/dev/null 2>&1; then
  PY="uv run python"
else
  echo "[coding-expert-audit] ERROR: no python3 or uv" >&2
  emit_empty
fi

PAYLOAD=$(cat)

SCRIPT=$(cat <<'PYEOF'
import json
import os
import sys
from datetime import datetime
from pathlib import Path

log_file = sys.argv[1]
debug_log = sys.argv[2]
raw = sys.stdin.read()

def log(line: str) -> None:
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def emit_empty():
    sys.stdout.write('{"hookEventName":"SubagentStop"}\n')
    sys.exit(0)

def write_stats(agent_type, session_id, transcript_basename, first_tool, resolve, get_skill, list_skills, edit_write, no_match, fallback):
    ts = datetime.now().astimezone().isoformat(timespec='seconds')
    rec = {
        "ts": ts,
        "agent_type": agent_type,
        "session_id": session_id,
        "transcript": transcript_basename,
        "first_tool": first_tool,
        "resolve": resolve,
        "get_skill": get_skill,
        "list_skills": list_skills,
        "edit_write": edit_write,
        "no_match": no_match,
        "fallback": fallback,
    }
    log(json.dumps(rec, ensure_ascii=False))

def resolve_subagent_transcript(payload):
    """
    返回 (path_str, used_fallback: bool)
    优先级:
    1) payload 里的专属 subagent transcript 字段
    2) transcript_path 的 dirname + /subagents/ → 按 mtime 找最新 agent-*.jsonl
    3) fallback 到 payload["transcript_path"]
    """
    # 1) 专属字段
    for key in ("subagent_transcript_path", "agent_transcript_path", "child_transcript_path"):
        v = payload.get(key)
        if v:
            return (v, False)

    transcript_path = payload.get("transcript_path", "")
    if not transcript_path:
        return ("", True)

    # 2) subagents/ 目录下最新 agent-*.jsonl
    parent_dir = Path(transcript_path).parent
    subagents_dir = parent_dir / Path(transcript_path).stem / "subagents"
    if not subagents_dir.is_dir():
        # 也尝试 parent_dir / "subagents"
        subagents_dir = parent_dir / "subagents"

    if subagents_dir.is_dir():
        candidates = list(subagents_dir.glob("agent-*.jsonl"))
        if candidates:
            newest = max(candidates, key=lambda p: p.stat().st_mtime)
            return (str(newest), False)

    # 3) fallback
    return (transcript_path, True)

# Debug dump — 一次性 payload 追加，写失败不阻断
try:
    with open(debug_log, "a", encoding="utf-8") as df:
        df.write(json.dumps(json.loads(raw) if raw.strip() else {}, ensure_ascii=False) + "\n")
except Exception:
    pass

try:
    payload = json.loads(raw) if raw.strip() else {}
except Exception as e:
    print(f"[coding-expert-audit] ERROR: bad payload JSON: {e}", file=sys.stderr)
    emit_empty()

# 兼容多种字段名
agent_type = (
    payload.get("agent_type")
    or payload.get("subagent_type")
    or payload.get("matcher")
    or ""
)
session_id = payload.get("session_id", "")

ALLOWED = {"coding-expert", "coding-expert-light", "coding-expert-heavy"}
if agent_type and agent_type not in ALLOWED:
    # matcher 已过滤，这里仅兜底
    emit_empty()

transcript_path, used_fallback = resolve_subagent_transcript(payload)
fallback_flag = 1 if used_fallback else 0
transcript_basename = os.path.basename(transcript_path) if transcript_path else ""

if not transcript_path or not os.path.isfile(transcript_path):
    print(f"[coding-expert-audit] ERROR: transcript not found: {transcript_path}", file=sys.stderr)
    write_stats(agent_type, session_id, transcript_basename, None, 0, 0, 0, 0, False, fallback_flag)
    emit_empty()

first_tool = None
resolve_count = 0
get_skill_count = 0
list_skills_count = 0
edit_write_count = 0
no_match_declared = False

EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}

try:
    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            msg = rec.get("message") or {}
            content = msg.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "tool_use":
                    name = block.get("name", "")
                    if first_tool is None:
                        first_tool = name
                    if name == "mcp__skill-catalog__resolve":
                        resolve_count += 1
                    elif name == "mcp__skill-catalog__get_skill":
                        get_skill_count += 1
                    elif name == "mcp__skill-catalog__list_skills":
                        list_skills_count += 1
                    if name in EDIT_TOOLS:
                        edit_write_count += 1
                elif btype == "text" and rec.get("type") == "assistant":
                    text = block.get("text", "") or ""
                    if not no_match_declared and "skill-retrieval: no-match" in text:
                        no_match_declared = True
except Exception as e:
    print(f"[coding-expert-audit] ERROR reading transcript: {e}", file=sys.stderr)
    write_stats(agent_type, session_id, transcript_basename, None, 0, 0, 0, 0, False, fallback_flag)
    emit_empty()

write_stats(agent_type, session_id, transcript_basename, first_tool, resolve_count, get_skill_count, list_skills_count, edit_write_count, no_match_declared, fallback_flag)
emit_empty()
PYEOF
)

# shellcheck disable=SC2086
printf '%s' "$PAYLOAD" | $PY -c "$SCRIPT" "$LOG_FILE" "$DEBUG_LOG"
exit 0
