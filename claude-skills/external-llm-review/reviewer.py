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

Sandbox warning: this script POSTs source diffs to an external endpoint. Run only
when that endpoint is authorized for the project's compliance posture. See SKILL.md.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from openai import AsyncOpenAI


_REVIEW_SYSTEM_PROMPT = """你是一名资深代码评审者。被评审代码可能涉及多种语言、框架与外部依赖。

评审重点（同族模型常漏，请尤其关注）：
1. 库版本兼容 / API deprecation：使用了已废弃的 API、版本不匹配、import 路径漂移
2. async 卫生：所有阻塞 subprocess / 同步 IO 必须放到 worker thread；await 前不要持有 mutable shared state
3. 输入边界与路径安全：所有用户/外部数据构成的路径都要校验防穿越
4. 错误传播一致：失败路径要么显式抛出有意义的异常，要么落到错误字段；不要 silent swallow
5. 子进程 / 网络错误诊断：stderr / response body 要保留到错误信息里，便于排查
6. 安全 / 数据泄露：敏感字段（凭据 / 用户输入）不要进日志或异常 message

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

### Assessment

**Ready to merge?** Yes | No | With fixes
**Reasoning:** 一两句话说明判断依据。
"""


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_sha", help="git base commit (e.g. main, 76bddc5)")
    parser.add_argument("head_sha", help="git head commit (the changes to review)")
    parser.add_argument("--worktree", default=".", help="worktree path (default: cwd)")
    parser.add_argument("--spec", help="optional spec/requirements file path")
    parser.add_argument("--max-diff", type=int, default=80000,
                        help="char cap on diff sent to model (default 80000)")
    args = parser.parse_args()

    skill_dir = Path(__file__).resolve().parent
    load_dotenv(skill_dir / ".env")

    base_url = os.environ.get("EXTERNAL_LLM_API_BASE", "").strip().rstrip("/")
    api_key = os.environ.get("EXTERNAL_LLM_API_KEY", "").strip()
    model = os.environ.get("EXTERNAL_LLM_MODEL", "").strip()
    api_format = os.environ.get("EXTERNAL_LLM_API_FORMAT", "chat").strip().lower()

    if api_format not in ("chat", "responses", "anthropic"):
        print(
            f"ERROR: EXTERNAL_LLM_API_FORMAT must be 'chat'|'responses'|'anthropic', got {api_format!r}",
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

    spec_block = ""
    if args.spec:
        try:
            spec_block = (
                f"\n## Spec / Requirements\n\n{Path(args.spec).read_text()}\n"
            )
        except OSError as e:
            print(f"WARN: could not read --spec {args.spec}: {e}", file=sys.stderr)

    user_prompt = f"""## Git Diff ({args.base_sha[:7]}..{args.head_sha[:7]}{', truncated' if truncated else ''})

```diff
{diff}
```
{spec_block}
请按系统提示要求的格式输出评审结果。
"""

    print(
        f"[external-llm-review] model={model} base={base_url} format={api_format}"
        f" diff_chars={len(diff)}{' (truncated)' if truncated else ''}",
        file=sys.stderr,
    )

    try:
        if api_format == "anthropic":
            async with AsyncAnthropic(api_key=api_key, base_url=base_url) as aclient:
                resp = await aclient.messages.create(
                    model=model,
                    max_tokens=8192,
                    system=_REVIEW_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                    temperature=0.2,
                    timeout=180,
                )
                content = "".join(
                    block.text for block in resp.content if getattr(block, "type", None) == "text"
                )
        else:
            async with AsyncOpenAI(api_key=api_key, base_url=base_url) as oclient:
                if api_format == "responses":
                    resp = await oclient.responses.create(
                        model=model,
                        instructions=_REVIEW_SYSTEM_PROMPT,
                        input=user_prompt,
                        temperature=0.2,
                        timeout=180,
                    )
                    content = (resp.output_text or "").strip()
                else:
                    resp = await oclient.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt},
                        ],
                        temperature=0.2,
                        timeout=180,
                    )
                    content = resp.choices[0].message.content or ""
    except Exception as exc:
        print(f"ERROR: {api_format}.create failed: {exc}", file=sys.stderr)
        return 4
    print(content)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
