import unittest
import shlex
import asyncio
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

    def test_extract_openai_content_falls_back_to_reasoning_content(self):
        class Message:
            content = ""
            reasoning_content = "thinking result..."

        class Choice:
            message = Message()
            finish_reason = "length"

        class Response:
            choices = [Choice()]

        result = reviewer.extract_openai_content(Response())
        self.assertEqual(result, "thinking result...")

    def test_extract_openai_content_rejects_empty_content_and_no_reasoning(self):
        class UsageDetails:
            reasoning_tokens = 32

        class Usage:
            completion_tokens = 32
            completion_tokens_details = UsageDetails()

        class Message:
            content = ""
            reasoning_content = ""

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

    def test_extract_openai_stream_content_concatenates_content_chunks(self):
        chunks = [
            {"choices": [{"delta": {"role": "assistant"}, "index": 0}]},
            {"choices": [{"delta": {"reasoning_content": "thinking "}, "index": 0}]},
            {"choices": [{"delta": {"reasoning_content": "done"}, "index": 0}]},
            {"choices": [{"delta": {"content": "Hello "}, "index": 0}]},
            {"choices": [{"delta": {"content": "world."}, "index": 0}]},
            {
                "choices": [{"delta": {}, "finish_reason": "stop", "index": 0}],
                "usage": {"completion_tokens": 5},
            },
        ]

        async def run():
            return await reviewer.extract_openai_stream_content(iter(chunks))

        result = asyncio.run(run())

        self.assertEqual(result["content"], "Hello world.")
        self.assertEqual(result["reasoning_content"], "thinking done")
        self.assertEqual(result["finish_reason"], "stop")
        self.assertEqual(result["usage"]["completion_tokens"], 5)

    def test_extract_openai_stream_content_falls_back_to_reasoning_when_content_empty(self):
        chunks = [
            {"choices": [{"delta": {"reasoning_content": "actual answer"}, "finish_reason": "stop", "index": 0}]},
        ]

        async def run():
            return await reviewer.extract_openai_stream_content(iter(chunks))

        result = asyncio.run(run())

        self.assertEqual(result["content"], "")
        self.assertEqual(result["reasoning_content"], "actual answer")

    def test_extract_openai_stream_content_raises_on_empty_chunks(self):
        async def run():
            return await reviewer.extract_openai_stream_content(iter([]))

        with self.assertRaises(RuntimeError):
            asyncio.run(run())

    def test_parse_sse_lines_yields_data_objects_and_skips_done(self):
        lines = [
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}",
            "",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}",
            "",
            "data: [DONE]",
            "",
        ]

        async def run():
            return [chunk async for chunk in reviewer.parse_sse_lines(iter(lines))]

        result = asyncio.run(run())

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["choices"][0]["delta"]["content"], "Hello")
        self.assertEqual(result[1]["choices"][0]["delta"]["content"], " world")

    def test_parse_sse_lines_ignores_non_data_prefixes(self):
        lines = [
            ":comment line",
            "event: message",
            "id: 1",
            "data: {\"ok\":true}",
            "",
        ]

        async def run():
            return [chunk async for chunk in reviewer.parse_sse_lines(iter(lines))]

        result = asyncio.run(run())

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0], {"ok": True})

    def test_parse_sse_lines_concatenates_multiline_data_in_single_event(self):
        lines = [
            "data: {\"choices\":",
            "data: [{\"delta\":{\"content\":\"hi\"}}]}",
            "",
            "data: [DONE]",
        ]

        async def run():
            return [c async for c in reviewer.parse_sse_lines(iter(lines))]

        result = asyncio.run(run())

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["choices"][0]["delta"]["content"], "hi")

    def test_parse_sse_lines_skips_malformed_json_and_continues(self):
        lines = [
            "data: {\"ok\":true}",
            "",
            "data: {not valid json",
            "",
            "data: {\"after\":\"good\"}",
            "",
            "data: [DONE]",
        ]

        async def run():
            return [c async for c in reviewer.parse_sse_lines(iter(lines))]

        result = asyncio.run(run())

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], {"ok": True})
        self.assertEqual(result[1], {"after": "good"})

    def test_extract_openai_stream_content_processes_chunks_incrementally(self):
        seen = []

        async def gen():
            for i in range(3):
                seen.append(i)
                yield {"choices": [{"delta": {"content": f"x{i}"}, "index": 0}]}
            yield {"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}

        async def run():
            return await reviewer.extract_openai_stream_content(gen())

        result = asyncio.run(run())

        self.assertEqual(result["content"], "x0x1x2")
        self.assertEqual(result["finish_reason"], "stop")

    def test_extract_openai_stream_content_tolerates_malformed_chunk(self):
        chunks = [
            {"choices": [{"delta": {"content": "good"}, "index": 0}]},
            "not a dict at all",
            {"choices": []},
            {"choices": [{"delta": {"content": " also good"}, "finish_reason": "stop", "index": 0}]},
        ]

        async def run():
            return await reviewer.extract_openai_stream_content(iter(chunks))

        result = asyncio.run(run())

        self.assertEqual(result["content"], "good also good")
        self.assertEqual(result["finish_reason"], "stop")

    def test_arg_parser_defaults_to_reasoning_safe_output_budget(self):
        parser = reviewer.build_arg_parser()
        args = parser.parse_args(["base", "head"])

        self.assertEqual(args.max_output_tokens, 32768)

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


class BailianProviderTest(unittest.TestCase):
    def test_payload_includes_streaming_and_thinking_defaults(self):
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="https://example.test",
            api_key="sk-test",
            model="test-model",
            max_tokens=100,
        )
        payload = provider.build_payload(
            messages=[{"role": "user", "content": "hi"}],
            spec={"temperature": 0.2},
        )
        self.assertEqual(payload["model"], "test-model")
        self.assertTrue(payload["stream"])
        self.assertEqual(payload["stream_options"], {"include_usage": True})
        self.assertFalse(payload["enable_thinking"])
        self.assertEqual(payload["max_tokens"], 100)
        self.assertNotIn("thinking_budget", payload)

    def test_payload_includes_thinking_budget_when_set(self):
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="https://example.test",
            api_key="sk-test",
            model="test-model",
            enable_thinking=True,
            thinking_budget=4096,
        )
        payload = provider.build_payload(
            messages=[{"role": "user", "content": "hi"}],
            spec={},
        )
        self.assertEqual(payload["thinking_budget"], 4096)
        self.assertTrue(payload["enable_thinking"])

    def test_stream_response_returns_content(self):
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="x", api_key="k", model="m"
        )

        async def gen():
            yield {"choices": [{"delta": {"content": "Hello "}, "index": 0}]}
            yield {"choices": [{"delta": {"content": "world"}, "index": 0}]}
            yield {"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}

        async def run():
            return await provider.extract_stream_content(gen())

        result = asyncio.run(run())
        self.assertEqual(result, "Hello world")

    def test_stream_response_falls_back_to_reasoning_content(self):
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="x", api_key="k", model="m"
        )

        async def gen():
            yield {"choices": [{"delta": {"reasoning_content": "thinking..."}}]}
            yield {"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}

        async def run():
            return await provider.extract_stream_content(gen())

        result = asyncio.run(run())
        self.assertEqual(result, "thinking...")

    def test_stream_response_raises_on_empty_content(self):
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="x", api_key="k", model="m"
        )

        async def gen():
            yield {"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}

        async def run():
            return await provider.extract_stream_content(gen())

        with self.assertRaisesRegex(RuntimeError, "empty content"):
            asyncio.run(run())

    def test_stream_response_tolerates_non_dict_chunks(self):
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="x", api_key="k", model="m"
        )

        async def gen():
            yield {"choices": [{"delta": {"content": "good"}, "index": 0}]}
            yield "not a dict"
            yield {"choices": [{"delta": {"content": " also"}, "finish_reason": "stop", "index": 0}]}

        async def run():
            return await provider.extract_stream_content(gen())

        result = asyncio.run(run())
        self.assertEqual(result, "good also")


