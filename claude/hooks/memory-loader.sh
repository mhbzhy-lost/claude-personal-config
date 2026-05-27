#!/usr/bin/env bash
# SessionStart hook: 自动注入 ~/.claude/memory.md 到会话上下文。
# 按 cwd 的 tech signal 筛选相关章节，减少无关 context 占用。
set -uo pipefail

export MEMORY_FILE="$HOME/.claude/memory.md"

if [ ! -f "$MEMORY_FILE" ]; then
  echo ""
  exit 0
fi

export CWD="${PWD}"

python3 -c '
import json, sys, os, re
from pathlib import Path

memory_file = os.environ.get("MEMORY_FILE", "")
cwd = os.environ.get("CWD", "")

if not memory_file or not os.path.isfile(memory_file):
    print("")
    sys.exit(0)

content = Path(memory_file).read_text(encoding="utf-8", errors="replace")
if not content.strip():
    print("")
    sys.exit(0)

# 检测 cwd 的 tech signal
cwd_path = Path(cwd)
signals = set()

signal_files = {
    "package.json": {"node", "npm", "ts", "js", "typescript", "javascript"},
    "tsconfig.json": {"node", "ts", "typescript"},
    "Podfile": {"ios", "xcode", "swift", "cocoapods"},
    "build.gradle": {"android", "gradle", "kotlin", "java"},
    "build.gradle.kts": {"android", "gradle", "kotlin"},
    "settings.gradle": {"android", "gradle"},
    "pyproject.toml": {"python", "pip", "venv", "uv"},
    "requirements.txt": {"python", "pip"},
    "Cargo.toml": {"rust", "cargo"},
    "go.mod": {"go", "golang"},
    "Gemfile": {"ruby", "rails"},
    "pubspec.yaml": {"flutter", "dart"},
}

for fname, tags in signal_files.items():
    try:
        if (cwd_path / fname).exists():
            signals.update(tags)
    except OSError:
        pass

# 检测 .xcodeproj
try:
    if list(cwd_path.glob("*.xcodeproj")):
        signals.update({"ios", "xcode", "swift"})
except OSError:
    pass

# 通用关键词（始终注入的章节）
ALWAYS_INCLUDE = {
    "流程纪律", "违反", "元教训", "Claude.md", "CLAUDE.md",
    "自动化脚本", "平台集成", "Generated artifact",
}

# 按 ## 分节
sections = re.split(r"(?=^## )", content, flags=re.MULTILINE)

selected = []
for section in sections:
    if not section.strip():
        continue

    # 提取标题行
    lines = section.split("\n", 1)
    title = lines[0].strip().lower() if lines else ""

    # 通用章节始终注入
    if any(kw.lower() in title for kw in ALWAYS_INCLUDE):
        selected.append(section)
        continue

    # 有 tech signal 时按匹配筛选
    if signals:
        section_lower = section[:500].lower()  # 只看前 500 字符匹配
        if any(sig in section_lower for sig in signals):
            selected.append(section)
            continue
        # 检查 shell/zsh/bash（通用开发工具）
        if any(kw in section_lower for kw in ("shell", "zsh", "bash", "ssh", "tmux")):
            selected.append(section)
    else:
        # 无明确 signal，注入全量
        selected.append(section)

result = "".join(selected).strip()

# 体积保护
MAX_CHARS = 8000
if len(result) > MAX_CHARS:
    result = result[:MAX_CHARS] + "\n\n[... memory 已截断，完整内容请 cat ~/.claude/memory.md]"

if not result:
    print("")
    sys.exit(0)

header = "# 全局 Memory（SessionStart 自动注入）\n\n"
out = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": header + result,
    }
}
print(json.dumps(out, ensure_ascii=False))
'
