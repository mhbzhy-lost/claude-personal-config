#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash): 异源 review 自动执行 gate。
# 拦截 git push，自动执行 reviewer.py，两轮策略状态机驱动。
# 通过时透明放行；有问题时 deny + review 全文回填到对话 context。
set -uo pipefail

export CLAUDE_CONFIG_HOME="${CLAUDE_CONFIG_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export MARKER_DIR="${CLAUDE_CONFIG_HOME}/.review-markers"
export REVIEWER_PY="${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py"
export REVIEWER_ENV="${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/.env"

python3 -c '
import hashlib, json, os, re, subprocess, sys, time
from pathlib import Path

MARKER_DIR = Path(os.environ["MARKER_DIR"])
REVIEWER_PY = os.environ["REVIEWER_PY"]
REVIEWER_ENV = os.environ["REVIEWER_ENV"]
CLAUDE_CONFIG_HOME = os.environ["CLAUDE_CONFIG_HOME"]

SKIP_ENV = "EXTERNAL_REVIEW_SKIP"
SKIP_VALUES = {"1", "true", "yes", "on"}
NON_CODE_EXTS = {".md", ".json", ".txt", ".yml", ".yaml", ".toml", ".csv", ".lock", ".gitignore"}
MAX_EXEMPT_LINES = 10
MARKER_TTL_HOURS = 24


def allow():
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
    }}))
    sys.exit(0)


def deny(reason: str):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}, ensure_ascii=False))
    sys.exit(0)


def silent():
    print("")
    sys.exit(0)


def log(msg: str):
    print(f"[external-review-gate] {msg}", file=sys.stderr)


# --- Parse stdin ---
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    silent()

if payload.get("tool_name") != "Bash":
    silent()

tool_input = payload.get("tool_input") or {}
cmd = tool_input.get("command", "") or ""

# Only match git push (not git push-related subcommands)
if not re.search(r"(^|[^\w-])git\s+push(\s|$)", cmd):
    silent()

# --- Escape hatch ---
for key in ("env", "environment"):
    env_dict = tool_input.get(key)
    if isinstance(env_dict, dict) and str(env_dict.get(SKIP_ENV, "")).strip().lower() in SKIP_VALUES:
        log("escape hatch: allow (structured env)")
        allow()

if re.search(rf"{SKIP_ENV}=\S+\s+git\s+push", cmd):
    log("escape hatch: allow (command prefix)")
    allow()

# --- Check .env exists (reviewer.py needs credentials) ---
if not Path(REVIEWER_ENV).is_file():
    log("no .env configured, degraded allow")
    allow()

# --- Determine base ref ---
try:
    default_branch = subprocess.check_output(
        ["git", "rev-parse", "--abbrev-ref", "origin/HEAD"],
        text=True, stderr=subprocess.DEVNULL
    ).strip()
except Exception:
    default_branch = "origin/main"

# --- Check if there are commits to push ---
try:
    ahead = subprocess.check_output(
        ["git", "rev-list", f"{default_branch}..HEAD", "--count"],
        text=True, stderr=subprocess.DEVNULL
    ).strip()
    if ahead == "0":
        silent()  # nothing to push, let git handle it
except Exception:
    silent()

# --- Get diff stats for exemption ---
try:
    diff_stat = subprocess.check_output(
        ["git", "diff", "--stat", f"{default_branch}..HEAD"],
        text=True, stderr=subprocess.DEVNULL
    ).strip()
    diff_numstat = subprocess.check_output(
        ["git", "diff", "--numstat", f"{default_branch}..HEAD"],
        text=True, stderr=subprocess.DEVNULL
    ).strip()
except Exception:
    log("git diff failed, degraded allow")
    allow()

# Exemption: diff < 10 lines total
if diff_numstat:
    total_lines = 0
    all_non_code = True
    for line in diff_numstat.strip().split("\n"):
        parts = line.split("\t")
        if len(parts) >= 3:
            added = int(parts[0]) if parts[0] != "-" else 0
            removed = int(parts[1]) if parts[1] != "-" else 0
            total_lines += added + removed
            ext = os.path.splitext(parts[2])[1].lower()
            if ext not in NON_CODE_EXTS:
                all_non_code = False

    if total_lines < MAX_EXEMPT_LINES:
        log(f"exempt: diff only {total_lines} lines")
        allow()

    if all_non_code:
        log("exempt: all files are non-code")
        allow()

# --- Compute diff hash ---
try:
    diff_content = subprocess.check_output(
        ["git", "diff", f"{default_branch}..HEAD"],
        text=True, stderr=subprocess.DEVNULL
    )
    diff_hash = hashlib.sha256(diff_content.encode()).hexdigest()[:16]
except Exception:
    log("cannot compute diff hash, degraded allow")
    allow()

# --- Repo slug ---
try:
    remote_url = subprocess.check_output(
        ["git", "remote", "get-url", "origin"],
        text=True, stderr=subprocess.DEVNULL
    ).strip()
    slug = re.sub(r"[^\w-]", "_", remote_url.split("/")[-1].replace(".git", ""))
except Exception:
    slug = "unknown"

