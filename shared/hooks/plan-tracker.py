#!/usr/bin/env python3
"""Scan repo for active plan files and list pending TODO items."""

import re
import sys
from pathlib import Path

TODO_PATTERN = re.compile(r"^-?\s*TODO:\s*(.+)", re.MULTILINE)
DONE_PATTERN = re.compile(r"^-?\s*(DONE|COMPLETED|COMPLETE):\s*(.+)", re.MULTILINE | re.IGNORECASE)


def scan_todos(text):
    return [m.group(1).strip() for m in TODO_PATTERN.finditer(text)]


def scan_plan(root):
    root = Path(root)
    pending = []

    for p in root.rglob("*.md"):
        if ".workflow/" in p.parts or "node_modules/" in p.parts:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            print(f"Warning: cannot read {p}: {e}", file=sys.stderr)
            continue

        todos = scan_todos(text)
        if not todos:
            continue

        rel = p.relative_to(root)
        for task in todos:
            pending.append((str(rel), task))

    return pending


def main():
    if len(sys.argv) != 2:
        print("Usage: plan-tracker.py <repo-root>", file=sys.stderr)
        sys.exit(2)

    root = sys.argv[1]
    pending = scan_plan(root)

    if pending:
        print("Plan has pending TODO items:")
        for rel, task in pending:
            print(f"  {rel}: TODO: {task}")
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
