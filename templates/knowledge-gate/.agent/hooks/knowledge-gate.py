#!/usr/bin/env python3
"""Project-local knowledge gate for staged changes.

This file is intended to be copied into a target repository. It must not import
from claude-config at runtime.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def _run_git(repo: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
        check=False,
    )


def _repo_root(repo_arg: str | None) -> Path | None:
    if repo_arg:
        return Path(repo_arg).resolve()

    proc = _run_git(Path.cwd(), ["rev-parse", "--show-toplevel"])
    if proc.returncode != 0:
        print("knowledge-gate: not inside a git repository", file=sys.stderr)
        return None
    return Path(proc.stdout.strip()).resolve()


def _load_config(config_path: Path) -> tuple[dict[str, Any] | None, str | None]:
    if not config_path.is_file():
        print(f"knowledge-gate: no config at {config_path}", file=sys.stderr)
        return None, None

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, f"knowledge-gate: invalid JSON in {config_path}: {exc}"

    if not isinstance(raw, dict):
        return None, f"knowledge-gate: config must be a JSON object: {config_path}"
    return raw, None


def _staged_files(repo: Path) -> list[str] | None:
    proc = _run_git(repo, ["diff", "--cached", "--name-only", "--diff-filter=ACM"])
    if proc.returncode != 0:
        detail = proc.stderr.strip() or "unknown error"
        print(f"knowledge-gate: git diff failed: {detail}", file=sys.stderr)
        return None
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def _matches_any(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]


def _rule_violations(config: dict[str, Any], staged: list[str]) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    rules = config.get("rules")
    if not isinstance(rules, list):
        return violations

    for index, rule in enumerate(rules, start=1):
        if not isinstance(rule, dict):
            continue

        paths = _as_string_list(rule.get("paths"))
        satisfy_by = _as_string_list(rule.get("satisfy_by"))
        if not paths or not satisfy_by:
            continue

        matched = [path for path in staged if _matches_any(path, paths)]
        if not matched:
            continue

        satisfied = [path for path in staged if _matches_any(path, satisfy_by)]
        if satisfied:
            continue

        violations.append(
            {
                "id": rule.get("id") if isinstance(rule.get("id"), str) else f"rule-{index}",
                "reason": rule.get("reason") if isinstance(rule.get("reason"), str) else "",
                "matched": matched,
                "satisfy_by": satisfy_by,
            }
        )
    return violations


def _print_violations(violations: list[dict[str, Any]], mode: str = "block") -> None:
    if mode == "hint":
        print("⚠️  knowledge-gate 提醒: 以下变更建议补充知识库文档（非阻断）")
    else:
        print("knowledge-gate: staged diff requires knowledge documentation update")
    
    for violation in violations:
        print(f"\nRule: {violation['id']}")
        if violation["reason"]:
            print(f"Reason: {violation['reason']}")
        print("Matched files:")
        for path in violation["matched"]:
            print(f"  - {path}")
        print("Satisfy by staging one of:")
        for pattern in violation["satisfy_by"]:
            print(f"  - {pattern}")
        if mode == "hint":
            print("💡 提示: 如需补充，请添加对应文档后重新提交")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo")
    parser.add_argument("--mode", default="check")
    args = parser.parse_args(argv)

    repo = _repo_root(args.repo)
    if repo is None:
        return 0

    config_path = repo / ".agent" / "knowledge-gate.json"
    config, error = _load_config(config_path)
    if error:
        print(error, file=sys.stderr)
        return 2
    if config is None:
        return 0

    staged = _staged_files(repo)
    if staged is None:
        return 2
    if not staged:
        return 0

    violations = _rule_violations(config, staged)
    if not violations:
        return 0

    mode = config.get("mode", "block")
    _print_violations(violations, mode=mode)
    
    # In hint mode, print reminder but don't block
    if mode == "hint":
        return 0
    
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
