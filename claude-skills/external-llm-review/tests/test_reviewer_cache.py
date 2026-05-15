import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import reviewer


class QwenExplicitCacheMessagesTest(unittest.TestCase):
    def test_default_chat_messages_are_plain_strings(self):
        messages = reviewer.build_chat_messages(
            user_prompt="review this diff",
            spec_block="## Spec\nstable requirements",
            cache_prefix_blocks=["## Project\nstable project context"],
            cache_mode="off",
            cache_diff=False,
        )

        self.assertEqual(messages[0]["role"], "system")
        self.assertIsInstance(messages[0]["content"], str)
        self.assertIn("stable project context", messages[1]["content"])
        self.assertIn("stable requirements", messages[1]["content"])
        self.assertTrue(messages[1]["content"].endswith("review this diff"))

    def test_plain_user_prompt_includes_stable_context(self):
        user_prompt = reviewer.build_plain_user_prompt(
            user_prompt="review this diff",
            spec_block="## Spec\nstable requirements",
            cache_prefix_blocks=["## Project\nstable project context"],
        )

        self.assertIn("stable project context", user_prompt)
        self.assertIn("stable requirements", user_prompt)
        self.assertTrue(user_prompt.endswith("review this diff"))

    def test_qwen_explicit_cache_marks_stable_context_only(self):
        messages = reviewer.build_chat_messages(
            user_prompt="review this diff",
            spec_block="## Spec\nstable requirements",
            cache_prefix_blocks=["## Project\nstable project context"],
            cache_mode="qwen-explicit",
            cache_diff=False,
        )

        user_blocks = messages[1]["content"]

        self.assertIsInstance(messages[0]["content"], str)
        self.assertIn("cache_control", user_blocks[1])
        self.assertNotIn("cache_control", user_blocks[-1])
        self.assertIn("stable requirements", user_blocks[1]["text"])
        self.assertEqual(user_blocks[-1]["text"], "review this diff")

    def test_qwen_explicit_cache_can_mark_diff_when_requested(self):
        messages = reviewer.build_chat_messages(
            user_prompt="review this diff",
            spec_block="",
            cache_prefix_blocks=[],
            cache_mode="qwen-explicit",
            cache_diff=True,
        )

        user_diff_block = messages[1]["content"][0]

        self.assertIsInstance(messages[0]["content"], str)
        self.assertIn("cache_control", user_diff_block)

    def test_extract_chat_content_rejects_empty_choices(self):
        class Response:
            choices = []

        with self.assertRaisesRegex(RuntimeError, "empty choices"):
            reviewer.extract_chat_content(Response())

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
