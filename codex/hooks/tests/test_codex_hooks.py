#!/usr/bin/env python3
import json
import os
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
CODEX_CODING_GUARD_HOOK = REPO_ROOT / "codex" / "hooks" / "coding-guard.sh"
SHARED_EXTERNAL_REVIEW_GATE = (
    REPO_ROOT / "shared" / "hooks" / "external-review-gate.sh"
)
CLAUDE_GIT_COMMIT_HOOK = REPO_ROOT / "claude" / "hooks" / "git-commit-hint.sh"
OPENCODE_GIT_COMMIT_PLUGIN = REPO_ROOT / "opencode" / "plugins" / "git-commit-hint.js"
SHARED_GIT_COMMIT_HINT = (
    REPO_ROOT / "shared" / "policies" / "git-commit-hint.json"
)
SHARED_SKILL_RESOLVE_PREFLIGHT = (
    REPO_ROOT / "shared" / "policies" / "skill-resolve-preflight.json"
)
CLAUDE_SKILL_PREFLIGHT_HOOK = REPO_ROOT / "claude" / "hooks" / "skill-resolve-preflight.sh"
OPENCODE_SKILL_PREFLIGHT_PLUGIN = (
    REPO_ROOT / "opencode" / "plugins" / "skill-resolve-preflight.js"
)
KNOWLEDGE_README = REPO_ROOT / "docs" / "knowledge" / "README.md"
EXTERNAL_REVIEWER = (
    REPO_ROOT / "claude-skills" / "external-llm-review" / "reviewer.py"
)
CODEX_HOOKS_JSON = REPO_ROOT / "codex" / "hooks.json"
INIT_CODEX = REPO_ROOT / "init_codex.sh"
INIT_OPENCODE = REPO_ROOT / "init_opencode.sh"