class IdealabAnthropicProviderTest(unittest.TestCase):
    def test_payload_includes_system_and_messages(self):
        from _provider import IdealabAnthropicProvider
        provider = IdealabAnthropicProvider(
            base_url="https://anthropic.example.test",
            api_key="sk-ant-test",
            model="claude-opus-4-6",
            max_tokens=16000,
        )
        messages = [
            {"role": "system", "content": "You are a critic."},
            {"role": "user", "content": "Review this code."},
        ]
        payload = provider.build_payload(messages=messages, spec={"temperature": 0.3})

        self.assertEqual(payload["model"], "claude-opus-4-6")
        self.assertEqual(payload["max_tokens"], 16000)
        self.assertEqual(payload["temperature"], 0.3)
        self.assertEqual(payload["system"], "You are a critic.")
        self.assertEqual(len(payload["messages"]), 1)
        self.assertEqual(payload["messages"][0]["role"], "user")

    def test_extract_content_returns_text_block(self):
        from _provider import IdealabAnthropicProvider
        provider = IdealabAnthropicProvider(
            base_url="https://x", api_key="k", model="m"
        )
        response = {
            "content": [
                {"type": "text", "text": "review result"},
            ]
        }
        self.assertEqual(provider.extract_content(response), "review result")

    def test_extract_content_raises_on_empty(self):
        from _provider import IdealabAnthropicProvider
        provider = IdealabAnthropicProvider(
            base_url="https://x", api_key="k", model="m"
        )
        with self.assertRaisesRegex(RuntimeError, "idealab-anthropic response has no content"):
            provider.extract_content({})

    def test_headers_include_claude_user_agent(self):
        from _provider import IdealabAnthropicProvider
        provider = IdealabAnthropicProvider(
            base_url="https://x", api_key="my-key", model="m"
        )
        headers = provider.build_headers()
        self.assertEqual(headers["x-api-key"], "my-key")
        self.assertIn("claude-cli", headers["user-agent"])
        self.assertEqual(headers["anthropic-version"], "2023-06-01")


