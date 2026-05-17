# /// script
# requires-python = ">=3.11"
# dependencies = ["openai>=1.50", "anthropic>=0.40", "python-dotenv"]
# ///
"""External LLM cross-model code reviewer (OpenAI Chat Completions compatible).

Reads .env from this skill directory for EXTERNAL_LLM_API_BASE / EXTERNAL_LLM_API_KEY /
EXTERNAL_LLM_MODEL, runs `git diff <base>..<head>` against the target worktree, sends
the diff (plus an optional spec file) to the configured OpenAI-compatible
chat-completions endpoint, and prints the model's structured review to stdout.

Usage:
    python reviewer.py <BASE_SHA> <HEAD_SHA> \
        [--worktree PATH] [--spec FILE] [--max-diff N]
        [--review-depth standard|exhaustive] [--review-round 1|2]
        [--max-issues N] [--max-output-tokens N]
        [--cache-mode off|qwen-explicit] [--cache-prefix FILE] [--cache-diff]

Sandbox warning: this script POSTs source diffs to an external endpoint. Run only
when that endpoint is authorized for the project's compliance posture. See SKILL.md.
"""
from __future__ import annotations

import argparse
import asyncio
import re
import os
import subprocess
import sys
from pathlib import Path

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from openai import AsyncOpenAI

_CACHE_MODES = ("off", "qwen-explicit")
_REVIEW_DEPTHS = ("standard", "exhaustive")
_REVIEW_ROUNDS = (1, 2)
_REDACTED = "[redacted]"
_SENSITIVE_BODY_PATTERNS = (
    re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s\"',}]+"),
    re.compile(r"(?i)(bearer\s+)[^\s\"',}]+"),
    re.compile(r"(?i)(\"(?:api[_-]?key|token|access[_-]?token|secret)\"\s*:\s*\")[^\"]+(\")"),
)


_REVIEW_SYSTEM_PROMPT = """你是一名资深代码评审者。被评审代码可能涉及多种语言、框架与外部依赖。

评审重点（同族模型常漏，请尤其关注）：
1. 库版本兼容 / API deprecation：使用了已废弃的 API、版本不匹配、import 路径漂移
2. async 卫生：所有阻塞 subprocess / 同步 IO 必须放到 worker thread；await 前不要持有 mutable shared state
3. 输入边界与路径安全：所有用户/外部数据构成的路径都要校验防穿越
4. 错误传播一致：失败路径要么显式抛出有意义的异常，要么落到错误字段；不要 silent swallow
5. 子进程 / 网络错误诊断：stderr / response body 要保留到错误信息里，便于排查
6. 安全 / 数据泄露：敏感字段（凭据 / 用户输入）不要进日志或异常 message

评审方式：
- 不要只报告 top 3。先系统性扫描候选风险，再合并同类项，最后按严重度输出。
- 同类问题应归并为一条模式级 issue，并列出受影响文件/路径。
- 如果某个检查维度未发现问题，必须在 Checklist Coverage 中说明已检查。

输出格式（严格遵守）：

### Strengths
[简洁列出代码做得好的地方]

### Issues

#### Critical (Must Fix)
[运行时 bug / 数据丢失 / 安全 / 接口误用，每条带 file:line 说明]

#### Important (Should Fix)
[架构 / 错误处理 / 缺失边界，每条带 file:line]

#### Minor (Nice to Have)
[风格 / 微优化]

### Checklist Coverage
[列出已检查但未发现问题的维度；若 diff 不适用，也说明 N/A]

### Assessment

**Ready to merge?** Yes | No | With fixes
**Reasoning:** 一两句话说明判断依据。
"""