def run_hook(script: Path, payload: dict) -> str:
    proc = subprocess.run(
        ["bash", str(script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return proc.stdout


def run_hook_with_env(script: Path, payload: dict, env: dict[str, str]) -> str:
    proc = subprocess.run(
        ["bash", str(script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
        env={**os.environ, **env},
    )
    return proc.stdout


def run_hook_raw(script: Path, payload: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(script)],
        input=payload,
        text=True,
        capture_output=True,
    )


def run_hook_bytes(
    script: Path,
    payload: bytes,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["bash", str(script)],
        input=payload,
        capture_output=True,
        env={**os.environ, **(env or {})},
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


def apply_patch_payload(patch: str, tool_name: str = "functions.apply_patch") -> dict:
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": tool_name,
        "tool_input": {
            "patch": patch,
        },
    }


def assert_no_review_strategy_leaks(testcase: unittest.TestCase, reason: str) -> None:
    for leaked in ("Round", "round", "EXTERNAL_REVIEW_SKIP", "Marker"):
        testcase.assertNotIn(leaked, reason)


class CodexHooksTest(unittest.TestCase):
    def _setup_repo_with_pending_push(self, tmp_path: Path) -> tuple[Path, Path]:
        remote = tmp_path / "remote.git"
        repo = tmp_path / "repo"

        subprocess.run(
            ["git", "init", "--bare", str(remote)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "init", "-b", "main", str(repo)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "config", "user.email", "test@example.com"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "config", "user.name", "Test User"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        (repo / "tracked.py").write_text("print('initial')\n")
        subprocess.run(
            ["git", "-C", str(repo), "add", "tracked.py"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "commit", "-m", "initial"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "remote", "add", "origin", str(remote)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "push", "-u", "origin", "main"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        (repo / "tracked.py").write_text(
            "print('initial')\n"
            + "".join(f"print('next {idx}')\n" for idx in range(12))
        )
        subprocess.run(
            ["git", "-C", str(repo), "add", "tracked.py"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "commit", "-m", "next"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return repo, remote

    def test_codex_git_commit_hook_denies_without_command_marker(self) -> None:
        output = run_hook(CODEX_GIT_COMMIT_HOOK, bash_payload("git commit -m test"))
        data = json.loads(output)
        hook_output = data["hookSpecificOutput"]

        self.assertEqual(hook_output["permissionDecision"], "deny")
        reason = hook_output["permissionDecisionReason"]
        self.assertIn("提交前必须完成", reason)
        self.assertIn("加载 git-commit skill", reason)
        self.assertIn("verification-before-completion skill", reason)
        self.assertIn("知识文档：按", reason)
        self.assertIn("全局指南", reason)
        self.assertIn("新增/更新目标仓 `docs/knowledge/`", reason)
        self.assertIn("先创建或更新并接入项目入口", reason)
        self.assertNotIn("需要则先更新再提交", reason)
        self.assertNotIn("异源复审", reason)
        self.assertNotIn("external review", reason.lower())
        self.assertNotIn("对本次 staged diff", reason)
        self.assertNotIn("non-blocking", reason)
        self.assertNotIn("豁免条件", reason)
        self.assertIn(str(KNOWLEDGE_README), reason)
        self.assertNotIn("$CLAUDE_CONFIG_HOME/docs/knowledge/README.md", reason)
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

        self.assertIn("提交前必须完成", reason)
        self.assertIn("知识文档：按", reason)
        self.assertIn("全局指南", reason)
        self.assertIn("新增/更新目标仓 `docs/knowledge/`", reason)
        self.assertIn("verification-before-completion skill", reason)

    def test_claude_git_commit_hook_uses_env_escape(self) -> None:
        output = run_hook(CLAUDE_GIT_COMMIT_HOOK, bash_payload("git commit -m test"))
        data = json.loads(output)
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]

        self.assertIn("提交前必须完成", reason)
        self.assertIn("加载 git-commit skill", reason)
        self.assertIn("verification-before-completion skill", reason)
        self.assertIn("知识文档：按", reason)
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

        self.assertIn("提交前必须完成", rendered)
        self.assertIn("加载 git-commit skill", rendered)
        self.assertIn("verification-before-completion skill", rendered)
        self.assertIn("知识文档：按", rendered)
        self.assertIn("全局指南", rendered)
        self.assertIn("新增/更新目标仓 `docs/knowledge/`", rendered)
        self.assertIn("先创建或更新并接入项目入口", rendered)
        self.assertNotIn("需要则先更新再提交", rendered)
        self.assertNotIn("异源复审", rendered)
        self.assertNotIn("external review", rendered.lower())
        self.assertNotIn("对本次 staged diff", rendered)
        self.assertNotIn("non-blocking", rendered)
        self.assertNotIn("豁免条件", rendered)
        self.assertIn(str(KNOWLEDGE_README), rendered)
        self.assertNotIn("$CLAUDE_CONFIG_HOME/docs/knowledge/README.md", rendered)
        self.assertNotIn("skip-git-commit-hint", rendered)

        for adapter in (
            CODEX_GIT_COMMIT_HOOK,
            CLAUDE_GIT_COMMIT_HOOK,
            OPENCODE_GIT_COMMIT_PLUGIN,
        ):
            adapter_text = adapter.read_text()
            self.assertIn("shared/policies/git-commit-hint.json", adapter_text)
            self.assertNotIn("skip-git-commit-hint", adapter_text)
            self.assertNotIn("提交前必须完成", adapter_text)
            self.assertNotIn("verification-before-completion skill", adapter_text)
            self.assertNotIn("异源复审", adapter_text)

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
  denied = String(err.message).includes("提交前必须完成");
}}

if (!denied) process.exit(1);
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            text=True,
            capture_output=True,
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_codex_coding_guard_warns_for_apply_patch_code_file(self) -> None:
        patch = """*** Begin Patch
*** Update File: init_codex.sh
@@
-old
+new
*** End Patch
"""
        output = run_hook(
            CODEX_CODING_GUARD_HOOK,
            apply_patch_payload(patch, tool_name="functions.apply_patch"),
        )

        self.assertIn("编辑非测试代码文件前确认", output)
        self.assertIn("TDD", output)
        self.assertIn("docs/bugs/bug-*.md", output)

    def test_codex_coding_guard_accepts_plain_apply_patch_tool_name(self) -> None:
        patch = """*** Begin Patch
*** Delete File: scripts/cleanup.sh
*** End Patch
"""
        output = run_hook(
            CODEX_CODING_GUARD_HOOK,
            apply_patch_payload(patch, tool_name="apply_patch"),
        )

        self.assertIn("编辑非测试代码文件前确认", output)

    def test_codex_coding_guard_accepts_freeform_apply_patch_input(self) -> None:
        patch = """*** Begin Patch
*** Update File: codex/hooks/coding-guard.sh
@@
-old
+new
*** End Patch
"""
        output = run_hook(
            CODEX_CODING_GUARD_HOOK,
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "functions.apply_patch",
                "tool_input": patch,
            },
        )

        self.assertIn("编辑非测试代码文件前确认", output)

    def test_codex_coding_guard_ignores_apply_patch_test_files(self) -> None:
        patch = """*** Begin Patch
*** Update File: codex/hooks/tests/test_codex_hooks.py
@@
-old
+new
*** End Patch
"""
        output = run_hook(
            CODEX_CODING_GUARD_HOOK,
            apply_patch_payload(patch, tool_name="functions.apply_patch"),
        )

        self.assertEqual(output, "")

    def test_codex_coding_guard_ignores_relative_test_dir_helpers(self) -> None:
        patch = """*** Begin Patch
*** Update File: tests/helpers/helper.py
@@
-old
+new
*** End Patch
"""
        output = run_hook(
            CODEX_CODING_GUARD_HOOK,
            apply_patch_payload(patch, tool_name="functions.apply_patch"),
        )

        self.assertEqual(output, "")

    def test_codex_coding_guard_ignores_malformed_stdin_bytes(self) -> None:
        proc = run_hook_bytes(
            CODEX_CODING_GUARD_HOOK,
            b"\xff",
            env={"PYTHONIOENCODING": "utf-8:strict"},
        )

        self.assertEqual(proc.returncode, 0, proc.stderr.decode("utf-8", errors="replace"))
        self.assertEqual(proc.stdout, b"")

    def test_codex_permission_hook_allows_external_review_script(self) -> None:
        command = (
            'uv run --no-project '
            '--with "openai>=1.50" '
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

    def test_external_review_gate_accepts_codex_exec_tool_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            (config_home / "claude-skills" / "external-llm-review").mkdir(
                parents=True
            )

            for tool_name, command_key in (
                ("Bash", "command"),
                ("run_shell_command", "command"),
                ("exec_command", "cmd"),
                ("functions.exec_command", "cmd"),
            ):
                output = run_hook_with_env(
                    SHARED_EXTERNAL_REVIEW_GATE,
                    {
                        "tool_name": tool_name,
                        "tool_input": {
                            command_key: f"git -C {shlex.quote(str(repo))} push",
                        },
                    },
                    {"CLAUDE_CONFIG_HOME": str(config_home)},
                )
                data = json.loads(output)

                self.assertEqual(
                    data["hookSpecificOutput"]["permissionDecision"],
                    "allow",
                    tool_name,
                )

    def test_external_review_gate_blocks_tracked_dirty_tree_before_push(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            (config_home / "claude-skills" / "external-llm-review").mkdir(
                parents=True
            )

            (repo / "tracked.py").write_text(
                "print('initial')\n"
                + "".join(f"print('next {idx}')\n" for idx in range(12))
                + "print('local work')\n"
            )

            output = run_hook_with_env(
                SHARED_EXTERNAL_REVIEW_GATE,
                {
                    "tool_name": "Bash",
                    "tool_input": {"command": f"git -C {shlex.quote(str(repo))} push"},
                },
                {"CLAUDE_CONFIG_HOME": str(config_home)},
            )
            data = json.loads(output)
            reason = data["hookSpecificOutput"]["permissionDecisionReason"]

            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("未提交变更", reason)
            self.assertIn("已运行验证命令", reason)
            assert_no_review_strategy_leaks(self, reason)

    def test_external_review_gate_allows_untracked_only_before_push_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            (config_home / "claude-skills" / "external-llm-review").mkdir(
                parents=True
            )

            (repo / "local-note.txt").write_text("local scratch\n")

            output = run_hook_with_env(
                SHARED_EXTERNAL_REVIEW_GATE,
                {
                    "tool_name": "Bash",
                    "tool_input": {"command": f"git -C {shlex.quote(str(repo))} push"},
                },
                {"CLAUDE_CONFIG_HOME": str(config_home)},
            )
            data = json.loads(output)

            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "allow")

    def test_external_review_gate_denial_hides_review_strategy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")
            (review_dir / "reviewer.py").write_text("raise SystemExit(1)\n")

            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                "cat <<'EOF'\n"
                "### Important\n"
                "- still blocked\n"
                "EOF\n"
            )
            fake_uv.chmod(0o755)

            output = run_hook_with_env(
                SHARED_EXTERNAL_REVIEW_GATE,
                {
                    "tool_name": "Bash",
                    "tool_input": {"command": f"git -C {shlex.quote(str(repo))} push"},
                },
                {
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
            )
            data = json.loads(output)
            reason = data["hookSpecificOutput"]["permissionDecisionReason"]

            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("异源 Review 发现需要修复的问题", reason)
            self.assertIn("### Important", reason)
            assert_no_review_strategy_leaks(self, reason)

            output = run_hook_with_env(
                SHARED_EXTERNAL_REVIEW_GATE,
                {
                    "tool_name": "Bash",
                    "tool_input": {"command": f"git -C {shlex.quote(str(repo))} push"},
                },
                {
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
            )
            data = json.loads(output)
            reason = data["hookSpecificOutput"]["permissionDecisionReason"]

            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("异源 Review 发现的问题尚未修复", reason)
            assert_no_review_strategy_leaks(self, reason)

    def test_external_review_gate_allows_after_round_two_budget_is_used(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")
            (review_dir / "reviewer.py").write_text("raise SystemExit(1)\n")

            marker_dir = repo / ".git" / "review-markers"
            marker_dir.mkdir(parents=True)
            (marker_dir / "remote.json").write_text(
                json.dumps(
                    {
                        "round": 2,
                        "diff_hash": "previous-diff",
                        "has_critical": False,
                        "has_important": True,
                        "has_minor": False,
                        "base_ref": "origin/main",
                        "head_sha": "old",
                        "timestamp": "2026-05-28T00:00:00Z",
                    }
                )
                + "\n"
            )

            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()
            uv_log = tmp_path / "uv-called"
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                f"printf called > {shlex.quote(str(uv_log))}\n"
                "cat <<'EOF'\n"
                "### Important\n"
                "- still blocked\n"
                "EOF\n"
            )
            fake_uv.chmod(0o755)

            output = run_hook_with_env(
                SHARED_EXTERNAL_REVIEW_GATE,
                {
                    "tool_name": "Bash",
                    "tool_input": {"command": f"git -C {shlex.quote(str(repo))} push"},
                },
                {
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
            )
            data = json.loads(output)

            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "allow")
            self.assertFalse(uv_log.exists(), "reviewer must not run after round 2")
            self.assertFalse(
                (marker_dir / "remote.json").exists(),
                "marker must be removed after max review budget allows push",
            )

    def test_codex_hook_layout_is_separate_from_claude_hooks(self) -> None:
        self.assertTrue(CODEX_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(CODEX_SKILL_PREFLIGHT_HOOK.is_file())
        self.assertTrue(CODEX_EXTERNAL_REVIEW_PERMISSION_HOOK.is_file())
        self.assertTrue(CLAUDE_GIT_COMMIT_HOOK.is_file())
        self.assertTrue(OPENCODE_GIT_COMMIT_PLUGIN.is_file())

        hooks_json = CODEX_HOOKS_JSON.read_text()
        self.assertIn('"matcher": "Edit|Write|apply_patch|functions.apply_patch"', hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/git-commit-hint.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/coding-guard.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/skill-resolve-preflight.sh", hooks_json)
        self.assertIn("__CLAUDE_CONFIG_HOME__/codex/hooks/external-llm-review-permission.sh", hooks_json)
        self.assertIn('"PermissionRequest"', hooks_json)
        self.assertNotIn('"Stop"', hooks_json)
        self.assertNotIn("codex/hooks/stop-verification.sh", hooks_json)
        self.assertNotIn("__CLAUDE_CONFIG_HOME__/hooks/", hooks_json)

        init_codex = INIT_CODEX.read_text()
        self.assertIn("CODEX_HOOKS_DIR", init_codex)
        self.assertIn("codex/hooks/git-commit-hint.sh", init_codex)
        self.assertIn("codex/hooks/external-llm-review-permission.sh", init_codex)

    def test_skill_resolve_preflight_policy_is_single_source(self) -> None:
        # SSOT contract: shared policy file holds the deny reason and per-host
        # tool name, all three wrappers must point at it and reproduce the same
        # text instead of carrying their own drifted copies.
        policy = json.loads(SHARED_SKILL_RESOLVE_PREFLIGHT.read_text())
        self.assertEqual(policy["tool_names"]["claude"], "mcp__skill-catalog__resolve")
        self.assertEqual(policy["tool_names"]["codex"], "mcp__skill-catalog__resolve")
        self.assertEqual(policy["tool_names"]["opencode"], "skill-catalog_resolve")
        rendered = "".join(policy["deny_reason_template"])
        self.assertIn("意图识别结果", rendered)
        self.assertIn("tech_stack / language / capability", rendered)
        self.assertIn("knowledge-retrieval", rendered)

        for adapter in (
            CODEX_SKILL_PREFLIGHT_HOOK,
            CLAUDE_SKILL_PREFLIGHT_HOOK,
            OPENCODE_SKILL_PREFLIGHT_PLUGIN,
        ):
            text = adapter.read_text()
            self.assertIn("shared/policies/skill-resolve-preflight.json", text)
            # Drifted hand-written copies of the deny reason must not survive
            # in any wrapper — that is precisely what SSOT prevents.
            self.assertNotIn("纯语言题（如'写一段", text)  # legacy claude/codex form
            self.assertNotIn("请勿调用 mcp__skill-catalog__list_skills", text)
            self.assertNotIn("具体流程见 claude-skills/knowledge-retrieval", text)

    def test_codex_skill_preflight_denies_when_all_tags_missing(self) -> None:
        payload = {
            "tool_name": "mcp__skill-catalog__resolve",
            "tool_input": {"user_prompt": "write a function"},
        }
        output = run_hook(CODEX_SKILL_PREFLIGHT_HOOK, payload)
        data = json.loads(output)
        self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("mcp__skill-catalog__resolve", reason)
        self.assertIn("tech_stack / language / capability", reason)

    def test_codex_skill_preflight_allows_when_any_tag_present(self) -> None:
        payload = {
            "tool_name": "mcp__skill-catalog__resolve",
            "tool_input": {"user_prompt": "x", "language": ["python"]},
        }
        output = run_hook(CODEX_SKILL_PREFLIGHT_HOOK, payload)
        data = json.loads(output)
        self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "allow")

    def test_codex_skill_preflight_ignores_unrelated_tools(self) -> None:
        payload = {"tool_name": "Bash", "tool_input": {"command": "ls"}}
        output = run_hook(CODEX_SKILL_PREFLIGHT_HOOK, payload)
        self.assertEqual(output, "")

    def test_claude_skill_preflight_denies_when_all_tags_missing(self) -> None:
        payload = {
            "tool_name": "mcp__skill-catalog__resolve",
            "tool_input": {"user_prompt": "write a function"},
        }
        output = run_hook(CLAUDE_SKILL_PREFLIGHT_HOOK, payload)
        data = json.loads(output)
        self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
        reason = data["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("mcp__skill-catalog__resolve", reason)

    def test_opencode_skill_preflight_plugin_blocks_and_passes(self) -> None:
        # Drive the OpenCode plugin via node and assert it raises for missing
        # tags, lets a tagged call through, and honours the escape-hatch marker.
        script = f"""
const mod = await import({json.dumps(OPENCODE_SKILL_PREFLIGHT_PLUGIN.as_uri())});
const factory = mod.SkillResolvePreflightPlugin;
const plugin = await factory();
const before = plugin["tool.execute.before"];

let denied = false;
try {{
  await before(
    {{tool: "skill-catalog_resolve"}},
    {{args: {{user_prompt: "write something"}}}},
  );
}} catch (err) {{
  denied = String(err.message).includes("tech_stack / language / capability");
}}
if (!denied) {{
  console.error("expected deny when no tags");
  process.exit(1);
}}

await before(
  {{tool: "skill-catalog_resolve"}},
  {{args: {{language: ["python"]}}}},
);

await before(
  {{tool: "skill-catalog_resolve"}},
  {{args: {{notes: "skip-skill-resolve-preflight please"}}}},
);

// Wrong tool name passes through untouched.
await before(
  {{tool: "bash"}},
  {{args: {{command: "ls"}}}},
);
"""
        env = dict(__import__("os").environ)
        env["CLAUDE_CONFIG_HOME"] = str(REPO_ROOT)
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            text=True,
            capture_output=True,
            env=env,
        )
        self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")

    def test_sync_codex_skills_prefers_local_override_list(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            agents_dir = repo / "agents"
            claude_skills_dir = repo / "claude-skills"
            user_skills_dir = tmp_path / "home" / ".agents" / "skills"

            agents_dir.mkdir(parents=True)
            claude_skills_dir.mkdir(parents=True)
            (claude_skills_dir / "default-only").mkdir()
            (claude_skills_dir / "local-only").mkdir()
            (agents_dir / "skills.list").write_text("default-only\n")
            (agents_dir / "skills.list.local").write_text("local-only\n")
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

    def test_init_codex_uses_uppercase_agents_md_as_global_rules_entry(self) -> None:
        init_codex = INIT_CODEX.read_text()

        self.assertRegex(init_codex, r'(?m)^CODEX_AGENTS_PATH="\$CODEX_HOME/AGENTS\.md"$')
        self.assertNotRegex(init_codex, r'(?m)^CODEX_AGENTS_PATH="\$CODEX_HOME/agents\.md"$')
        self.assertNotIn("LEGACY_CODEX_AGENTS_PATH", init_codex)
        self.assertNotIn("cleanup_legacy_codex_agents", init_codex)


    def _run_sync_opencode_plugins(self, *, repo_root: Path, config_dir: Path) -> subprocess.CompletedProcess[str]:
        # Source init_opencode.sh in library mode (function defs only) and
        # invoke sync_opencode_plugins against a controlled SRC + config dir.
        # The sentinel `OPENCODE_INIT_AS_LIBRARY=1` is what makes this safe to
        # run inside a unit test — it skips the opencode install check, the
        # opencode.json merge, and the ~/.zshrc append.
        script = (
            f"source {shlex.quote(str(INIT_OPENCODE))}\n"
            f"SRC={shlex.quote(str(repo_root))}\n"
            f"OPENCODE_CONFIG_DIR={shlex.quote(str(config_dir))}\n"
            "sync_opencode_plugins\n"
        )
        return subprocess.run(
            ["bash", "-c", script],
            text=True,
            capture_output=True,
            env={**__import__("os").environ, "OPENCODE_INIT_AS_LIBRARY": "1"},
        )

    def test_sync_opencode_plugins_upgrades_identical_cp_copy_to_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "test-plugin.js").write_text("export default 1\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            # Identical cp copy of repo plugin
            (config_dir / "plugins" / "test-plugin.js").write_text("export default 1\n")

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("升级为软链", proc.stdout)

            dst = config_dir / "plugins" / "test-plugin.js"
            self.assertTrue(dst.is_symlink(), f"expected symlink, got {dst}")
            self.assertEqual(dst.resolve(), (repo_plugins / "test-plugin.js").resolve())

    def test_sync_opencode_plugins_keeps_diverged_cp_copy_with_warning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "p.js").write_text("export default 1\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            # Diverged copy — possibly a user local edit; must not be overwritten
            (config_dir / "plugins" / "p.js").write_text("export default 999\n")

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("与仓内不一致", proc.stdout)

            dst = config_dir / "plugins" / "p.js"
            self.assertFalse(dst.is_symlink(), "diverged copy must remain a real file")
            self.assertEqual(dst.read_text(), "export default 999\n")

    def test_sync_opencode_plugins_creates_symlink_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "fresh.js").write_text("export default 'fresh'\n")

            config_dir = tmp_path / "user-config"
            # plugins dir exists but is otherwise empty — keep it a real dir
            # so we exercise per-file symlink mode rather than whole-dir.
            (config_dir / "plugins").mkdir(parents=True)
            (config_dir / "plugins" / ".keep").write_text("")

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("首次同步", proc.stdout)

            dst = config_dir / "plugins" / "fresh.js"
            self.assertTrue(dst.is_symlink())

    def test_sync_opencode_plugins_preserves_user_managed_plugins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "managed.js").write_text("export default 'managed'\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            # User-managed plugin that does NOT exist in the repo — must be
            # left alone; per-file symlink mode iterates over repo files only.
            (config_dir / "plugins" / "user-only.ts").write_text("// my plugin\n")

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, proc.stderr)

            user_file = config_dir / "plugins" / "user-only.ts"
            self.assertTrue(user_file.is_file())
            self.assertFalse(user_file.is_symlink())
            self.assertEqual(user_file.read_text(), "// my plugin\n")
            # The repo plugin should be a symlink now
            self.assertTrue((config_dir / "plugins" / "managed.js").is_symlink())

    def test_sync_opencode_plugins_warns_instead_of_crashing_on_directory_conflict(self) -> None:
        # Defence: if user environment has a directory with the same name as a
        # repo plugin, ln -s would fail and `set -e` would abort the whole
        # init. Verify we warn and continue past it.
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "p.js").write_text("export default 1\n")
            (repo_plugins / "later.js").write_text("export default 2\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            # Hostile: same name as a repo plugin, but it's a directory.
            (config_dir / "plugins" / "p.js").mkdir()

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")
            self.assertIn("是目录", proc.stdout)
            # Directory must not be removed.
            self.assertTrue((config_dir / "plugins" / "p.js").is_dir())
            # AND the rest of the loop must continue — later.js should still
            # be linked despite the directory conflict on p.js.
            self.assertTrue((config_dir / "plugins" / "later.js").is_symlink())

    def test_sync_opencode_plugins_warns_about_dangling_repo_symlinks(self) -> None:
        # Scenario: repo previously shipped deprecated.js, user environment
        # symlinked to it. Repo deletes deprecated.js. The dangling symlink
        # in user dst should produce a warning so user knows to clean up.
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "current.js").write_text("export default 1\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            # Pre-existing dangling symlink that points at a (now-deleted)
            # repo plugin path.
            (config_dir / "plugins" / "deprecated.js").symlink_to(
                repo_plugins / "deprecated.js"
            )

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")
            self.assertIn("deprecated.js", proc.stdout)
            self.assertIn("已不存在", proc.stdout)
            # Conservative: do NOT auto-rm; user must clean up.
            self.assertTrue((config_dir / "plugins" / "deprecated.js").is_symlink())

    def test_sync_opencode_plugins_skips_repo_subdirectories(self) -> None:
        # Defence: if the repo ever ships a sub-directory inside plugins/,
        # the per-file mode currently can't handle it; we should warn instead
        # of silently dropping it.
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "flat.js").write_text("export default 1\n")
            (repo_plugins / "subplugin").mkdir()
            (repo_plugins / "subplugin" / "index.js").write_text("// nested\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("跳过仓内子目录 subplugin", proc.stdout)
            # Flat plugin still linked, sub-directory not.
            self.assertTrue((config_dir / "plugins" / "flat.js").is_symlink())
            self.assertFalse((config_dir / "plugins" / "subplugin").exists())

    def test_init_scripts_register_playwright_mcp_headed_and_headless_pair(self) -> None:
        # All three host init scripts must register both server names so the
        # agent can freely pick headed (debug) vs headless (automation).
        # We assert on the source text rather than running the scripts so the
        # test stays hermetic and doesn't depend on `claude` CLI being
        # installed in CI.
        init_claude = (REPO_ROOT / "init_claude.sh").read_text()
        self.assertIn("playwright-mcp npx -y @playwright/mcp", init_claude)
        self.assertIn(
            "playwright-mcp-headless npx -y @playwright/mcp --headless",
            init_claude,
        )

        init_codex = INIT_CODEX.read_text()
        self.assertIn('[mcp_servers."playwright-mcp"]', init_codex)
        self.assertIn('[mcp_servers."playwright-mcp-headless"]', init_codex)
        # Confirm headless arg propagates into the managed block, not lost
        # in a comment.
        self.assertRegex(
            init_codex,
            r'\[mcp_servers\."playwright-mcp-headless"\][^\[]*'
            r'args\s*=\s*\["-y",\s*"@playwright/mcp",\s*"--headless"\]',
        )

        init_opencode = (REPO_ROOT / "init_opencode.sh").read_text()
        self.assertIn('mcp["playwright-mcp"]', init_opencode)
        self.assertIn('mcp["playwright-mcp-headless"]', init_opencode)
        # The headless variant must carry --headless in its command list.
        self.assertRegex(
            init_opencode,
            r'desired_pw_headless\s*=\s*\{[^}]*"--headless"',
        )

    def test_init_claude_configures_codex_plugin_marketplace_and_install_list(self) -> None:
        # Keep this hermetic: source-level assertions catch config drift without
        # mutating the user's real ~/.claude plugin registry during tests.
        init_claude = (REPO_ROOT / "init_claude.sh").read_text()
        plugins_list = (REPO_ROOT / "claude" / "plugins.list").read_text()

        self.assertIn("openai/codex-plugin-cc", init_claude)
        self.assertIn("openai-codex", init_claude)
        self.assertIn('claude plugins install "$key"', init_claude)
        self.assertIn("codex:openai-codex", plugins_list)

    def test_sync_opencode_plugins_idempotent_when_already_symlinked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            (repo_plugins / "p.js").write_text("export default 1\n")

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            # Pre-existing correct symlink
            (config_dir / "plugins" / "p.js").symlink_to(repo_plugins / "p.js")
            # Add a sibling user file so per-file mode kicks in (plugins dir
            # is a real dir, not a whole-dir symlink).
            (config_dir / "plugins" / "user.js").write_text("// user\n")

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            # Should not log an upgrade or first-sync message for p.js
            self.assertNotIn("p.js 升级", proc.stdout)
            self.assertNotIn("p.js → 软链", proc.stdout)
            # Symlink still in place, target unchanged
            dst = config_dir / "plugins" / "p.js"
            self.assertTrue(dst.is_symlink())
            self.assertEqual(dst.resolve(), (repo_plugins / "p.js").resolve())

    def test_init_opencode_required_submodules_updates_missing_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo.mkdir()
            (repo / ".gitmodules").write_text(
                "\n".join(
                    [
                        '[submodule "vendor/superpowers"]',
                        "\tpath = vendor/superpowers",
                        "\turl = git@example.test:superpowers.git",
                        '[submodule "vendor/opencode-cache-proxy"]',
                        "\tpath = vendor/opencode-cache-proxy",
                        "\turl = git@example.test:opencode-cache-proxy.git",
                        "",
                    ]
                )
            )
            git_log = tmp_path / "git.log"
            fake_git = tmp_path / "git"
            fake_git.write_text(
                "\n".join(
                    [
                        "#!/usr/bin/env bash",
                        "set -euo pipefail",
                        f'echo "$*" >> {shlex.quote(str(git_log))}',
                        'if [ "$1" = "config" ]; then',
                        '  echo "submodule.vendor/superpowers.path vendor/superpowers"',
                        '  echo "submodule.vendor/opencode-cache-proxy.path vendor/opencode-cache-proxy"',
                        "  exit 0",
                        "fi",
                        'if [ "$1" = "-C" ] && [ "$3" = "submodule" ]; then',
                        '  repo="$2"',
                        '  requested=""',
                        '  for arg in "$@"; do requested="$arg"; done',
                        '  case "$requested" in',
                        '    vendor/opencode-cache-proxy)',
                        '      mkdir -p "$repo/vendor/opencode-cache-proxy/proxy/bin"',
                        '      touch "$repo/vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs"',
                        "      ;;",
                        '    vendor/superpowers)',
                        '      mkdir -p "$repo/vendor/superpowers/skills"',
                        "      ;;",
                        "  esac",
                        "  exit 0",
                        "fi",
                        "exit 2",
                        "",
                    ]
                )
            )
            fake_git.chmod(0o755)

            script = (
                f"source {shlex.quote(str(INIT_OPENCODE))}\n"
                f"SRC={shlex.quote(str(repo))}\n"
                f"GIT_CMD={shlex.quote(str(fake_git))}\n"
                "ensure_opencode_required_submodules\n"
            )
            proc = subprocess.run(
                ["bash", "-c", script],
                text=True,
                capture_output=True,
                env={**__import__("os").environ, "OPENCODE_INIT_AS_LIBRARY": "1"},
            )

            self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")
            self.assertIn("vendor/opencode-cache-proxy", proc.stdout)
            self.assertIn("vendor/superpowers", proc.stdout)
            log = git_log.read_text()
            self.assertIn("submodule update --init --recursive -- vendor/opencode-cache-proxy", log)
            self.assertIn("submodule update --init --recursive -- vendor/superpowers", log)

    def test_init_opencode_checks_submodules_before_installing_opencode(self) -> None:
        init_opencode = INIT_OPENCODE.read_text()
        main_flow = init_opencode.split("# === Main flow", 1)[1]
        self.assertLess(
            main_flow.index("ensure_opencode_required_submodules"),
            main_flow.index("ensure_opencode_installed"),
        )

    def test_init_opencode_uses_local_binary_outside_path_before_installing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            local_bin = tmp_path / "local-opencode" / "opencode"
            local_bin.parent.mkdir(parents=True)
            local_bin.write_text("#!/usr/bin/env bash\necho opencode-local\n")
            local_bin.chmod(0o755)

            fake_path = tmp_path / "fake-path"
            fake_path.mkdir()
            curl_log = tmp_path / "curl.log"
            fake_curl = fake_path / "curl"
            fake_curl.write_text(
                "#!/usr/bin/env bash\n"
                f'echo called >> {shlex.quote(str(curl_log))}\n'
                "exit 88\n"
            )
            fake_curl.chmod(0o755)

            script = (
                f"source {shlex.quote(str(INIT_OPENCODE))}\n"
                f"OPENCODE_BIN={shlex.quote(str(local_bin))}\n"
                "ensure_opencode_installed\n"
                'printf "resolved=%s\\n" "$(command -v opencode)"\n'
                "opencode --version\n"
            )
            proc = subprocess.run(
                ["bash", "-c", script],
                text=True,
                capture_output=True,
                env={
                    **__import__("os").environ,
                    "OPENCODE_INIT_AS_LIBRARY": "1",
                    "PATH": f"{fake_path}:/usr/bin:/bin",
                },
            )

            self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")
            self.assertIn(f"resolved={local_bin}", proc.stdout)
            self.assertIn("opencode-local", proc.stdout)
            self.assertFalse(curl_log.exists(), "curl installer must not run when OPENCODE_BIN is executable")


if __name__ == "__main__":
    unittest.main()
