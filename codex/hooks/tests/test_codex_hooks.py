#!/usr/bin/env python3
import json
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CODEX_GIT_COMMIT_HOOK = REPO_ROOT / "codex" / "hooks" / "git-commit-hint.sh"
CODEX_SKILL_PREFLIGHT_HOOK = REPO_ROOT / "codex" / "hooks" / "skill-resolve-preflight.sh"
CLAUDE_GIT_COMMIT_HOOK = REPO_ROOT / "claude" / "hooks" / "git-commit-hint.sh"
OPENCODE_GIT_COMMIT_PLUGIN = REPO_ROOT / "opencode" / "plugins" / "git-commit-hint.js"
SHARED_GIT_COMMIT_HINT = (
    REPO_ROOT / "opencode" / "plugins" / "git-commit-hint-content.json"
)
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
        self.assertIn("知识文档检查", reason)
        self.assertIn("Knowledge: not needed - <具体原因>", reason)
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

    def test_codex_git_commit_hook_handles_large_payload(self) -> None:
        command = "git commit -m " + "x" * 2_000_000
        output = run_hook(CODEX_GIT_COMMIT_HOOK, bash_payload(command))
        data = json.loads(output)
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]

        self.assertIn("知识文档检查", reason)

    def test_claude_git_commit_hook_uses_description_marker(self) -> None:
        output = run_hook(CLAUDE_GIT_COMMIT_HOOK, bash_payload("git commit -m test"))
        data = json.loads(output)
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]

        self.assertIn("知识文档检查", reason)
        self.assertIn("Knowledge: updated <path>", reason)
        self.assertIn("description 字段", reason)
        self.assertNotIn("命令文本中包含", reason)

        allowed = run_hook(
            CLAUDE_GIT_COMMIT_HOOK,
            bash_payload("git commit -m test", "skip-git-commit-hint"),
        )
        self.assertEqual(allowed, "")

    def test_git_commit_hint_content_has_single_source(self) -> None:
        shared = json.loads(SHARED_GIT_COMMIT_HINT.read_text())
        rendered = "\n".join(shared["template"]).format(
            hook_name=shared["hook_names"]["codex"],
            escape_instruction=shared["escape_instructions"]["codex"],
        )

        self.assertIn("知识文档检查", rendered)
        self.assertIn("Knowledge: updated <path>", rendered)

        for adapter in (
            CODEX_GIT_COMMIT_HOOK,
            CLAUDE_GIT_COMMIT_HOOK,
            OPENCODE_GIT_COMMIT_PLUGIN,
        ):
            adapter_text = adapter.read_text()
            self.assertIn("git-commit-hint-content.json", adapter_text)
            self.assertNotIn("知识文档检查", adapter_text)
            self.assertNotIn("Knowledge: updated <path>", adapter_text)

    def test_codex_hook_layout_is_separate_from_claude_hooks(self) -> None:
        self.assertTrue(CODEX_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(CODEX_SKILL_PREFLIGHT_HOOK.is_file())
        self.assertTrue(CLAUDE_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(OPENCODE_GIT_COMMIT_PLUGIN.is_file())

        hooks_json = CODEX_HOOKS_JSON.read_text()
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/git-commit-hint.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/skill-resolve-preflight.sh", hooks_json)
        self.assertNotIn("__CLAUDE_CONFIG_HOME__/hooks/", hooks_json)

        init_codex = INIT_CODEX.read_text()
        self.assertIn("CODEX_HOOKS_DIR", init_codex)
        self.assertIn("codex/hooks/git-commit-hint.sh", init_codex)

    def test_sync_codex_skills_prefers_local_override_list(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            codex_dir = repo / "codex"
            claude_skills_dir = repo / "claude-skills"
            user_skills_dir = tmp_path / "home" / ".agents" / "skills"

            codex_dir.mkdir(parents=True)
            claude_skills_dir.mkdir(parents=True)
            (claude_skills_dir / "default-only").mkdir()
            (claude_skills_dir / "local-only").mkdir()
            (codex_dir / "skills.list").write_text("default-only\n")
            (codex_dir / "skills.list.local").write_text("local-only\n")
            user_skills_dir.mkdir(parents=True)
            (user_skills_dir / "default-only").symlink_to(
                claude_skills_dir / "default-only"
            )
            external_skill = tmp_path / "external-skill"
            external_skill.mkdir()
            (user_skills_dir / "external-only").symlink_to(external_skill)
            init_prelude = tmp_path / "init_codex_prelude.sh"
            init_prelude.write_text(
                INIT_CODEX.read_text().split("\nensure_codex_installed\n", 1)[0]
            )

            script = f"""
source {shlex.quote(str(init_prelude))}
SRC={shlex.quote(str(repo))}
USER_SKILLS_DIR={shlex.quote(str(user_skills_dir))}
sync_codex_skills
"""
            proc = subprocess.run(
                ["bash", "-c", script],
                text=True,
                capture_output=True,
            )

            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue((user_skills_dir / "local-only").is_symlink())
            self.assertFalse((user_skills_dir / "default-only").exists())
            self.assertTrue((user_skills_dir / "external-only").is_symlink())


if __name__ == "__main__":
    unittest.main()