class IdealabOpenAIProviderTest(unittest.TestCase):
    def test_payload_is_plain_openai_format(self):
        from _provider import IdealabOpenAIProvider
        provider = IdealabOpenAIProvider(
            base_url="https://openai.example.test",
            api_key="sk-oa-test",
            model="gpt-4o",
            max_tokens=8000,
        )
        messages = [
            {"role": "system", "content": "system msg"},
            {"role": "user", "content": "hi"},
        ]
        payload = provider.build_payload(messages=messages, spec={})

        self.assertEqual(payload["model"], "gpt-4o")
        self.assertEqual(payload["max_tokens"], 8000)
        # Both system and user messages are preserved (not extracted out)
        self.assertEqual(len(payload["messages"]), 2)
        self.assertNotIn("stream", payload)

    def test_extract_content_returns_message_content(self):
        from _provider import IdealabOpenAIProvider
        provider = IdealabOpenAIProvider(
            base_url="https://x", api_key="k", model="m"
        )
        response = {
            "choices": [{"message": {"content": "gpt review"}}]
        }
        self.assertEqual(provider.extract_content(response), "gpt review")

    def test_extract_content_raises_on_empty(self):
        from _provider import IdealabOpenAIProvider
        provider = IdealabOpenAIProvider(
            base_url="https://x", api_key="k", model="m"
        )
        response = {"choices": [{"message": {"content": ""}, "finish_reason": "stop"}]}
        with self.assertRaisesRegex(RuntimeError, "idealab-openai response returned empty content"):
            provider.extract_content(response)

    def test_headers_use_bearer_token(self):
        from _provider import IdealabOpenAIProvider
        provider = IdealabOpenAIProvider(
            base_url="https://x", api_key="bearer-token", model="m"
        )
        headers = provider.build_headers()
        self.assertEqual(headers["Authorization"], "Bearer bearer-token")


