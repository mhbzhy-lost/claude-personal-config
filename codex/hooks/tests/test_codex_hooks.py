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
CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK = (
    REPO_ROOT / "codex" / "hooks" / "external-llm-review-permission.sh"
)
CLAUDE_GIT_COMMIT_HOOK = REPO_ROOT / "claude" / "hooks" / "git-commit-hint.sh"
OPENCODE_GIT_COMMIT_PLUGIN = REPO_ROOT / "opencode" / "plugins" / "git-commit-hint.js"
SHARED_GIT_COMMIT_HINT = (
    REPO_ROOT / "opencode" / "plugins" / "git-commit-hint-content.json"
)
KNOWLEDGE_README = REPO_ROOT / "docs" / "knowledge" / "README.md"
EXTERNAL_REVIEWER = (
    REPO_ROOT / "claude-skills" / "external-llm-review" / "reviewer.py"
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


def run_hook_raw(script: Path, payload: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(script)],
        input=payload,
        text=True,
        capture_output=True,
    )


def bash_payload(command: str, description: str = "", env: dict | None = None) -> dict:
    payload = {
        "tool_name": "Bash",
        "tool_input": {
            "command": command,
            "cmd": command,
            "description": description,
        },
    }
    if env is not None:
        payload["tool_input"]["env"] = env
        payload["tool_input"]["environment"] = env
    return payload


