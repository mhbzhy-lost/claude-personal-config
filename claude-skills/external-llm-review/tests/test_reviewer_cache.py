import unittest
import shlex
from argparse import Namespace
from pathlib import Path
from tempfile import TemporaryDirectory

import reviewer


class ReviewerProtocolAndBackendTest(unittest.TestCase):
    def test_exhaustive_protocol_asks_for_broad_single_pass_report(self):
        protocol = reviewer.build_review_protocol(
            review_depth="exhaustive",
            review_round=1,
            max_issues=25,
        )

        self.assertIn("最多报告 25 个问题", protocol)
        self.assertIn("不要只报告 top 3", protocol)
        self.assertIn("逐项检查清单", protocol)
        self.assertIn("已检查但未发现问题", protocol)

    def test_second_round_protocol_limits_scope(self):
        protocol = reviewer.build_review_protocol(
            review_depth="exhaustive",
            review_round=2,
            max_issues=25,
        )

        self.assertIn("第二轮", protocol)
        self.assertIn("只验证上一轮已修复项", protocol)
        self.assertIn("不要扩展到无关历史问题", protocol)

    def test_review_user_prompt_includes_protocol_before_diff(self):
        prompt = reviewer.build_review_user_prompt(
            base_sha="abcdef123",
            head_sha="123456abc",
            diff="+changed",
            truncated=False,
            review_depth="exhaustive",
            review_round=1,
            max_issues=25,
        )

        self.assertLess(prompt.index("## Review Protocol"), prompt.index("## Git Diff"))
        self.assertIn("最多报告 25 个问题", prompt)
        self.assertIn("+changed", prompt)

    def test_parser_rejects_review_round_above_two(self):
        parser = reviewer.build_arg_parser()

        with self.assertRaises(SystemExit):
            parser.parse_args(["base", "head", "--review-round", "3"])

    def test_review_backend_defaults_to_raw_api(self):
        args = Namespace(backend=None)

        self.assertEqual(reviewer.resolve_review_backend(args, env={}), "api")

    def test_review_backend_can_be_enabled_by_arg_or_env(self):
        args = Namespace(backend="claude-code-cli")

        self.assertEqual(reviewer.resolve_review_backend(args, env={}), "claude-code-cli")
        self.assertEqual(
            reviewer.resolve_review_backend(
                Namespace(backend=None),
                env={"EXTERNAL_LLM_REVIEW_BACKEND": "claude-code-cli"},
            ),
            "claude-code-cli",
        )

    def test_review_backend_rejects_unknown_values(self):
        with self.assertRaisesRegex(ValueError, "EXTERNAL_LLM_REVIEW_BACKEND"):
            reviewer.resolve_review_backend(
                Namespace(backend=None),
                env={"EXTERNAL_LLM_REVIEW_BACKEND": "ollama"},
            )

    def test_claude_cli_backend_accepts_only_claude_model_names(self):
        for model in ("claude-sonnet-4-6", "anthropic/claude-opus-4-7", "sonnet", "opus", "haiku"):
            reviewer.validate_claude_cli_model(model)

        for model in ("deepseek-chat", "deepseek-sonnet", "qwen-max", "glm-4-plus", "llama3:70b"):
            with self.subTest(model=model):
                with self.assertRaisesRegex(ValueError, "Claude model"):
                    reviewer.validate_claude_cli_model(model)

    def test_claude_cli_config_requires_anthropic_env(self):
        with self.assertRaisesRegex(ValueError, "ANTHROPIC_BASE_URL"):
            reviewer.resolve_claude_cli_config({})

    def test_claude_cli_config_does_not_fallback_from_external_llm_env(self):
        # Explicit: EXTERNAL_LLM_* must NOT be silently used as Claude CLI config.
        with self.assertRaisesRegex(ValueError, "ANTHROPIC_BASE_URL"):
            reviewer.resolve_claude_cli_config(
                {
                    "EXTERNAL_LLM_API_BASE": "https://gateway.example.test",
                    "EXTERNAL_LLM_API_KEY": "external-key",
                    "EXTERNAL_LLM_MODEL": "claude-sonnet-4-6",
                }
            )

    def test_claude_cli_command_uses_bare_plan_mode_and_no_tools(self):
        command = reviewer.build_claude_cli_command(
            claude_bin="claude",
            model="claude-sonnet-4-6",
            settings_path=Path("/tmp/settings.json"),
        )

        self.assertIn("--bare", command)
        self.assertIn("--no-session-persistence", command)
        self.assertIn("--disable-slash-commands", command)
        self.assertIn("--strict-mcp-config", command)
        self.assertIn("--permission-mode", command)
        self.assertIn("plan", command)
        self.assertIn("--tools", command)
        self.assertEqual(command[command.index("--tools") + 1], "")

    def test_claude_cli_command_uses_valid_empty_mcp_config(self):
        command = reviewer.build_claude_cli_command(
            claude_bin="claude",
            model="claude-sonnet-4-6",
            settings_path=Path("/tmp/settings.json"),
        )

        self.assertEqual(
            command[command.index("--mcp-config") + 1],
            '{"mcpServers":{}}',
        )

    def test_claude_cli_env_isolates_home_xdg_and_selected_endpoint_vars(self):
        config = reviewer.ClaudeCliConfig(
            base_url="https://gateway.example.test",
            api_key="key",
            auth_token="token",
            model="claude-sonnet-4-6",
            claude_bin="claude",
            timeout_seconds=300,
        )

        with TemporaryDirectory() as tmp:
            env = reviewer.build_claude_cli_env(
                base_env={
                    "PATH": "/usr/bin",
                    "HOME": "/Users/example",
                    "CLAUDE_CONFIG_DIR": "/Users/example/.claude",
                    "ANTHROPIC_API_KEY": "production-key",
                },
                runtime_root=Path(tmp),
                config=config,
            )

            self.assertEqual(env["PATH"], "/usr/bin")
            self.assertEqual(env["ANTHROPIC_BASE_URL"], "https://gateway.example.test")
            self.assertEqual(env["ANTHROPIC_API_KEY"], "key")
            self.assertEqual(env["ANTHROPIC_AUTH_TOKEN"], "token")
            self.assertNotEqual(env["HOME"], "/Users/example")
            self.assertTrue(env["HOME"].startswith(tmp))
            self.assertTrue(env["XDG_CONFIG_HOME"].startswith(tmp))
            self.assertTrue(env["CLAUDE_CONFIG_DIR"].startswith(tmp))

    def test_claude_cli_review_invokes_cli_with_stdin_and_isolated_home(self):
        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            capture_path = tmp_path / "home.txt"
            fake_claude = tmp_path / "claude"
            fake_claude.write_text(
                "#!/usr/bin/env bash\n"
                "set -euo pipefail\n"
                "seen_bare=0\n"
                "seen_plan=0\n"
                "seen_empty_tools=0\n"
                "previous=''\n"
                "for arg in \"$@\"; do\n"
                "  if [[ \"${arg}\" == \"--bare\" ]]; then seen_bare=1; fi\n"
                "  if [[ \"${previous}\" == \"--permission-mode\" && \"${arg}\" == \"plan\" ]]; then seen_plan=1; fi\n"
                "  if [[ \"${previous}\" == \"--tools\" && -z \"${arg}\" ]]; then seen_empty_tools=1; fi\n"
                "  previous=\"${arg}\"\n"
                "done\n"
                "[[ ${seen_bare} -eq 1 && ${seen_plan} -eq 1 && ${seen_empty_tools} -eq 1 ]] || exit 17\n"
                "prompt=\"$(cat)\"\n"
                f"printf '%s\\n' \"${{HOME}}\" > {shlex.quote(str(capture_path))}\n"
                "printf 'reviewed:%s\\n' \"${#prompt}\"\n",
                encoding="utf-8",
            )
            fake_claude.chmod(0o700)
            config = reviewer.ClaudeCliConfig(
                base_url="https://gateway.example.test",
                api_key="key",
                auth_token=None,
                model="claude-sonnet-4-6",
                claude_bin=str(fake_claude),
                timeout_seconds=5,
            )

            output = reviewer.run_claude_cli_review(
                prompt="review this diff",
                config=config,
                base_env={"PATH": "/usr/bin:/bin", "HOME": "/Users/example"},
                cwd=tmp_path,
            )

            self.assertEqual(output, "reviewed:16")
            isolated_home = capture_path.read_text(encoding="utf-8").strip()
            self.assertNotEqual(isolated_home, "/Users/example")
            self.assertIn("external-llm-review-claude-", isolated_home)

    def test_default_chat_messages_are_plain_strings(self):
        messages = reviewer.build_chat_messages(
            user_prompt="review this diff",
            spec_block="## Spec\nstable requirements",
        )

        self.assertEqual(messages[0]["role"], "system")
        self.assertIsInstance(messages[0]["content"], str)
        self.assertIn("stable requirements", messages[1]["content"])
        self.assertTrue(messages[1]["content"].endswith("review this diff"))

    def test_plain_user_prompt_includes_stable_context(self):
        user_prompt = reviewer.build_plain_user_prompt(
            user_prompt="review this diff",
            spec_block="## Spec\nstable requirements",
        )

        self.assertIn("stable requirements", user_prompt)
        self.assertTrue(user_prompt.endswith("review this diff"))

    def test_extract_chat_content_rejects_empty_choices(self):
        class Response:
            choices = []

        with self.assertRaisesRegex(RuntimeError, "empty choices"):
            reviewer.extract_chat_content(Response())

    def test_extract_chat_content_rejects_empty_content_with_reasoning_diagnostics(self):
        class UsageDetails:
            reasoning_tokens = 32

        class Usage:
            completion_tokens = 32
            completion_tokens_details = UsageDetails()

        class Message:
            content = ""
            reasoning_content = "thinking..."

        class Choice:
            message = Message()
            finish_reason = "length"

        class Response:
            choices = [Choice()]
            usage = Usage()

        with self.assertRaisesRegex(
            RuntimeError,
            "empty content.*finish_reason=length.*reasoning_tokens=32",
        ):
            reviewer.extract_chat_content(Response())

    def test_arg_parser_defaults_to_reasoning_safe_output_budget(self):
        parser = reviewer.build_arg_parser()
        args = parser.parse_args(["base", "head"])

        self.assertEqual(args.max_output_tokens, 16000)

    def test_read_text_block_rejects_paths_outside_allowed_roots(self):
        with TemporaryDirectory() as root, TemporaryDirectory() as outside:
            secret_path = Path(outside) / "secret.txt"
            secret_path.write_text("secret", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "outside allowed roots"):
                reviewer.read_text_block(
                    str(secret_path),
                    label="Spec",
                    allowed_roots=[Path(root)],
                )

    def test_describe_api_exception_includes_response_body(self):
        class Response:
            status_code = 400
            text = '{"error":"bad request"}'

        class ApiError(Exception):
            response = Response()

        detail = reviewer.describe_api_exception(ApiError("request failed"))

        self.assertIn("status_code=400", detail)
        self.assertIn("bad request", detail)

    def test_describe_api_exception_decodes_and_redacts_response_body(self):
        class Response:
            status_code = 401
            content = b'{"error":"Authorization: Bearer secret-token","api_key":"sk-live"}'

        class ApiError(Exception):
            response = Response()

        detail = reviewer.describe_api_exception(ApiError("request failed"))

        self.assertIn("status_code=401", detail)
        self.assertIn("response_body=", detail)
        self.assertNotIn("secret-token", detail)
        self.assertNotIn("sk-live", detail)
        self.assertIn("[redacted]", detail)


if __name__ == "__main__":
    unittest.main()
