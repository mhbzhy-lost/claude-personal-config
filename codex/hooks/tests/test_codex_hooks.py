#!/usr/bin/env python3
import json
import os
import shlex
import subprocess
import tempfile
import unittest
import uuid
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
SHARED_SUBAGENT_DISPATCH_HINT = (
    REPO_ROOT / "shared" / "policies" / "subagent-dispatch-hint.json"
)
SHARED_SUBAGENT_DISPATCH_HOOK = (
    REPO_ROOT / "shared" / "hooks" / "subagent-dispatch-hint.sh"
)
CLAUDE_SKILL_PREFLIGHT_HOOK = REPO_ROOT / "claude" / "hooks" / "skill-resolve-preflight.sh"
OPENCODE_SKILL_PREFLIGHT_PLUGIN = (
    REPO_ROOT / "opencode" / "plugins" / "skill-resolve-preflight.js"
)
OPENCODE_RM_OUTSIDE_WORKSPACE_GUARD_PLUGIN = (
    REPO_ROOT / "opencode" / "plugins" / "rm-outside-workspace-guard.js"
)
OPENCODE_PERMISSION = REPO_ROOT / "opencode" / "opencode-permission.json"
KNOWLEDGE_README = REPO_ROOT / "docs" / "knowledge" / "README.md"
EXTERNAL_REVIEWER = (
    REPO_ROOT / "claude-skills" / "external-llm-review" / "reviewer.py"
)
CODEX_HOOKS_JSON = REPO_ROOT / "codex" / "hooks.json"
INIT_CODEX = REPO_ROOT / "init_codex.sh"
INIT_OPENCODE = REPO_ROOT / "init_opencode.sh"
OPENCODE_SUBAGENT_HINT_PLUGIN = (
     REPO_ROOT / "opencode" / "plugins" / "subagent-hint.js"
)
KNOWLEDGE_GATE = (
    REPO_ROOT / "templates" / "knowledge-gate" / ".agent" / "hooks" / "knowledge-gate.py"
)
INSTALL_KNOWLEDGE_GATE = REPO_ROOT / "scripts" / "install-knowledge-gate.sh"


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