def build_review_protocol(
    *,
    review_depth: str,
    review_round: int,
    max_issues: int,
) -> str:
    if review_depth not in _REVIEW_DEPTHS:
        raise ValueError(f"unsupported review depth: {review_depth}")
    if review_round not in _REVIEW_ROUNDS:
        raise ValueError(f"review_round must be 1 or 2, got {review_round}")

    shared = f"""## Review Protocol

- 最多报告 {max_issues} 个问题；不要只报告 top 3。
- 先枚举候选风险，再合并重复/同模式问题，最后按 Critical / Important / Minor 分类。
- 同一模式影响多个文件时，归并为一条 issue，并列出代表性 file:line 与受影响范围。
- 对每条 Critical / Important 给出可验证证据：file:line、触发条件、为什么现有测试/逻辑挡不住。
- 必须输出 Checklist Coverage，列出已检查但未发现问题的维度；不适用项写 N/A。

逐项检查清单：
1. 实现是否真正满足 spec / bug-analysis 的根因与影响范围
2. 入口参数、help、dry-run 是否会误触发网络/写文件/远端副作用
3. 临时文件、trap、exec、cleanup、stdin/stdout/stderr 处理是否可靠
4. shell 兼容性：bash/zsh 特殊变量、set -euo pipefail、mktemp、glob、TTY/非 TTY
5. 子进程 / 网络错误是否保留 stderr / response body / 可诊断上下文
6. 幂等性、重复执行、部分失败、回滚/备份是否安全
7. 输入边界、路径穿越、敏感信息泄露、权限边界是否合理
8. 并发/异步/缓存/状态共享是否引入竞态或陈旧状态
9. 新增测试是否覆盖根因路径和影响范围，而不是只覆盖表面失败
"""

    if review_depth == "standard":
        depth_note = "- 本轮是 standard review：优先报告证据明确、影响实际运行的缺陷。"
    else:
        depth_note = "- 本轮是 exhaustive review：尽量在单次报告中暴露完整问题面，不要留到后续轮次再补充。"

    if review_round == 1:
        round_note = """- 第一轮：做完整横向扫描，目标是在本轮暴露主要问题面。
- 不要因为已找到几个问题就停止；继续扫完整个 diff 和检查清单。"""
    else:
        round_note = """- 第二轮：只验证上一轮已修复项、修复引入的新 diff、以及仍然直接阻断合并的 Critical/Important。
- 不要扩展到无关历史问题；除非它会被本轮改动实际触发或构成 Critical 风险。"""

    return "\n".join([shared.rstrip(), depth_note, round_note]).strip()


def build_review_user_prompt(
    *,
    base_sha: str,
    head_sha: str,
    diff: str,
    truncated: bool,
    review_depth: str,
    review_round: int,
    max_issues: int,
) -> str:
    protocol = build_review_protocol(
        review_depth=review_depth,
        review_round=review_round,
        max_issues=max_issues,
    )
    return f"""{protocol}

## Git Diff ({base_sha[:7]}..{head_sha[:7]}{', truncated' if truncated else ''})

```diff
{diff}
```

请按系统提示要求的格式输出评审结果。
"""


def _text_block(text: str, *, cache: bool = False) -> dict[str, object]:
    block: dict[str, object] = {"type": "text", "text": text}
    if cache:
        block["cache_control"] = {"type": "ephemeral"}
    return block


def _join_prompt_blocks(blocks: list[str]) -> str:
    return "\n\n".join(block.strip() for block in blocks if block.strip())


def build_plain_user_prompt(
    *,
    user_prompt: str,
    spec_block: str,
    cache_prefix_blocks: list[str],
) -> str:
    stable_blocks = [block for block in [*cache_prefix_blocks, spec_block] if block.strip()]
    return _join_prompt_blocks([*stable_blocks, user_prompt])