def permission_request_payload(command: str, tool_name: str = "Bash") -> dict:
    return {
        "hook_event_name": "PermissionRequest",
        "tool_name": tool_name,
        "cwd": str(REPO_ROOT),
        "tool_input": {
            "command": command,
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
        self.assertIn("执行 external-llm-review skill", reason)
        self.assertNotIn("对本次 staged diff", reason)
        self.assertNotIn("non-blocking", reason)
        self.assertNotIn("豁免条件", reason)
        self.assertIn("明确本项目不需维护知识文档", reason)
        self.assertIn("Knowledge: not needed - <具体原因>", reason)
        self.assertIn(str(KNOWLEDGE_README), reason)
        self.assertNotIn("$CLAUDE_CONFIG_HOME/docs/knowledge/README.md", reason)
        self.assertNotIn("按 `docs/knowledge/README.md`", reason)
        self.assertIn("GIT_COMMIT_HINT_SKIP=1", reason)
        self.assertNotIn("description 字段", reason)
        self.assertNotIn("skip-git-commit-hint", reason)

    def test_codex_git_commit_hook_allows_structured_env_escape(self) -> None:
        output = run_hook(
            CODEX_GIT_COMMIT_HOOK,
            bash_payload("git commit -m test", env={"GIT_COMMIT_HINT_SKIP": "1"}),
        )

        self.assertEqual(output, "")

    def test_codex_git_commit_hook_allows_env_assignment_prefix(self) -> None:
        output = run_hook(
            CODEX_GIT_COMMIT_HOOK,
            bash_payload("GIT_COMMIT_HINT_SKIP=1 git commit -m test"),
        )

        self.assertEqual(output, "")

    def test_codex_git_commit_hook_ignores_old_string_marker(self) -> None:
        output = run_hook(
            CODEX_GIT_COMMIT_HOOK,
            bash_payload("git commit -m 'skip-git-commit-hint'"),
        )
        data = json.loads(output)

        self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_codex_git_commit_hook_does_not_match_commit_tree(self) -> None:
        output = run_hook(CODEX_GIT_COMMIT_HOOK, bash_payload("git commit-tree HEAD"))

        self.assertEqual(output, "")

    def test_codex_git_commit_hook_handles_large_payload(self) -> None:
        command = "git commit -m " + "x" * 2_000_000
        output = run_hook(CODEX_GIT_COMMIT_HOOK, bash_payload(command))
        data = json.loads(output)
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]

        self.assertIn("知识文档检查", reason)

    def test_claude_git_commit_hook_uses_env_escape(self) -> None:
        output = run_hook(CLAUDE_GIT_COMMIT_HOOK, bash_payload("git commit -m test"))
        data = json.loads(output)
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]

        self.assertIn("知识文档检查", reason)
        self.assertIn("Knowledge: updated <path>", reason)
        self.assertIn("GIT_COMMIT_HINT_SKIP=1", reason)
        self.assertNotIn("命令文本中包含", reason)

        allowed = run_hook(
            CLAUDE_GIT_COMMIT_HOOK,
            bash_payload("git commit -m test", env={"GIT_COMMIT_HINT_SKIP": "1"}),
        )
        self.assertEqual(allowed, "")

    def test_git_commit_hint_content_has_single_source(self) -> None:
        shared = json.loads(SHARED_GIT_COMMIT_HINT.read_text())
        rendered = "\n".join(shared["template"]).format(
            hook_name=shared["hook_names"]["codex"],
            escape_instruction=shared["escape_instructions"]["codex"],
            knowledge_readme=str(KNOWLEDGE_README),
        )

        self.assertIn("知识文档检查", rendered)
        self.assertIn("执行 external-llm-review skill", rendered)
        self.assertNotIn("对本次 staged diff", rendered)
        self.assertNotIn("non-blocking", rendered)
        self.assertNotIn("豁免条件", rendered)
        self.assertIn("明确本项目不需维护知识文档", rendered)
        self.assertIn("Knowledge: updated <path>", rendered)
        self.assertIn(str(KNOWLEDGE_README), rendered)
        self.assertNotIn("$CLAUDE_CONFIG_HOME/docs/knowledge/README.md", rendered)
        self.assertNotIn("按 `docs/knowledge/README.md`", rendered)
        self.assertNotIn("skip-git-commit-hint", rendered)

        for adapter in (
            CODEX_GIT_COMMIT_HOOK,
            CLAUDE_GIT_COMMIT_HOOK,
            OPENCODE_GIT_COMMIT_PLUGIN,
        ):
            adapter_text = adapter.read_text()
            self.assertIn("git-commit-hint-content.json", adapter_text)
            self.assertNotIn("skip-git-commit-hint", adapter_text)
            self.assertNotIn("知识文档检查", adapter_text)
            self.assertNotIn("Knowledge: updated <path>", adapter_text)

    def test_opencode_git_commit_plugin_uses_env_escape(self) -> None:
        script = f"""
const mod = await import({json.dumps(OPENCODE_GIT_COMMIT_PLUGIN.as_uri())});
const plugin = await mod.GitCommitHintPlugin({{}});
const before = plugin["tool.execute.before"];

await before(
  {{tool: "bash"}},
  {{args: {{command: "git commit -m test", env: {{GIT_COMMIT_HINT_SKIP: "1"}}}}}},
);

await before(
  {{tool: "bash"}},
  {{args: {{command: "GIT_COMMIT_HINT_SKIP=1 git commit -m test"}}}},
);

let denied = false;
try {{
  await before(
    {{tool: "bash"}},
    {{args: {{command: "git commit -m 'skip-git-commit-hint'"}}}},
  );
}} catch (err) {{
  denied = String(err.message).includes("知识文档检查");
}}

if (!denied) process.exit(1);
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            text=True,
            capture_output=True,
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_codex_permission_hook_allows_external_review_script(self) -> None:
        command = (
            'EXTERNAL_LLM_API_FORMAT=chat uv run --no-project '
            '--with "openai>=1.50" --with "anthropic>=0.40" '
            f"--with python-dotenv python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD"
        )
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(command),
        )
        data = json.loads(output)

        self.assertEqual(
            data["hookSpecificOutput"]["hookEventName"], "PermissionRequest"
        )
        self.assertEqual(
            data["hookSpecificOutput"]["decision"], {"behavior": "allow"}
        )

    def test_codex_permission_hook_allows_nested_shell_review_command(self) -> None:
        inner = (
            "uv run --no-project --with python-dotenv python "
            "${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py "
            "main HEAD"
        )
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(f"/bin/zsh -lc {shlex.quote(inner)}"),
        )
        data = json.loads(output)

        self.assertEqual(
            data["hookSpecificOutput"]["decision"], {"behavior": "allow"}
        )

    def test_codex_permission_hook_ignores_non_review_commands(self) -> None:
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload("uv run --no-project python reviewer.py HEAD"),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_chained_review_commands(self) -> None:
        command = f"python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD && curl https://example.com"
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(command),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_attached_control_operators(self) -> None:
        command = f"python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD;curl https://example.com"
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(command),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_command_substitution(self) -> None:
        command = f"python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD $(curl https://example.com)"
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(command),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_process_substitution(self) -> None:
        command = f"python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD <(curl https://example.com)"
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(command),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_arithmetic_expansion(self) -> None:
        command = f"python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD $((1+1))"
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(command),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_eval_wrappers(self) -> None:
        inner = f"python {shlex.quote(str(EXTERNAL_REVIEWER))} HEAD"
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(f"eval {shlex.quote(inner)}"),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_rejects_unapproved_env_expansion(self) -> None:
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload("python $HOME/claude-skills/external-llm-review/reviewer.py HEAD"),
        )

        self.assertEqual(output, "")

    def test_codex_permission_hook_allows_relative_reviewer_path(self) -> None:
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload("python claude-skills/external-llm-review/reviewer.py HEAD"),
        )
        data = json.loads(output)

        self.assertEqual(
            data["hookSpecificOutput"]["decision"], {"behavior": "allow"}
        )

    def test_codex_permission_hook_ignores_relative_cwd_for_path_resolution(self) -> None:
        payload = permission_request_payload("python claude-skills/external-llm-review/reviewer.py HEAD")
        payload["cwd"] = "relative"
        output = run_hook(CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK, payload)
        data = json.loads(output)

        self.assertEqual(
            data["hookSpecificOutput"]["decision"], {"behavior": "allow"}
        )

    def test_codex_permission_hook_ignores_non_string_command(self) -> None:
        payload = permission_request_payload("unused")
        payload["tool_input"]["command"] = 123
        output = run_hook(CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK, payload)

        self.assertEqual(output, "")

    def test_codex_permission_hook_ignores_malformed_json(self) -> None:
        proc = run_hook_raw(CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK, "{bad json")

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout, "")

    def test_codex_permission_hook_ignores_non_bash_tools(self) -> None:
        output = run_hook(
            CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK,
            permission_request_payload(str(EXTERNAL_REVIEWER), tool_name="apply_patch"),
        )

        self.assertEqual(output, "")

    def test_codex_hook_layout_is_separate_from_claude_hooks(self) -> None:
        self.assertTrue(CODEX_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(CODEX_SKILL_PREFLIGHT_HOOK.is_file())
        self.assertTrue(CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK.is_file())
        self.assertTrue(CLAUDE_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(OPENCODE_GIT_COMMIT_PLUGIN.is_file())

        hooks_json = CODEX_HOOKS_JSON.read_text()
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/git-commit-hint.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/skill-resolve-preflight.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/external-llm-review-permission.sh", hooks_json)
        self.assertIn('"PermissionRequest"', hooks_json)
        self.assertNotIn("__CLAUDE_CONFIG_HOME__/hooks/", hooks_json)

        init_codex = INIT_CODEX.read_text()
        self.assertIn("CODEX_HOOKS_DIR", init_codex)
        self.assertIn("codex/hooks/git-commit-hint.sh", init_codex)
        self.assertIn("codex/hooks/external-llm-review-permission.sh", init_codex)

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