def run_hook_with_env_cwd(
    script: Path,
    payload: dict,
    env: dict[str, str],
    cwd: Path,
) -> str:
    proc = subprocess.run(
        ["bash", str(script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
        env={**os.environ, **env},
        cwd=cwd,
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
    def test_codex_hook_tests_do_not_hardcode_checkout_path(self) -> None:
        test_source = Path(__file__).read_text()

        self.assertNotIn(str(REPO_ROOT), test_source)

    def _setup_repo_with_initial_commit(self, tmp_path: Path) -> Path:
        repo = tmp_path / "repo"
        subprocess.run(
            ["git", "init", "-b", "main", str(repo)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "config", "user.email", "test@example.com"],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "config", "user.name", "Test User"],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        (repo / "README.md").write_text("# test\n")
        subprocess.run(
            ["git", "-C", str(repo), "add", "README.md"],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", str(repo), "commit", "-m", "initial"],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        return repo

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
        self.assertIn("知识文档：若项目内安装了 vendored knowledge gate", reason)
        self.assertIn("未安装或未命中时", reason)
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
        self.assertIn("vendored knowledge gate", reason)
        self.assertIn("未安装或未命中时", reason)
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
        self.assertIn("vendored knowledge gate", reason)
        self.assertIn("未安装或未命中时", reason)
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
        self.assertIn("知识文档：若项目内安装了 vendored knowledge gate", rendered)
        self.assertIn("未安装或未命中时", rendered)
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

    def test_knowledge_gate_noops_when_config_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._setup_repo_with_initial_commit(Path(tmp))
            (repo / "init_codex.sh").write_text("#!/usr/bin/env bash\n")
            subprocess.run(
                ["git", "-C", str(repo), "add", "init_codex.sh"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            proc = subprocess.run(
                ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
                text=True,
                capture_output=True,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("knowledge-gate: no config", proc.stderr)

    def test_knowledge_gate_blocks_invalid_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._setup_repo_with_initial_commit(Path(tmp))
            config = repo / ".agent" / "knowledge-gate.json"
            config.parent.mkdir()
            config.write_text("{not-json")

            proc = subprocess.run(
                ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
                text=True,
                capture_output=True,
            )

        self.assertEqual(proc.returncode, 2)
        self.assertIn("invalid JSON", proc.stderr)

    def test_knowledge_gate_blocks_when_staged_diff_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "not-git"
            repo.mkdir()
            config = repo / ".agent" / "knowledge-gate.json"
            config.parent.mkdir()
            config.write_text(json.dumps({"version": 1, "rules": []}))

            proc = subprocess.run(
                ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
                text=True,
                capture_output=True,
            )

        self.assertEqual(proc.returncode, 2)
        self.assertIn("knowledge-gate: git diff failed", proc.stderr)

    def test_knowledge_gate_blocks_matching_paths_without_knowledge_update(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._setup_repo_with_initial_commit(Path(tmp))
            config = repo / ".agent" / "knowledge-gate.json"
            config.parent.mkdir()
            config.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "rules": [
                            {
                                "id": "agent-runtime",
                                "paths": ["init_*.sh", "shared/policies/**"],
                                "satisfy_by": ["docs/knowledge/**"],
                                "reason": "agent runtime behavior changed",
                            }
                        ],
                    }
                )
            )
            (repo / "init_codex.sh").write_text("#!/usr/bin/env bash\n")
            subprocess.run(
                ["git", "-C", str(repo), "add", ".agent/knowledge-gate.json", "init_codex.sh"],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            proc = subprocess.run(
                ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
                text=True,
                capture_output=True,
            )

        self.assertEqual(proc.returncode, 2)
        self.assertIn("agent-runtime", proc.stdout)
        self.assertIn("init_codex.sh", proc.stdout)
        self.assertIn("docs/knowledge/**", proc.stdout)

    def test_knowledge_gate_allows_when_matching_knowledge_file_is_staged(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = self._setup_repo_with_initial_commit(Path(tmp))
            config = repo / ".agent" / "knowledge-gate.json"
            config.parent.mkdir()
            config.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "rules": [
                            {
                                "id": "agent-runtime",
                                "paths": ["init_*.sh"],
                                "satisfy_by": ["docs/knowledge/**"],
                            }
                        ],
                    }
                )
            )
            (repo / "init_codex.sh").write_text("#!/usr/bin/env bash\n")
            knowledge = repo / "docs" / "knowledge" / "runtime.md"
            knowledge.parent.mkdir(parents=True)
            knowledge.write_text("# Runtime\n")
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(repo),
                    "add",
                    ".agent/knowledge-gate.json",
                    "init_codex.sh",
                    "docs/knowledge/runtime.md",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            proc = subprocess.run(
                ["python3", str(KNOWLEDGE_GATE), "--repo", str(repo)],
                text=True,
                capture_output=True,
            )

        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_install_knowledge_gate_copies_template_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()

            first = subprocess.run(
                ["bash", str(INSTALL_KNOWLEDGE_GATE), str(repo)],
                text=True,
                capture_output=True,
            )
            second = subprocess.run(
                ["bash", str(INSTALL_KNOWLEDGE_GATE), str(repo)],
                text=True,
                capture_output=True,
            )

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertIn("exists, keeping", second.stdout)
            self.assertTrue((repo / ".agent" / "hooks" / "knowledge-gate.py").is_file())
            self.assertTrue((repo / ".agent" / "knowledge-gate.json").is_file())
            self.assertTrue((repo / ".githooks" / "pre-commit").is_file())

    def test_install_knowledge_gate_reports_missing_target_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing"

            proc = subprocess.run(
                ["bash", str(INSTALL_KNOWLEDGE_GATE), str(missing)],
                text=True,
                capture_output=True,
            )

        self.assertEqual(proc.returncode, 2)
        self.assertIn("target directory does not exist", proc.stderr)

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
                self.assertEqual(output, "", tool_name)

    def test_external_review_gate_allows_tracked_dirty_tree_before_push_review(self) -> None:
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
            self.assertEqual(output, "")

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
            self.assertEqual(output, "")

    def test_external_review_gate_uses_tool_workdir_for_bare_git_push(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            root_repo, _root_remote = self._setup_repo_with_pending_push(tmp_path / "root")
            child_repo, _child_remote = self._setup_repo_with_pending_push(tmp_path / "child")
            child_repo_dest = root_repo / "vendor" / "child"
            child_repo_dest.parent.mkdir()
            child_repo.rename(child_repo_dest)

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
                "- workdir target blocked\n"
                "EOF\n"
            )
            fake_uv.chmod(0o755)

            output = run_hook_with_env_cwd(
                SHARED_EXTERNAL_REVIEW_GATE,
                {
                    "tool_name": "functions.exec_command",
                    "tool_input": {
                        "parameters": {
                            "cmd": "git push origin main",
                            "workdir": str(child_repo_dest),
                        }
                    },
                },
                {
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
                cwd=root_repo,
            )
            data = json.loads(output)

            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertTrue(
                (child_repo_dest / ".git" / "review-markers" / "remote.json").is_file(),
                "bare git push with tool workdir must write marker in target repo",
            )
            self.assertFalse(
                (root_repo / ".git" / "review-markers" / "remote.json").exists(),
                "bare git push with tool workdir must not consume root repo marker",
            )

    def test_external_review_gate_uses_current_branch_upstream_not_origin_head(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            remote = tmp_path / "remote.git"
            repo = tmp_path / "repo"

            subprocess.run(
                ["git", "init", "--bare", str(remote)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "init", "-b", "master", str(repo)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "config", "user.email", "test@example.com"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "config", "user.name", "Test User"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            (repo / "tracked.py").write_text("print('master')\n")
            subprocess.run(
                ["git", "-C", str(repo), "add", "tracked.py"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "commit", "-m", "master"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "remote", "add", "origin", str(remote)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "push", "-u", "origin", "master"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "switch", "-c", "main"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            (repo / "tracked.py").write_text(
                "print('master')\n"
                + "".join(f"print('main {idx}')\n" for idx in range(12))
            )
            subprocess.run(
                ["git", "-C", str(repo), "add", "tracked.py"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "commit", "-m", "main"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "push", "-u", "origin", "main"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                ["git", "-C", str(repo), "remote", "set-head", "origin", "master"],
                check=True,
                stdout=subprocess.DEVNULL,
            )

            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")
            (review_dir / "reviewer.py").write_text("raise SystemExit(1)\n")

            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()
            uv_log = tmp_path / "uv-called"
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                f"printf called > {shlex.quote(str(uv_log))}\n"
                "cat <<'EOF'\n"
                "### Important\n"
                "- should not review a clean current upstream\n"
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

            self.assertEqual(output, "")
            self.assertFalse(
                uv_log.exists(),
                "clean current branch upstream must not trigger external review",
            )

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

    def test_external_review_gate_treats_markdown_none_as_no_blocking_issues(self) -> None:
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
                "#### Critical (Must Fix)\n"
                "*无*\n\n"
                "#### Important (Should Fix)\n"
                "*无*\n\n"
                "#### Minor (Nice to Have)\n"
                "- non-blocking polish\n\n"
                "### Assessment\n"
                "Ready to merge? Yes\n"
                "EOF\n"
                "exit 0\n"
            )
            fake_uv.chmod(0o755)

            proc = subprocess.run(
                ["bash", str(SHARED_EXTERNAL_REVIEW_GATE)],
                input=json.dumps(
                    {
                        "tool_name": "Bash",
                        "tool_input": {
                            "command": f"git -C {shlex.quote(str(repo))} push",
                        },
                    }
                ),
                text=True,
                capture_output=True,
                check=True,
                env={
                    **os.environ,
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
            )
            self.assertEqual(proc.stdout, "")
            self.assertIn("[external-review-gate] allow", proc.stderr)

    def test_external_review_gate_blocks_after_recent_failed_test(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")

            session_key = f"push-gate-test-{uuid.uuid4()}"
            failed_test_marker = Path(f"/tmp/.claude-last-test-exit-{session_key}")
            failed_test_marker.write_text("1")
            try:
                output = run_hook_with_env(
                    SHARED_EXTERNAL_REVIEW_GATE,
                    {
                        "tool_name": "Bash",
                        "tool_input": {"command": f"git -C {shlex.quote(str(repo))} push"},
                    },
                    {
                        "CLAUDE_CONFIG_HOME": str(config_home),
                        "CLAUDE_SESSION_KEY": session_key,
                    },
                )
            finally:
                failed_test_marker.unlink(missing_ok=True)

            self.assertNotEqual(output, "")
            data = json.loads(output)
            reason = data["hookSpecificOutput"]["permissionDecisionReason"]
            self.assertEqual(data["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("最近一次测试执行失败", reason)
            self.assertIn("git push", reason)

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
                        "timestamp": "2099-01-01T00:00:00Z",
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
            self.assertEqual(output, "")
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

    def test_init_codex_preserves_unmanaged_hooks_when_rendering(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            hooks_output = tmp_path / "hooks.json"
            init_prelude = tmp_path / "init_codex_prelude.sh"
            init_prelude.write_text(
                INIT_CODEX.read_text().split("\nensure_codex_installed\n", 1)[0]
            )
            hooks_output.write_text(
                json.dumps(
                    {
                        "hooks": {
                            "PreToolUse": [
                                {
                                    "matcher": "Bash",
                                    "hooks": [
                                        {
                                            "type": "command",
                                            "command": "bash \"/third-party/pre.sh\"",
                                            "timeout": 15,
                                        }
                                    ],
                                }
                            ],
                            "PostToolUse": [
                                {
                                    "matcher": "Bash",
                                    "hooks": [
                                        {
                                            "type": "command",
                                            "command": "bash \"/third-party/post.sh\"",
                                        }
                                    ],
                                }
                            ],
                            "SubagentStart": [
                                {
                                    "hooks": [
                                        {
                                            "type": "command",
                                            "command": "bash \"/old/claude-config/shared/hooks/subagent-dispatch-hint.sh\"",
                                        }
                                    ],
                                }
                            ],
                        }
                    }
                )
            )

            script = f"""
source {shlex.quote(str(init_prelude))}
SRC={shlex.quote(str(REPO_ROOT))}
HOOKS_TEMPLATE={shlex.quote(str(CODEX_HOOKS_JSON))}
HOOKS_OUTPUT={shlex.quote(str(hooks_output))}
render_hooks_json
"""
            proc = subprocess.run(
                ["bash", "-c", script],
                text=True,
                capture_output=True,
            )

            self.assertEqual(proc.returncode, 0, proc.stderr)
            rendered = json.loads(hooks_output.read_text())
            rendered_text = json.dumps(rendered, ensure_ascii=False)
            self.assertIn("/third-party/pre.sh", rendered_text)
            self.assertIn("/third-party/post.sh", rendered_text)
            self.assertEqual(
                rendered["hooks"]["PreToolUse"][0]["hooks"][0]["command"],
                "bash \"/third-party/pre.sh\"",
            )
            self.assertNotIn("/old/claude-config/shared/hooks/subagent-dispatch-hint.sh", rendered_text)
            self.assertIn(
                str(REPO_ROOT / "shared" / "hooks" / "subagent-dispatch-hint.sh"),
                rendered_text,
            )

    def test_init_codex_keeps_unmanaged_hooks_that_only_mention_managed_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            hooks_output = tmp_path / "hooks.json"
            init_prelude = tmp_path / "init_codex_prelude.sh"
            init_prelude.write_text(
                INIT_CODEX.read_text().split("\nensure_codex_installed\n", 1)[0]
            )
            unmanaged_command = (
                "bash \"/third-party/pre.sh\" "
                "--note shared/hooks/subagent-dispatch-hint.sh"
            )
            hooks_output.write_text(
                json.dumps(
                    {
                        "hooks": {
                            "SubagentStart": [
                                {
                                    "hooks": [
                                        {
                                            "type": "command",
                                            "command": unmanaged_command,
                                        }
                                    ],
                                }
                            ]
                        }
                    }
                )
            )

            script = f"""
source {shlex.quote(str(init_prelude))}
SRC={shlex.quote(str(REPO_ROOT))}
HOOKS_TEMPLATE={shlex.quote(str(CODEX_HOOKS_JSON))}
HOOKS_OUTPUT={shlex.quote(str(hooks_output))}
render_hooks_json
"""
            proc = subprocess.run(
                ["bash", "-c", script],
                text=True,
                capture_output=True,
            )

            self.assertEqual(proc.returncode, 0, proc.stderr)
            rendered = json.loads(hooks_output.read_text())
            subagent_commands = [
                hook["command"]
                for entry in rendered["hooks"]["SubagentStart"]
                for hook in entry["hooks"]
            ]
            self.assertIn(unmanaged_command, subagent_commands)

    def test_init_codex_does_not_duplicate_managed_hooks_with_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            hooks_output = tmp_path / "hooks.json"
            hooks_template = tmp_path / "hooks-template.json"
            init_prelude = tmp_path / "init_codex_prelude.sh"
            init_prelude.write_text(
                INIT_CODEX.read_text().split("\nensure_codex_installed\n", 1)[0]
            )
            template_data = json.loads(CODEX_HOOKS_JSON.read_text())
            for entry in template_data["hooks"]["SubagentStart"]:
                for hook in entry["hooks"]:
                    hook["command"] = f'{hook["command"]} --strict'
            hooks_template.write_text(json.dumps(template_data))

            script = f"""
source {shlex.quote(str(init_prelude))}
SRC={shlex.quote(str(REPO_ROOT))}
HOOKS_TEMPLATE={shlex.quote(str(hooks_template))}
HOOKS_OUTPUT={shlex.quote(str(hooks_output))}
render_hooks_json
"""
            for _ in range(2):
                proc = subprocess.run(
                    ["bash", "-c", script],
                    text=True,
                    capture_output=True,
                )
                self.assertEqual(proc.returncode, 0, proc.stderr)

            rendered = json.loads(hooks_output.read_text())
            subagent_commands = [
                hook["command"]
                for entry in rendered["hooks"]["SubagentStart"]
                for hook in entry["hooks"]
            ]
            managed_commands = [
                command
                for command in subagent_commands
                if "shared/hooks/subagent-dispatch-hint.sh" in command
            ]
            self.assertEqual(1, len(managed_commands))
            self.assertIn("--strict", managed_commands[0])

    def test_turn_stop_verification_is_not_registered_by_any_host(self) -> None:
        # Stop fires once per assistant turn, which is too frequent for the
        # "large task is done" check. The end-of-task gate lives on git push.
        init_claude = (REPO_ROOT / "init_claude.sh").read_text()
        self.assertNotIn("desired_stop_hooks", init_claude)
        self.assertNotIn("新增 hooks.Stop[command=...stop-verification.sh]", init_claude)

        init_qwen = (REPO_ROOT / "init_qwen.sh").read_text()
        self.assertNotIn('    "Stop": [', init_qwen)
        self.assertNotIn('f"{src}/claude/hooks/stop-verification.sh"', init_qwen)

        codex_hooks = (REPO_ROOT / "codex" / "hooks.json").read_text()
        self.assertNotIn('"Stop"', codex_hooks)
        self.assertNotIn("stop-verification.sh", codex_hooks)

        self.assertFalse(
            (REPO_ROOT / "opencode" / "plugins" / "stop-verification.js").exists()
        )

        push_gate = SHARED_EXTERNAL_REVIEW_GATE.read_text()
        self.assertIn("git push", push_gate)
        self.assertIn("最近一次测试执行失败", push_gate)
        self.assertNotIn("工作区仍有未提交变更", push_gate)

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
        self.assertNotIn("SubagentStart", rendered)
        self.assertNotIn("knowledge-retrieval", rendered)

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
        self.assertEqual(output, "")

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

    def test_claude_skill_preflight_allows_when_any_tag_present(self) -> None:
        payload = {
            "tool_name": "mcp__skill-catalog__resolve",
            "tool_input": {"user_prompt": "x", "tech_stack": ["fastapi"]},
        }
        output = run_hook(CLAUDE_SKILL_PREFLIGHT_HOOK, payload)
        self.assertEqual(output, "")

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

    def test_opencode_rm_outside_workspace_guard_blocks_only_external_rm(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            workspace = tmp_path / "workspace"
            outside = tmp_path / "outside"
            workspace.mkdir()
            outside.mkdir()

            script = f"""
const mod = await import({json.dumps(OPENCODE_RM_OUTSIDE_WORKSPACE_GUARD_PLUGIN.as_uri())});
const plugin = await mod.RmOutsideWorkspaceGuardPlugin();
const before = plugin["tool.execute.before"];
const cwd = {json.dumps(str(workspace))};
const outside = {json.dumps(str(outside))};

await before({{tool: "bash"}}, {{args: {{command: "rm -rf node_modules dist/file.txt", cwd}}}});
await before({{tool: "bash"}}, {{args: {{command: "cd subdir && rm ../local.txt", cwd}}}});
await before({{tool: "bash"}}, {{args: {{command: "echo rm -rf /tmp/not-real", cwd}}}});

let denied = false;
try {{
  await before({{tool: "bash"}}, {{args: {{command: `rm -rf ${{outside}}`, cwd}}}});
}} catch (err) {{
  const message = String(err.message);
  denied =
    message.includes("workspace 外 rm 已被阻断") &&
    message.includes(`rm -rf ${{outside}}`) &&
    message.includes("请用户手动执行");
}}
if (!denied) {{
  console.error("expected outside rm to be denied with manual command guidance");
  process.exit(1);
}}

let dynamicDenied = false;
try {{
  await before({{tool: "bash"}}, {{args: {{command: "TARGET=/tmp/outside rm -rf $TARGET", cwd}}}});
}} catch (err) {{
  dynamicDenied = String(err.message).includes("shell 展开");
}}
if (!dynamicDenied) {{
  console.error("expected dynamic rm target to be denied");
  process.exit(1);
}}

let pipeDenied = false;
try {{
  await before({{tool: "bash"}}, {{args: {{command: `echo a | rm -rf ${{outside}}`, cwd}}}});
}} catch (err) {{
  pipeDenied = String(err.message).includes("shell 展开");
}}
if (!pipeDenied) {{
  console.error("expected piped rm command to be denied");
  process.exit(1);
}}

let absoluteRmDenied = false;
try {{
  await before({{tool: "bash"}}, {{args: {{command: `/bin/rm -rf ${{outside}}`, cwd}}}});
}} catch (err) {{
  absoluteRmDenied = String(err.message).includes("workspace 外 rm 已被阻断");
}}
if (!absoluteRmDenied) {{
  console.error("expected /bin/rm outside workspace to be denied");
  process.exit(1);
}}
"""
            proc = subprocess.run(
                ["node", "--input-type=module", "-e", script],
                text=True,
                capture_output=True,
            )
            self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")

    def test_opencode_dag_dispatch_hint_matches_global_concurrency_rules(self) -> None:
        """验证 CLAUDE.md §并发/§Subagent 包含并发阈值决策和 subagent 优先原则。"""
        claude_global = (REPO_ROOT / "claude" / "CLAUDE.md").read_text()
        for snippet in (
            "subagent 优先",
            "并发 < 3",
            "Dynamic Workflow",
            "串行多步操作也用 subagent",
            "background: true",
            "workflow-usage",
        ):
            self.assertIn(snippet, claude_global)

        # shared policy 精简为后台模式约束（编排决策由 AGENTS.md 管辖）
        policy = json.loads(SHARED_SUBAGENT_DISPATCH_HINT.read_text())
        rendered = "\n".join(policy["template"])
        self.assertIn("后台模式", rendered)
        self.assertIn("background", rendered)
        self.assertNotIn("workflow 脚本编排", rendered)
        self.assertNotIn("skip-workflow-hint", rendered)

        # subagent-hint 插件精简为只检查 background:true
        self.assertTrue(OPENCODE_SUBAGENT_HINT_PLUGIN.is_file())
        script = f"""
const mod = await import({json.dumps(OPENCODE_SUBAGENT_HINT_PLUGIN.as_uri())});
const plugin = await mod.SubagentHintPlugin({{}});
const before = plugin["tool.execute.before"];
try {{
  await before({{tool: "task"}}, {{args: {{description: "并行实现三个模块", prompt: "同时做"}}}});
  console.log("NO_THROW");
}} catch (err) {{
  console.log(err.message);
}}
"""
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            text=True,
            capture_output=True,
            check=True,
        )
        hint = proc.stdout
        self.assertIn("background", hint.lower())
        self.assertNotIn("NO_THROW", hint)

    def test_subagent_dispatch_hint_policy_is_four_host_single_source(self) -> None:
        """验证四端共享 policy 精简为后台模式约束，编排决策已由 AGENTS.md 管辖。"""
        policy = json.loads(SHARED_SUBAGENT_DISPATCH_HINT.read_text())
        rendered = "\n".join(policy["template"])
        self.assertIn("后台模式", rendered)
        self.assertNotIn("workflow 脚本编排", rendered)
        self.assertNotIn("git worktree 隔离", rendered)
        self.assertNotIn("知识检索", rendered)
        self.assertNotIn("skill-catalog", rendered)
        self.assertNotIn("mcp__skill-catalog", rendered)

        # 四端仍引用 subagent-dispatch-hint（Claude/Codex/Qwen hook）
        for text in (
            INIT_CODEX.read_text(),
            (REPO_ROOT / "codex" / "hooks.json").read_text(),
            (REPO_ROOT / "init_claude.sh").read_text(),
            (REPO_ROOT / "init_qwen.sh").read_text(),
        ):
            self.assertIn("subagent-dispatch-hint", text)

        # OpenCode 端由 subagent-hint 插件承载
        self.assertTrue(OPENCODE_SUBAGENT_HINT_PLUGIN.is_file())

        self.assertNotIn("coding-expert-rules-inject", (REPO_ROOT / "init_qwen.sh").read_text())
        self.assertNotIn("coding-expert-rules-inject", (REPO_ROOT / "codex" / "hooks.json").read_text())
        self.assertFalse((REPO_ROOT / "claude" / "hooks" / "coding-expert-rules-inject.sh").exists())

    def test_shared_subagent_dispatch_hook_outputs_policy_as_additional_context(self) -> None:
        policy = json.loads(SHARED_SUBAGENT_DISPATCH_HINT.read_text())
        expected_hint = "\n".join(policy["template"])
        proc = subprocess.run(
            ["bash", str(SHARED_SUBAGENT_DISPATCH_HOOK)],
            input=json.dumps({"hook_event_name": "SubagentStart"}),
            text=True,
            capture_output=True,
            check=True,
        )
        data = json.loads(proc.stdout)
        self.assertEqual(
            data["hookSpecificOutput"]["hookEventName"],
            "SubagentStart",
        )
        self.assertEqual(
            data["hookSpecificOutput"]["additionalContext"],
            expected_hint,
        )

    def test_opencode_permission_is_yolo_and_rm_guard_is_plugin_owned(self) -> None:
        permission = json.loads(OPENCODE_PERMISSION.read_text())["template"]

        self.assertEqual(permission["bash"], {"*": "allow"})
        self.assertEqual(permission["read"], "allow")
        self.assertEqual(permission["external_directory"], "allow")
        self.assertTrue(OPENCODE_RM_OUTSIDE_WORKSPACE_GUARD_PLUGIN.is_file())

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

    def test_sync_codex_skills_excludes_worker_skills_from_agents_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            agents_dir = repo / "agents"
            claude_skills_dir = repo / "claude-skills"
            user_skills_dir = tmp_path / "home" / ".agents" / "skills"

            agents_dir.mkdir(parents=True)
            claude_skills_dir.mkdir(parents=True)
            user_skills_dir.mkdir(parents=True)
            for skill in [
                "systematic-debugging",
                "claude-code-worker",
                "opencode-deepseek-worker",
            ]:
                (claude_skills_dir / skill).mkdir()
            (agents_dir / "skills.list").write_text(
                "systematic-debugging\nclaude-code-worker\nopencode-deepseek-worker\n"
            )
            (user_skills_dir / "claude-code-worker").symlink_to(
                claude_skills_dir / "claude-code-worker"
            )
            (user_skills_dir / "opencode-deepseek-worker").symlink_to(
                claude_skills_dir / "opencode-deepseek-worker"
            )
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
            self.assertTrue((user_skills_dir / "systematic-debugging").is_symlink())
            self.assertFalse((user_skills_dir / "claude-code-worker").exists())
            self.assertFalse((user_skills_dir / "opencode-deepseek-worker").exists())

    def test_superpowers_is_global_instruction_not_native_skill(self) -> None:
        skills = [
            line.strip()
            for line in (REPO_ROOT / "agents" / "skills.list").read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        self.assertNotIn("using-superpowers", skills)
        self.assertFalse(
            (REPO_ROOT / "claude-skills" / "using-superpowers" / "SKILL.md").exists()
        )

        claude_global = (REPO_ROOT / "claude" / "CLAUDE.md").read_text()
        self.assertNotIn("@" + "Superpowers.md", claude_global)

        superpowers_path = REPO_ROOT / "claude" / "Superpowers.md"
        superpowers_text = superpowers_path.read_text()
        self.assertIn("Do not load upstream Superpowers", superpowers_text)
        for linked_skill in [
            "systematic-debugging",
            "test-driven-development",
            "writing-plans",
            "verification-before-completion",
            "receiving-code-review",
        ]:
            self.assertIn(f"`{linked_skill}`", superpowers_text)
        for omitted_skill in [
            "brainstorming",
            "requesting-code-review",
            "subagent-driven-development",
            "dispatching-parallel-agents",
            "finishing-a-development-branch",
        ]:
            self.assertNotIn(omitted_skill, superpowers_text)

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

    def test_sync_opencode_plugins_removes_retired_stop_verification_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo = tmp_path / "repo"
            repo_plugins = repo / "opencode" / "plugins"
            repo_plugins.mkdir(parents=True)
            retired_target = repo_plugins / "stop-verification.js"

            config_dir = tmp_path / "user-config"
            (config_dir / "plugins").mkdir(parents=True)
            retired_link = config_dir / "plugins" / "stop-verification.js"
            retired_link.symlink_to(retired_target)

            proc = self._run_sync_opencode_plugins(repo_root=repo, config_dir=config_dir)

            self.assertEqual(proc.returncode, 0, f"stderr={proc.stderr}\nstdout={proc.stdout}")
            self.assertIn("已移除退役 plugin", proc.stdout)
            self.assertFalse(retired_link.exists())

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
        self.assertNotIn('[mcp_servers."block-catalog"]', init_codex)
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
        self.assertNotIn('mcp["block-catalog"] =', init_opencode)
        # The headless variant must carry --headless in its command list.
        self.assertRegex(
            init_opencode,
            r'desired_pw_headless\s*=\s*\{[^}]*"--headless"',
        )

    def test_block_catalog_code_is_retained_but_mcp_registration_is_disabled(self) -> None:
        self.assertTrue((REPO_ROOT / "mcp" / "block-catalog").is_dir())

        init_claude = (REPO_ROOT / "init_claude.sh").read_text()
        self.assertIn("mcp/block-catalog", init_claude)
        self.assertIn("claude mcp remove block-catalog", init_claude)
        self.assertNotIn("claude mcp add -s user \\\n        -e \"BLOCK_LIBRARY_PATH", init_claude)

        init_codex = INIT_CODEX.read_text()
        self.assertIn("remove_table_prefix(stripped, 'mcp_servers.\"block-catalog\"')", init_codex)
        self.assertNotIn("args = [\"-m\", \"block_catalog.server\"]", init_codex)

        init_qwen = (REPO_ROOT / "init_qwen.sh").read_text()
        self.assertIn("existing_mcp.pop(\"block-catalog\", None)", init_qwen)
        self.assertNotIn('"mcp__block-catalog"', init_qwen)

        init_opencode = (REPO_ROOT / "init_opencode.sh").read_text()
        self.assertIn('mcp.pop("block-catalog", None)', init_opencode)
        self.assertNotIn('"command": [bc_python, "-m", "block_catalog.server"]', init_opencode)

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


    def test_external_review_gate_falls_back_to_api_when_anthropic_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")

            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                "if [[ \"$*\" == *'--backend anthropic'* ]]; then\n"
                "  echo 'anthropic backend failed' >&2\n"
                "  exit 1\n"
                "fi\n"
                "cat <<'EOF'\n"
                "#### Critical (Must Fix)\n"
                "*无*\n\n"
                "#### Important (Should Fix)\n"
                "*无*\n\n"
                "### Assessment\n"
                "Ready to merge? Yes\n"
                "EOF\n"
                "exit 0\n"
            )
            fake_uv.chmod(0o755)

            proc = subprocess.run(
                ["bash", str(SHARED_EXTERNAL_REVIEW_GATE)],
                input=json.dumps(
                    {
                        "tool_name": "Bash",
                        "tool_input": {
                            "command": f"git -C {shlex.quote(str(repo))} push",
                        },
                    }
                ),
                text=True,
                capture_output=True,
                check=True,
                env={
                    **os.environ,
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
            )
            self.assertEqual(proc.stdout, "")
            self.assertIn("anthropic backend failed", proc.stderr)
            self.assertIn("falling back to api", proc.stderr)
            self.assertIn("[external-review-gate] allow", proc.stderr)

    def test_external_review_gate_allows_when_both_backends_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")

            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                "echo 'backend failed' >&2\n"
                "exit 1\n"
            )
            fake_uv.chmod(0o755)

            proc = subprocess.run(
                ["bash", str(SHARED_EXTERNAL_REVIEW_GATE)],
                input=json.dumps(
                    {
                        "tool_name": "Bash",
                        "tool_input": {
                            "command": f"git -C {shlex.quote(str(repo))} push",
                        },
                    }
                ),
                text=True,
                capture_output=True,
                check=True,
                env={
                    **os.environ,
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                },
            )
            self.assertEqual(proc.stdout, "")
            self.assertIn("anthropic backend failed", proc.stderr)
            self.assertIn("falling back to api", proc.stderr)
            self.assertIn("api backend failed", proc.stderr)
            self.assertIn("[external-review-gate] allow", proc.stderr)


    def test_external_review_gate_falls_back_on_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            repo, _remote = self._setup_repo_with_pending_push(tmp_path)
            config_home = tmp_path / "config"
            review_dir = config_home / "claude-skills" / "external-llm-review"
            review_dir.mkdir(parents=True)
            (review_dir / ".env").write_text("OPENAI_API_KEY=test\n")

            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()
            fake_uv = fake_bin / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                "sleep 10\n"
            )
            fake_uv.chmod(0o755)

            proc = subprocess.run(
                ["bash", str(SHARED_EXTERNAL_REVIEW_GATE)],
                input=json.dumps(
                    {
                        "tool_name": "Bash",
                        "tool_input": {
                            "command": f"git -C {shlex.quote(str(repo))} push",
                        },
                    }
                ),
                text=True,
                capture_output=True,
                check=True,
                env={
                    **os.environ,
                    "CLAUDE_CONFIG_HOME": str(config_home),
                    "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
                    "EXTERNAL_REVIEW_TIMEOUT_SECONDS": "1",
                },
                timeout=30,
            )
            self.assertEqual(proc.stdout, "")
            self.assertIn("anthropic backend timed out", proc.stderr)
            self.assertIn("anthropic backend timed out or crashed, falling back to api", proc.stderr)
            self.assertIn("api backend timed out", proc.stderr)
            self.assertIn("[external-review-gate] allow", proc.stderr)


if __name__ == "__main__":
    unittest.main()