def build_chat_messages(
    *,
    user_prompt: str,
    spec_block: str,
    cache_prefix_blocks: list[str],
    cache_mode: str,
    cache_diff: bool,
) -> list[dict[str, object]]:
    """Build OpenAI Chat Completions messages.

    Qwen explicit cache is expressed with content-block `cache_control` markers.
    By default only stable context is cache-marked; the diff is dynamic and is
    marked only when the caller explicitly asks for it.
    """
    stable_blocks = [block for block in [*cache_prefix_blocks, spec_block] if block.strip()]

    if cache_mode == "off":
        return [
            {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": build_plain_user_prompt(
                    user_prompt=user_prompt,
                    spec_block=spec_block,
                    cache_prefix_blocks=cache_prefix_blocks,
                ),
            },
        ]

    if cache_mode != "qwen-explicit":
        raise ValueError(f"unsupported cache mode: {cache_mode}")

    user_content = []
    for index, block in enumerate(stable_blocks):
        user_content.append(
            _text_block(block.strip(), cache=index == len(stable_blocks) - 1)
        )
    user_content.append(_text_block(user_prompt, cache=cache_diff))

    return [
        {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def format_cache_usage(usage: object) -> str | None:
    if usage is None:
        return None

    details = getattr(usage, "prompt_tokens_details", None)
    cached_tokens = getattr(details, "cached_tokens", None) if details else None
    creation_tokens = (
        getattr(details, "cache_creation_input_tokens", None) if details else None
    )
    prompt_tokens = getattr(usage, "prompt_tokens", None)

    if cached_tokens is None and creation_tokens is None:
        return None

    return (
        "[external-llm-review] cache_usage"
        f" prompt_tokens={prompt_tokens}"
        f" cached_tokens={cached_tokens}"
        f" cache_creation_input_tokens={creation_tokens}"
    )


def extract_chat_content(resp: object) -> str:
    choices = getattr(resp, "choices", None)
    if not choices:
        raise RuntimeError("chat completion returned empty choices")
    message = getattr(choices[0], "message", None)
    return getattr(message, "content", None) or ""


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def read_text_block(path: str, *, label: str, allowed_roots: list[Path]) -> str:
    resolved_path = Path(path).resolve()
    resolved_roots = [root.resolve() for root in allowed_roots]
    if not any(_is_relative_to(resolved_path, root) for root in resolved_roots):
        allowed = ", ".join(str(root) for root in resolved_roots)
        raise ValueError(f"{path} is outside allowed roots: {allowed}")
    return f"## {label}: {resolved_path}\n\n{resolved_path.read_text(encoding='utf-8')}\n"


def response_body_text(body: object) -> str:
    if isinstance(body, bytes):
        text = body.decode("utf-8", errors="replace")
    else:
        text = str(body)

    for pattern in _SENSITIVE_BODY_PATTERNS:
        text = pattern.sub(redact_sensitive_match, text)
    return text


def redact_sensitive_match(match: re.Match[str]) -> str:
    groups = match.groups()
    if len(groups) >= 2:
        return f"{groups[0]}{_REDACTED}{groups[-1]}"
    if groups:
        return f"{groups[0]}{_REDACTED}"
    return _REDACTED


def describe_api_exception(exc: Exception) -> str:
    parts = [str(exc)]
    response = getattr(exc, "response", None)
    if response is not None:
        status_code = getattr(response, "status_code", None)
        body = getattr(response, "text", None) or getattr(response, "content", None)
        if status_code is not None:
            parts.append(f"status_code={status_code}")
        if body:
            body_text = response_body_text(body)
            parts.append(f"response_body={body_text[:500]}")
    request_id = getattr(exc, "request_id", None)
    if request_id:
        parts.append(f"request_id={request_id}")
    return " ".join(parts)



def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


async def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    skill_dir = Path(__file__).resolve().parent
    load_dotenv(skill_dir / ".env")

    return await run_review(args=args, skill_dir=skill_dir)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_sha", help="git base commit (e.g. main, 76bddc5)")
    parser.add_argument("head_sha", help="git head commit (the changes to review)")
    parser.add_argument("--worktree", default=".", help="worktree path (default: cwd)")
    parser.add_argument("--spec", help="optional spec/requirements file path")
    parser.add_argument("--max-diff", type=int, default=80000,
                        help="char cap on diff sent to model (default 80000)")
    parser.add_argument(
        "--review-depth",
        choices=_REVIEW_DEPTHS,
        default=None,
        help="review depth (default: EXTERNAL_LLM_REVIEW_DEPTH or exhaustive)",
    )
    parser.add_argument(
        "--review-round",
        type=int,
        choices=_REVIEW_ROUNDS,
        default=1,
        help="review round for this diff; only 1 or 2 are supported",
    )
    parser.add_argument(
        "--max-issues",
        type=int,
        default=25,
        help="maximum number of issues the reviewer should report (default 25)",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=12000,
        help="maximum model output tokens (default 12000; set <=0 to omit)",
    )
    parser.add_argument(
        "--cache-mode",
        choices=_CACHE_MODES,
        default=None,
        help="prompt cache mode (default: EXTERNAL_LLM_CACHE_MODE or off)",
    )
    parser.add_argument(
        "--cache-prefix",
        action="append",
        default=[],
        help="stable context file to place before the diff and cache in qwen-explicit mode; repeatable",
    )
    parser.add_argument(
        "--cache-diff",
        action="store_true",
        default=False,
        help="also mark the diff block cacheable in qwen-explicit mode",
    )
    return parser


async def run_review(*, args: argparse.Namespace, skill_dir: Path) -> int:
    base_url = os.environ.get("EXTERNAL_LLM_API_BASE", "").strip().rstrip("/")
    api_key = os.environ.get("EXTERNAL_LLM_API_KEY", "").strip()
    model = os.environ.get("EXTERNAL_LLM_MODEL", "").strip()
    api_format = os.environ.get("EXTERNAL_LLM_API_FORMAT", "chat").strip().lower()
    cache_mode = (
        args.cache_mode
        or os.environ.get("EXTERNAL_LLM_CACHE_MODE", "off").strip().lower()
    )
    review_depth = (
        args.review_depth
        or os.environ.get("EXTERNAL_LLM_REVIEW_DEPTH", "exhaustive").strip().lower()
    )
    cache_diff = args.cache_diff or env_flag("EXTERNAL_LLM_CACHE_DIFF")

    if api_format not in ("chat", "responses", "anthropic"):
        print(
            f"ERROR: EXTERNAL_LLM_API_FORMAT must be 'chat'|'responses'|'anthropic', got {api_format!r}",
            file=sys.stderr,
        )
        return 1

    if cache_mode not in _CACHE_MODES:
        print(
            f"ERROR: EXTERNAL_LLM_CACHE_MODE/--cache-mode must be one of {_CACHE_MODES}, got {cache_mode!r}",
            file=sys.stderr,
        )
        return 1

    if review_depth not in _REVIEW_DEPTHS:
        print(
            f"ERROR: EXTERNAL_LLM_REVIEW_DEPTH/--review-depth must be one of {_REVIEW_DEPTHS}, got {review_depth!r}",
            file=sys.stderr,
        )
        return 1

    if args.max_issues < 1:
        print("ERROR: --max-issues must be >= 1", file=sys.stderr)
        return 1

    if cache_mode != "off" and api_format != "chat":
        print(
            "ERROR: explicit cache currently supports only EXTERNAL_LLM_API_FORMAT=chat",
            file=sys.stderr,
        )
        return 1

    if not base_url or not api_key or not model:
        print(
            "ERROR: EXTERNAL_LLM_API_BASE / EXTERNAL_LLM_API_KEY / EXTERNAL_LLM_MODEL"
            f" missing; copy .env.example to .env inside {skill_dir} and fill in values.",
            file=sys.stderr,
        )
        return 1

    try:
        diff = subprocess.check_output(
            ["git", "-C", args.worktree, "diff", f"{args.base_sha}..{args.head_sha}"],
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"ERROR: git diff failed: {e}", file=sys.stderr)
        return 2

    if not diff.strip():
        print("ERROR: empty diff (range produces no changes)", file=sys.stderr)
        return 3

    truncated = False
    if len(diff) > args.max_diff:
        diff = diff[: args.max_diff]
        truncated = True

    allowed_context_roots = [Path(args.worktree), skill_dir]

    spec_block = ""
    if args.spec:
        try:
            spec_block = read_text_block(
                args.spec,
                label="Spec / Requirements",
                allowed_roots=allowed_context_roots,
            )
        except (OSError, ValueError) as e:
            print(f"WARN: could not read --spec {args.spec}: {e}", file=sys.stderr)

    cache_prefix_blocks = []
    for cache_prefix in args.cache_prefix:
        try:
            cache_prefix_blocks.append(
                read_text_block(
                    cache_prefix,
                    label="Cache Prefix",
                    allowed_roots=allowed_context_roots,
                )
            )
        except (OSError, ValueError) as e:
            print(f"WARN: could not read --cache-prefix {cache_prefix}: {e}", file=sys.stderr)

    user_prompt = build_review_user_prompt(
        base_sha=args.base_sha,
        head_sha=args.head_sha,
        diff=diff,
        truncated=truncated,
        review_depth=review_depth,
        review_round=args.review_round,
        max_issues=args.max_issues,
    )

    print(
        f"[external-llm-review] model={model} base={base_url} format={api_format}"
        f" diff_chars={len(diff)}{' (truncated)' if truncated else ''}"
        f" cache_mode={cache_mode}{' cache_diff=true' if cache_diff else ''}"
        f" review_depth={review_depth} review_round={args.review_round}"
        f" max_issues={args.max_issues}",
        file=sys.stderr,
    )

    try:
        if api_format == "anthropic":
            async with AsyncAnthropic(api_key=api_key, base_url=base_url) as aclient:
                resp = await aclient.messages.create(
                    model=model,
                    max_tokens=args.max_output_tokens if args.max_output_tokens > 0 else 8192,
                    system=_REVIEW_SYSTEM_PROMPT,
                    messages=[
                        {
                            "role": "user",
                            "content": build_plain_user_prompt(
                                user_prompt=user_prompt,
                                spec_block=spec_block,
                                cache_prefix_blocks=cache_prefix_blocks,
                            ),
                        }
                    ],
                    temperature=0.2,
                    timeout=180,
                )
                content = "".join(
                    block.text for block in resp.content if getattr(block, "type", None) == "text"
                )
        else:
            async with AsyncOpenAI(api_key=api_key, base_url=base_url) as oclient:
                if api_format == "responses":
                    response_kwargs = {}
                    if args.max_output_tokens > 0:
                        response_kwargs["max_output_tokens"] = args.max_output_tokens
                    resp = await oclient.responses.create(
                        model=model,
                        instructions=_REVIEW_SYSTEM_PROMPT,
                        input=build_plain_user_prompt(
                            user_prompt=user_prompt,
                            spec_block=spec_block,
                            cache_prefix_blocks=cache_prefix_blocks,
                        ),
                        temperature=0.2,
                        timeout=180,
                        **response_kwargs,
                    )
                    content = (resp.output_text or "").strip()
                else:
                    chat_kwargs = {}
                    if args.max_output_tokens > 0:
                        chat_kwargs["max_tokens"] = args.max_output_tokens
                    resp = await oclient.chat.completions.create(
                        model=model,
                        messages=build_chat_messages(
                            user_prompt=user_prompt,
                            spec_block=spec_block,
                            cache_prefix_blocks=cache_prefix_blocks,
                            cache_mode=cache_mode,
                            cache_diff=cache_diff,
                        ),
                        temperature=0.2,
                        timeout=180,
                        **chat_kwargs,
                    )
                    cache_usage = format_cache_usage(resp.usage)
                    if cache_usage:
                        print(cache_usage, file=sys.stderr)
                    content = extract_chat_content(resp)
    except Exception as exc:
        print(
            f"ERROR: {api_format}.create failed: {describe_api_exception(exc)}",
            file=sys.stderr,
        )
        return 4
    print(content)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
