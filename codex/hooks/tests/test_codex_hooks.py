#!/usr/bin/env python3
import json
import subprocess
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CODEX_GIT_COMMIT_HOOK = REPO_ROOT / "codex" / "hooks" / "git-commit-hint.sh"
CODEX_SKILL_PREFLIGHT_HOOK = REPO_ROOT / "codex" / "hooks" / "skill-resolve-preflight.sh"
CLAUDE_GIT_COMMIT_HOOK = REPO_ROOT / "claude" / "hooks" / "git-commit-hint.sh"
CODEX_HOOKS_JSON = REPO_ROOT / "codex" / "hooks.json"
INIT_CODEX = REPO_ROOT / "init_codex.sh"


def run_hook(script: Path, payload: dict) -> str:
    proc = subprocess.run(
        ["bash", str(script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return proc.stdout


def bash_payload(command: str, description: str = "") -> dict:
    return {
        "tool_name": "Bash",
        "tool_input": {
            "command": command,
            "cmd": command,
            "description": description,
        },
    }


class CodexHooksTest(unittest.TestCase):
    def test_codex_git_commit_hook_denies_without_command_marker(self) -> None:
        output = run_hook(CODEX_GIT_COMMIT_HOOK, bash_payload("git commit -m test"))
        data = json.loads(output)
        hook_output = data["hookSpecificOutput"]

        self.assertEqual(hook_output["permissionDecision"], "deny")
        reason = hook_output["permissionDecisionReason"]
        self.assertIn("命令文本", reason)
        self.assertNotIn("description 字段", reason)

    def test_codex_git_commit_hook_allows_command_marker(self) -> None:
        output = run_hook(
            CODEX_GIT_COMMIT_HOOK,
            bash_payload("git commit -m test # skip-git-commit-hint"),
        )

        self.assertEqual(output, "")

    def test_codex_git_commit_hook_does_not_match_commit_tree(self) -> None:
        output = run_hook(CODEX_GIT_COMMIT_HOOK, bash_payload("git commit-tree HEAD"))

        self.assertEqual(output, "")

    def test_codex_hook_layout_is_separate_from_claude_hooks(self) -> None:
        self.assertTrue(CODEX_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(CODEX_SKILL_PREFLIGHT_HOOK.is_file())
        self.assertTrue(CLAUDE_GIT_COMMIT_HOOK.is_file())

        hooks_json = CODEX_HOOKS_JSON.read_text()
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/git-commit-hint.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/skill-resolve-preflight.sh", hooks_json)
        self.assertNotIn("__CLAUDE_CONFIG_HOME__/hooks/", hooks_json)

        init_codex = INIT_CODEX.read_text()
        self.assertIn("CODEX_HOOKS_DIR", init_codex)
        self.assertIn("codex/hooks/git-commit-hint.sh", init_codex)


if __name__ == "__main__":
    unittest.main()
