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

    def test_review_backend_defaults_to_api(self):
        args = Namespace(backend=None)

        self.assertEqual(reviewer.resolve_review_backend(args, env={}), "api")

    def test_review_backend_accepts_api_and_anthropic(self):
        args = Namespace(backend="api")
        self.assertEqual(reviewer.resolve_review_backend(args, env={}), "api")

        args = Namespace(backend="anthropic")
        self.assertEqual(reviewer.resolve_review_backend(args, env={}), "anthropic")

    def test_review_backend_rejects_claude_code_cli(self):
        with self.assertRaisesRegex(ValueError, "EXTERNAL_LLM_REVIEW_BACKEND"):
            reviewer.resolve_review_backend(
                Namespace(backend=None),
                env={"EXTERNAL_LLM_REVIEW_BACKEND": "claude-code-cli"},
            )

    def test_review_backend_rejects_unknown_values(self):
        with self.assertRaisesRegex(ValueError, "EXTERNAL_LLM_REVIEW_BACKEND"):
            reviewer.resolve_review_backend(
                Namespace(backend=None),
                env={"EXTERNAL_LLM_REVIEW_BACKEND": "ollama"},
            )

    def test_anthropic_config_requires_base_url(self):
        with self.assertRaisesRegex(ValueError, "ANTHROPIC_BASE_URL"):
            reviewer.resolve_anthropic_config({})

    def test_anthropic_config_requires_api_key(self):
        with self.assertRaisesRegex(ValueError, "ANTHROPIC_API_KEY"):
            reviewer.resolve_anthropic_config({
                "ANTHROPIC_BASE_URL": "https://idealab.alibaba-inc.com/anthropic",
            })

    def test_anthropic_config_falls_back_to_auth_token(self):
        config = reviewer.resolve_anthropic_config({
            "ANTHROPIC_BASE_URL": "https://idealab.alibaba-inc.com/anthropic",
            "ANTHROPIC_AUTH_TOKEN": "idealab-token",
            "ANTHROPIC_MODEL": "claude-opus-4-7",
        })

        self.assertEqual(config.api_key, "idealab-token")
        self.assertEqual(config.model, "claude-opus-4-7")

    def test_anthropic_config_requires_model(self):
        with self.assertRaisesRegex(ValueError, "ANTHROPIC_MODEL"):
            reviewer.resolve_anthropic_config({
                "ANTHROPIC_BASE_URL": "https://idealab.alibaba-inc.com/anthropic",
                "ANTHROPIC_API_KEY": "sk-ant-test",
            })

    def test_anthropic_config_parses_all_fields(self):
        config = reviewer.resolve_anthropic_config({
            "ANTHROPIC_BASE_URL": "https://idealab.alibaba-inc.com/anthropic",
            "ANTHROPIC_API_KEY": "sk-ant-test",
            "ANTHROPIC_MODEL": "claude-opus-4-7",
        })

        self.assertEqual(config.base_url, "https://idealab.alibaba-inc.com/anthropic")
        self.assertEqual(config.api_key, "sk-ant-test")
        self.assertEqual(config.model, "claude-opus-4-7")

    def test_anthropic_user_agent_is_deceptive(self):
        self.assertEqual(
            reviewer.ANTHROPIC_USER_AGENT,
            "claude-cli/2.1.156 (external, sdk-cli)",
        )

    def test_build_anthropic_messages_payload_includes_system_and_user(self):
        payload = reviewer.build_anthropic_messages_payload(
            system_prompt="system content",
            user_prompt="user content",
            model="claude-opus-4-7",
            max_tokens=16000,
        )

        self.assertEqual(payload["model"], "claude-opus-4-7")
        self.assertEqual(payload["messages"][0]["role"], "user")
        self.assertEqual(payload["messages"][0]["content"], "user content")
        self.assertEqual(payload["system"], "system content")
        self.assertEqual(payload["max_tokens"], 16000)

    def test_build_anthropic_messages_payload_omits_max_tokens_when_zero(self):
        payload = reviewer.build_anthropic_messages_payload(
            system_prompt="system",
            user_prompt="user",
            model="claude-opus-4-7",
            max_tokens=0,
        )

        self.assertNotIn("max_tokens", payload)

    def test_extract_anthropic_text_extracts_first_text_block(self):
        class Response:
            content = [
                {"type": "text", "text": "review output"},
            ]

        self.assertEqual(
            reviewer.extract_anthropic_text(Response()),
            "review output",
        )

    def test_extract_anthropic_text_rejects_empty_content(self):
        class Response:
            content = []

        with self.assertRaisesRegex(RuntimeError, "empty content"):
            reviewer.extract_anthropic_text(Response())

    def test_extract_anthropic_text_rejects_no_text_block(self):
        class Response:
            content = [{"type": "tool_use", "id": "1"}]

        with self.assertRaisesRegex(RuntimeError, "no text block"):
            reviewer.extract_anthropic_text(Response())

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

    def test_extract_openai_content_rejects_empty_choices(self):
        class Response:
            choices = []

        with self.assertRaisesRegex(RuntimeError, "empty choices"):
            reviewer.extract_openai_content(Response())

    def test_extract_openai_content_rejects_empty_content_with_reasoning_diagnostics(self):
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
            reviewer.extract_openai_content(Response())

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

    def test_run_review_rejects_legacy_api_format_env(self):
        import asyncio
        from io import StringIO
        from unittest.mock import patch

        args = reviewer.build_arg_parser().parse_args(["base", "head"])
        skill_dir = Path(__file__).resolve().parent.parent
        with patch.dict(
            "os.environ",
            {"EXTERNAL_LLM_API_FORMAT": "anthropic"},
            clear=True,
        ), patch("sys.stderr", new_callable=StringIO) as stderr:
            exit_code = asyncio.run(
                reviewer.run_review(args=args, skill_dir=skill_dir)
            )

        self.assertEqual(exit_code, 1)
        self.assertIn("EXTERNAL_LLM_API_FORMAT", stderr.getvalue())
        self.assertIn("no longer read", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
