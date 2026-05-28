#!/usr/bin/env bash
# PreToolUse hook (matcher: Edit|Write|apply_patch|functions.apply_patch): TDD + Bugfix 合并提醒。
# 仅对白名单内的代码文件后缀触发；测试文件静默放行。
# 对齐 Claude Code 端 claude/hooks/coding-guard.sh。
set -uo pipefail

python3 -c '
import json, sys, os, re

CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".sh", ".rb",
    ".c", ".cpp", ".h", ".hpp", ".cc", ".cxx",
    ".swift", ".m", ".mm",
    ".kt", ".kts", ".java",
    ".ets",
}

PATCH_PATH_PREFIXES = (
    "*** Add File: ",
    "*** Update File: ",
    "*** Delete File: ",
    "*** Move to: ",
)


def is_test_path(file_path):
    basename = os.path.basename(file_path)
    dir_path = file_path.replace("\\", "/").lower()
    relative_dir_path = dir_path.lstrip("./")
    if re.search(r"(test|spec|_test|\.test\.|\.spec\.)", basename, re.IGNORECASE):
        return True
    return (
        relative_dir_path.startswith("tests/")
        or relative_dir_path.startswith("test/")
        or relative_dir_path.startswith("__tests__/")
        or "/tests/" in dir_path
        or "/test/" in dir_path
        or "/__tests__/" in dir_path
    )


def is_guarded_code_path(file_path):
    if not isinstance(file_path, str) or not file_path:
        return False
    _, ext = os.path.splitext(file_path)
    return ext.lower() in CODE_EXTENSIONS and not is_test_path(file_path)


def patch_paths(patch_text):
    if not isinstance(patch_text, str):
        return []
    paths = []
    for line in patch_text.splitlines():
        for prefix in PATCH_PATH_PREFIXES:
            if line.startswith(prefix):
                file_path = line[len(prefix):].strip()
                if file_path:
                    paths.append(file_path)
                break
    return paths


def collect_candidate_paths(tool_input):
    paths = []
    patches = []

    if isinstance(tool_input, str):
        patches.append(tool_input)
    elif isinstance(tool_input, dict):
        sources = [tool_input]
        params = tool_input.get("parameters")
        if isinstance(params, dict):
            sources.append(params)

        for source in sources:
            for key in ("file_path", "path", "filePath"):
                value = source.get(key)
                if isinstance(value, str) and value:
                    paths.append(value)
            for key in ("patch", "input", "content"):
                value = source.get(key)
                if isinstance(value, str):
                    patches.append(value)

    for patch in patches:
        paths.extend(patch_paths(patch))

    return paths

try:
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    payload = json.loads(raw)
except Exception:
    sys.exit(0)

tool_input = payload.get("tool_input") or {}
if not any(is_guarded_code_path(path) for path in collect_candidate_paths(tool_input)):
    sys.exit(0)

msg = (
    "⛔ 编辑非测试代码文件前确认："
    "(1) TDD：对应的失败测试写了吗？"
    "(2) 若在修 bug：docs/bugs/bug-*.md 分析文档写了吗？"
)
print(msg)
'
