#!/usr/bin/env python3
import json
import os
import shlex
import sys


REVIEWER_ABS = os.path.realpath(os.environ["REVIEWER_ABS"])
REVIEWER_REL = "claude-skills/external-llm-review/reviewer.py"
REVIEWER_ENV_PATHS = {
    f"$CLAUDE_CONFIG_HOME/{REVIEWER_REL}",
    f"${{CLAUDE_CONFIG_HOME}}/{REVIEWER_REL}",
}
CONTROL_TOKENS = {";", "&&", "||", "|", "|&", "&", "<", ">", "<<", ">>"}
DISALLOWED_COMMAND_TOKENS = {"eval", "source", "."}


def split_command(command):
    lexer = shlex.shlex(command, posix=True, punctuation_chars="<>;&|")
    lexer.whitespace_split = True
    return list(lexer)


def has_forbidden_shell_syntax(command):
    if (
        "\n" in command
        or "$(" in command
        or "<(" in command
        or ">(" in command
        or "$((" in command
        or "`" in command
    ):
        return True
    try:
        tokens = split_command(command)
    except ValueError as exc:
        print(f"external-llm-review-permission: shell parse failed: {exc}", file=sys.stderr)
        return True
    return any(
        token in CONTROL_TOKENS or token in DISALLOWED_COMMAND_TOKENS
        for token in tokens
    )


def token_is_reviewer_path(token, cwd):
    if token in REVIEWER_ENV_PATHS:
        return True
    if "$" in token:
        return False

    expanded = os.path.expanduser(token)
    if not os.path.isabs(expanded):
        expanded = os.path.join(cwd, expanded)
    return os.path.realpath(expanded) == REVIEWER_ABS


def command_mentions_reviewer(command, cwd, depth=0):
    if depth > 2 or has_forbidden_shell_syntax(command):
        return False

    try:
        tokens = split_command(command)
    except ValueError as exc:
        print(f"external-llm-review-permission: shell parse failed: {exc}", file=sys.stderr)
        return False

    for token in tokens:
        if token_is_reviewer_path(token, cwd):
            return True

    for token in tokens:
        if " " in token and command_mentions_reviewer(token, cwd, depth + 1):
            return True

    return False


def main():
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        print(f"external-llm-review-permission: json parse failed: {exc}", file=sys.stderr)
        return

    if payload.get("hook_event_name") != "PermissionRequest":
        return
    if payload.get("tool_name") != "Bash":
        return

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command") or tool_input.get("cmd") or ""
    payload_cwd = payload.get("cwd")
    cwd = payload_cwd if isinstance(payload_cwd, str) and os.path.isabs(payload_cwd) else os.getcwd()
    if not isinstance(command, str) or not command_mentions_reviewer(command, cwd):
        return

    out = {
        "hookSpecificOutput": {
            "hookEventName": "PermissionRequest",
            "decision": {"behavior": "allow"},
        }
    }
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