class BuildProviderFactoryTest(unittest.TestCase):
    def test_build_provider_returns_bailian_when_endpoint_is_bailian(self):
        from _provider import build_provider, BailianProvider
        provider = build_provider(
            base_url="https://example.bailian.com",
            api_key="sk",
            model="qwen3.7-max",
            max_tokens=1000,
        )
        self.assertIsInstance(provider, BailianProvider)

    def test_build_provider_returns_idealab_anthropic_when_endpoint_is_idealab_anthropic(self):
        from _provider import build_provider, IdealabAnthropicProvider
        provider = build_provider(
            base_url="https://idealab.alibaba-inc.com/anthropic",
            api_key="sk",
            model="claude-opus-4-6",
            max_tokens=1000,
        )
        self.assertIsInstance(provider, IdealabAnthropicProvider)

    def test_build_provider_returns_idealab_openai_when_endpoint_is_idealab_openai(self):
        from _provider import build_provider, IdealabOpenAIProvider
        provider = build_provider(
            base_url="https://idealab.alibaba-inc.com/openai",
            api_key="sk",
            model="gpt-4o",
            max_tokens=1000,
        )
        self.assertIsInstance(provider, IdealabOpenAIProvider)


class ProviderSendChatTest(unittest.TestCase):
    def test_idealab_anthropic_send_chat_makes_request_and_extracts_content(self):
        from unittest.mock import AsyncMock, MagicMock
        from _provider import IdealabAnthropicProvider
        provider = IdealabAnthropicProvider(
            base_url="https://anthropic.test",
            api_key="sk-ant",
            model="claude-opus-4-6",
            max_tokens=16000,
        )
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "content": [{"type": "text", "text": "Review result from Anthropic"}]
        }
        mock_client.post.return_value = mock_response

        async def run():
            return await provider.send_chat(
                mock_client,
                messages=[{"role": "user", "content": "Review this"}],
                spec={"temperature": 0.3},
            )

        result = asyncio.run(run())
        self.assertEqual(result, "Review result from Anthropic")
        mock_client.post.assert_called_once()

    def test_idealab_openai_send_chat_extracts_choice_content(self):
        from unittest.mock import AsyncMock, MagicMock
        from _provider import IdealabOpenAIProvider
        provider = IdealabOpenAIProvider(
            base_url="https://openai.test",
            api_key="sk-oa",
            model="gpt-4o",
            max_tokens=8000,
        )
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "GPT review output"}}]
        }
        mock_client.post.return_value = mock_response

        async def run():
            return await provider.send_chat(
                mock_client,
                messages=[{"role": "user", "content": "Hi"}],
                spec={},
            )

        result = asyncio.run(run())
        self.assertEqual(result, "GPT review output")

    def test_bailian_send_chat_uses_streaming_endpoint(self):
        from unittest.mock import ANY, MagicMock
        from _provider import BailianProvider
        provider = BailianProvider(
            base_url="https://bailian.test",
            api_key="sk-bai",
            model="qwen3.7-max",
            max_tokens=4000,
        )
        mock_client = MagicMock()

        async def mock_sse_lines():
            yield 'data: {"choices":[{"delta":{"content":"Hello "}}]}'
            yield 'data: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}'
            yield 'data: [DONE]'

        class MockStreamResponse:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            def raise_for_status(self):
                pass
            def aiter_lines(self):
                return mock_sse_lines()

        mock_client.stream.return_value = MockStreamResponse()

        async def run():
            return await provider.send_chat(
                mock_client,
                messages=[{"role": "user", "content": "Review"}],
                spec={},
            )

        result = asyncio.run(run())
        self.assertEqual(result, "Hello world")
        mock_client.stream.assert_called_once_with(
            "POST",
            "https://bailian.test/chat/completions",
            json=ANY,
            headers=ANY,
            timeout=120.0,
        )


if __name__ == "__main__":
    unittest.main()