# --- Read marker ---
MARKER_DIR.mkdir(parents=True, exist_ok=True)
marker_path = MARKER_DIR / f"{slug}.json"
marker = None
if marker_path.is_file():
    try:
        marker = json.loads(marker_path.read_text())
        # Check TTL
        ts = marker.get("timestamp", "")
        if ts:
            age_hours = (time.time() - time.mktime(time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ"))) / 3600
            if age_hours > MARKER_TTL_HOURS:
                marker = None
                log("marker expired")
    except Exception:
        marker = None

# --- State machine ---
def determine_action():
    """Returns (action, round) where action is allow/deny/run and round is 1 or 2."""
    if marker is None:
        return ("run", 1)

    if marker.get("diff_hash") == diff_hash:
        assessment = marker.get("assessment", "")
        if "Ready" in assessment:
            return ("allow", 0)
        elif "With fixes" in assessment or "No" in assessment:
            return ("deny_fix_first", 0)
        else:
            return ("allow", 0)  # unknown assessment, allow

    # diff_hash changed
    if marker.get("round") == 1 and ("With fixes" in marker.get("assessment", "") or "No" in marker.get("assessment", "")):
        return ("run", 2)

    if marker.get("round") == 2:
        # Round 2 was for old diff, need fresh Round 1
        return ("run", 1)

    return ("run", 1)


action, review_round = determine_action()

if action == "allow":
    log("marker valid, allow push")
    allow()

if action == "deny_fix_first":
    deny(
        "🚫 禁止 push。异源 Review Round 1 发现 Critical/Important 问题尚未修复。\n"
        "你必须先修复这些问题并 commit，再次 push 时将自动执行 Round 2 验证。\n"
        "不要尝试绕过本 hook。如确有紧急理由需跳过 review，使用：\n"
        "  EXTERNAL_REVIEW_SKIP=1 git push ...\n"
        f"Marker: {marker_path}"
    )

# action == "run"
log(f"executing review round {review_round}...")

# --- Run reviewer.py ---
head_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
reviewer_cmd = [
    "uv", "run", "--no-project",
    "--with", "openai>=1.50", "--with", "python-dotenv",
    "python", REVIEWER_PY,
    default_branch, "HEAD",
    "--backend", "api",
    "--review-depth", "exhaustive",
    "--review-round", str(review_round),
    "--max-issues", "25",
]

try:
    result = subprocess.run(
        reviewer_cmd,
        capture_output=True, text=True, timeout=540,
        cwd=os.getcwd(),
    )
except subprocess.TimeoutExpired:
    log("reviewer.py timed out, degraded allow")
    allow()
except Exception as exc:
    log(f"reviewer.py failed to start: {exc}, degraded allow")
    allow()

if result.returncode != 0:
    log(f"reviewer.py exit={result.returncode}, degraded allow")
    if result.stderr:
        log(result.stderr[:500])
    allow()

review_output = result.stdout.strip()
if not review_output:
    log("reviewer.py produced empty output, degraded allow")
    allow()

# --- Parse assessment ---
assessment = "Unknown"
has_critical = False

ready_match = re.search(r"Ready to merge[?:]?\s*(Yes|No|With fixes)", review_output, re.IGNORECASE)
if ready_match:
    val = ready_match.group(1).strip()
    if val.lower() == "yes":
        assessment = "Ready to merge"
    else:
        assessment = "With fixes"

# Check for Critical section with content
critical_match = re.search(r"#{1,4}\s*Critical.*?\n(.+?)(?=\n#{1,4}\s|\Z)", review_output, re.DOTALL | re.IGNORECASE)
if critical_match:
    critical_body = critical_match.group(1).strip()
    if critical_body and not critical_body.startswith("None") and not critical_body.startswith("N/A"):
        has_critical = True

# --- Write marker ---
new_marker = {
    "round": review_round,
    "diff_hash": diff_hash,
    "assessment": assessment,
    "has_critical": has_critical,
    "base_ref": default_branch,
    "head_sha": head_sha,
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}
try:
    marker_path.write_text(json.dumps(new_marker, indent=2, ensure_ascii=False) + "\n")
    log(f"marker written: round={review_round} assessment={assessment}")
except Exception as exc:
    log(f"failed to write marker: {exc}")

# --- Decision ---
if assessment == "Ready to merge":
    log("review passed, allow push")
    allow()
else:
    escape_hint = "如确有紧急理由需跳过 review，使用：EXTERNAL_REVIEW_SKIP=1 git push ..."
    digest = (
        "## 综合判断 4 步（必须执行）\n"
        "1. 逐条比对：列出 (A)双方都抓到 (B)只外源抓到 (C)只同族抓到\n"
        "2. 对(B)做 threat-model 校验：外源常见误报——本机 CLI 输入当不可信、"
        "单 task 阻塞标 Critical、误读累积 diff、只看 diff 没看完整源码\n"
        "3. 对(C)做同族盲点反思：是否涉及训练偏好（生态版本兼容、库 API 名）\n"
        "4. 综合产出 fix dispatch：双方认可 + 任一方有真实 evidence 的项打包修复\n"
        "严重度由证据决定，不由谁说了算。\n\n"
    )
    header = (
        f"🚫 禁止 push。异源 Review Round {review_round} 发现需要修复的问题。\n"
        f"不要尝试绕过本 hook。{escape_hint}\n\n"
        f"{digest}"
        "---\n\n"
    )
    deny(header + review_output)
' <<< "$(cat)"
