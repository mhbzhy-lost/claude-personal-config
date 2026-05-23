# /// script
# requires-python = ">=3.11"
# dependencies = ["openai>=1.50", "python-dotenv"]
# ///
"""External LLM cross-model code reviewer.

Two backends only:
  - api             OpenAI Chat Completions raw request (intended for DeepSeek)
  - claude-code-cli local `claude` CLI talking to an Anthropic-compatible gateway

Reads .env from this skill directory. For backend=api set EXTERNAL_LLM_API_BASE /
EXTERNAL_LLM_API_KEY / EXTERNAL_LLM_MODEL. For backend=claude-code-cli set
ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) / ANTHROPIC_MODEL.

Usage:
    python reviewer.py <BASE_SHA> <HEAD_SHA> \
        [--backend api|claude-code-cli] [--worktree PATH] [--spec FILE]
        [--max-diff N] [--review-depth standard|exhaustive] [--review-round 1|2]
        [--max-issues N] [--max-output-tokens N] [--api-timeout-seconds N]

Sandbox warning: this script POSTs source diffs to an external endpoint. Run only
when that endpoint is authorized for the project's compliance posture. See SKILL.md.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from openai import AsyncOpenAI

_REVIEW_DEPTHS = ("standard", "exhaustive")
_REVIEW_ROUNDS = (1, 2)
_REVIEW_BACKENDS = ("api", "claude-code-cli")
_REDACTED = "[redacted]"
_CLAUDE_MODEL_RE = re.compile(
    r"(^claude(?:[-_/]|$))|(?:[-_/]claude[-_/])|(^sonnet$)|(^opus$)|(^haiku$)",
    re.I,
)
_SENSITIVE_BODY_PATTERNS = (
    re.compile(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s\"',}]+"),
    re.compile(r"(?i)(bearer\s+)[^\s\"',}]+"),
    re.compile(r"(?i)(\"(?:api[_-]?key|token|access[_-]?token|secret)\"\s*:\s*\")[^\"]+(\")"),
)


@dataclass(frozen=True)
class ClaudeCliConfig:
    base_url: str
    api_key: str | None
    auth_token: str | None
    model: str
    claude_bin: str
    timeout_seconds: int


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


def resolve_review_backend(args: argparse.Namespace, *, env: Mapping[str, str]) -> str:
    backend = (getattr(args, "backend", None) or env.get("EXTERNAL_LLM_REVIEW_BACKEND", "api")).strip().lower()
    if backend not in _REVIEW_BACKENDS:
        raise ValueError(
            "EXTERNAL_LLM_REVIEW_BACKEND/--backend must be one of "
            f"{_REVIEW_BACKENDS}, got {backend!r}"
        )
    return backend


def validate_claude_cli_model(model: str) -> None:
    if not model.strip():
        raise ValueError("Claude Code CLI backend requires a Claude model")
    if not _CLAUDE_MODEL_RE.search(model):
        raise ValueError(
            "Claude Code CLI backend is only for Claude model review; "
            f"got non-Claude model {model!r}. Use --backend api for other models."
        )


def _env_value(env: Mapping[str, str], name: str) -> str:
    return env.get(name, "").strip()


def resolve_claude_cli_config(env: Mapping[str, str]) -> ClaudeCliConfig:
    base_url = _env_value(env, "ANTHROPIC_BASE_URL")
    api_key = _env_value(env, "ANTHROPIC_API_KEY")
    auth_token = _env_value(env, "ANTHROPIC_AUTH_TOKEN")
    model = _env_value(env, "ANTHROPIC_MODEL")

    if not base_url:
        raise ValueError("ANTHROPIC_BASE_URL is required for --backend claude-code-cli")
    if not api_key and not auth_token:
        raise ValueError(
            "ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is required for --backend claude-code-cli"
        )
    if not model:
        raise ValueError("ANTHROPIC_MODEL is required for --backend claude-code-cli")

    validate_claude_cli_model(model)

    claude_bin = _env_value(env, "EXTERNAL_LLM_CLAUDE_BIN") or "claude"
    timeout_raw = _env_value(env, "EXTERNAL_LLM_CLAUDE_TIMEOUT_SECONDS") or "300"
    try:
        timeout_seconds = int(timeout_raw)
    except ValueError as exc:
        raise ValueError("EXTERNAL_LLM_CLAUDE_TIMEOUT_SECONDS must be an integer") from exc
    if timeout_seconds < 1:
        raise ValueError("EXTERNAL_LLM_CLAUDE_TIMEOUT_SECONDS must be >= 1")

    return ClaudeCliConfig(
        base_url=base_url.rstrip("/"),
        api_key=api_key or None,
        auth_token=auth_token or None,
        model=model,
        claude_bin=claude_bin,
        timeout_seconds=timeout_seconds,
    )


def endpoint_host(endpoint: str) -> str:
    parsed = urlparse(endpoint)
    if parsed.hostname:
        return parsed.hostname.lower()
    no_scheme = endpoint.split("://", 1)[-1]
    return no_scheme.split("/", 1)[0].split(":", 1)[0].lower()


def _copy_allowed_env(base_env: Mapping[str, str]) -> dict[str, str]:
    allowed_exact = {
        "PATH",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "TZ",
        "TERM",
        "SSL_CERT_FILE",
        "REQUESTS_CA_BUNDLE",
        "NODE_EXTRA_CA_CERTS",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
    }
    env: dict[str, str] = {}
    for key, value in base_env.items():
        if key in allowed_exact or key.startswith("LC_"):
            env[key] = value
    return env


def build_claude_cli_env(
    *,
    base_env: Mapping[str, str],
    runtime_root: Path,
    config: ClaudeCliConfig,
) -> dict[str, str]:
    env = _copy_allowed_env(base_env)

    env.update(
        {
            "HOME": str(runtime_root / "home"),
            "XDG_CONFIG_HOME": str(runtime_root / "xdg" / "config"),
            "XDG_DATA_HOME": str(runtime_root / "xdg" / "data"),
            "XDG_CACHE_HOME": str(runtime_root / "xdg" / "cache"),
            "XDG_STATE_HOME": str(runtime_root / "xdg" / "state"),
            "CLAUDE_CONFIG_DIR": str(runtime_root / "claude-config"),
            "TMPDIR": str(runtime_root / "tmp"),
            "ANTHROPIC_BASE_URL": config.base_url,
            "ANTHROPIC_MODEL": config.model,
            "PYTHONDONTWRITEBYTECODE": "1",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": base_env.get(
                "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"
            ),
            "CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK": base_env.get(
                "CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK", "1"
            ),
            "CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL": base_env.get(
                "CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL", "1"
            ),
            "CLAUDE_CODE_SKIP_PROMPT_HISTORY": base_env.get("CLAUDE_CODE_SKIP_PROMPT_HISTORY", "1"),
            "CLAUDE_CODE_DISABLE_AUTO_MEMORY": base_env.get("CLAUDE_CODE_DISABLE_AUTO_MEMORY", "1"),
            "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS": base_env.get(
                "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS", "1"
            ),
            "CLAUDE_CODE_DISABLE_CLAUDE_MDS": base_env.get("CLAUDE_CODE_DISABLE_CLAUDE_MDS", "1"),
            "CLAUDE_CODE_DISABLE_POLICY_SKILLS": base_env.get(
                "CLAUDE_CODE_DISABLE_POLICY_SKILLS", "1"
            ),
            "DISABLE_AUTOUPDATER": base_env.get("DISABLE_AUTOUPDATER", "1"),
            "DISABLE_UPDATES": base_env.get("DISABLE_UPDATES", "1"),
            "DISABLE_TELEMETRY": base_env.get("DISABLE_TELEMETRY", "1"),
            "DO_NOT_TRACK": base_env.get("DO_NOT_TRACK", "1"),
            "DISABLE_LOGIN_COMMAND": base_env.get("DISABLE_LOGIN_COMMAND", "1"),
            "DISABLE_LOGOUT_COMMAND": base_env.get("DISABLE_LOGOUT_COMMAND", "1"),
        }
    )

    if config.api_key:
        env["ANTHROPIC_API_KEY"] = config.api_key
    if config.auth_token:
        env["ANTHROPIC_AUTH_TOKEN"] = config.auth_token

    for key in (
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        "ANTHROPIC_SMALL_FAST_MODEL",
        "ANTHROPIC_CUSTOM_HEADERS",
        "ANTHROPIC_BETAS",
        "CLAUDE_CODE_SUBAGENT_MODEL",
        "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS",
    ):
        value = base_env.get(key)
        if value:
            env[key] = value

    return env


def build_claude_cli_command(
    *,
    claude_bin: str,
    model: str,
    settings_path: Path,
) -> list[str]:
    return [
        claude_bin,
        "--print",
        "--input-format",
        "text",
        "--output-format",
        "text",
        "--bare",
        "--no-session-persistence",
        "--disable-slash-commands",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--settings",
        str(settings_path),
        "--permission-mode",
        "plan",
        "--tools",
        "",
        "--system-prompt",
        _REVIEW_SYSTEM_PROMPT,
        "--model",
        model,
    ]


def prepare_claude_cli_runtime(runtime_root: Path, config: ClaudeCliConfig) -> Path:
    for directory in (
        runtime_root / "home",
        runtime_root / "xdg" / "config",
        runtime_root / "xdg" / "data",
        runtime_root / "xdg" / "cache",
        runtime_root / "xdg" / "state",
        runtime_root / "claude-config",
        runtime_root / "tmp",
        runtime_root / "profile",
    ):
        directory.mkdir(parents=True, exist_ok=True)

    settings: dict[str, object] = {
        "disableAllHooks": True,
        "includeGitInstructions": False,
        "skipWebFetchPreflight": True,
        "cleanupPeriodDays": 1,
        "permissions": {"defaultMode": "plan"},
    }
    if not config.api_key and config.auth_token:
        helper_path = runtime_root / "profile" / "api-key-helper.sh"
        helper_path.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "printf '%s\\n' \"${ANTHROPIC_AUTH_TOKEN:?ANTHROPIC_AUTH_TOKEN is required}\"\n",
            encoding="utf-8",
        )
        helper_path.chmod(0o700)
        settings["apiKeyHelper"] = str(helper_path)

    settings_path = runtime_root / "profile" / "settings.json"
    settings_path.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return settings_path


def _join_prompt_blocks(blocks: list[str]) -> str:
    return "\n\n".join(block.strip() for block in blocks if block.strip())


def build_plain_user_prompt(
    *,
    user_prompt: str,
    spec_block: str,
) -> str:
    stable_blocks = [block for block in [spec_block] if block.strip()]
    return _join_prompt_blocks([*stable_blocks, user_prompt])


def build_chat_messages(
    *,
    user_prompt: str,
    spec_block: str,
) -> list[dict[str, object]]:
    """Build plain OpenAI Chat Completions messages."""
    return [
        {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": build_plain_user_prompt(
                user_prompt=user_prompt,
                spec_block=spec_block,
            ),
        },
    ]


def extract_chat_content(resp: object) -> str:
    choices = getattr(resp, "choices", None)
    if not choices:
        raise RuntimeError("chat completion returned empty choices")
    choice = choices[0]
    message = getattr(choice, "message", None)
    content = getattr(message, "content", None) or ""
    if content:
        return content

    finish_reason = getattr(choice, "finish_reason", None)
    usage = getattr(resp, "usage", None)
    completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
    details = getattr(usage, "completion_tokens_details", None) if usage else None
    reasoning_tokens = _usage_detail(details, "reasoning_tokens")
    reasoning_len = len(getattr(message, "reasoning_content", "") or "")
    raise RuntimeError(
        "chat completion returned empty content"
        f" finish_reason={finish_reason}"
        f" completion_tokens={completion_tokens}"
        f" reasoning_tokens={reasoning_tokens}"
        f" reasoning_content_len={reasoning_len}"
    )


def _usage_detail(details: object, name: str) -> object:
    if details is None:
        return None
    if isinstance(details, dict):
        return details.get(name)
    return getattr(details, name, None)


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


def run_claude_cli_review(
    *,
    prompt: str,
    config: ClaudeCliConfig,
    base_env: Mapping[str, str],
    cwd: Path,
) -> str:
    with tempfile.TemporaryDirectory(prefix="external-llm-review-claude-") as tmp:
        runtime_root = Path(tmp)
        settings_path = prepare_claude_cli_runtime(runtime_root, config)
        env = build_claude_cli_env(
            base_env=base_env,
            runtime_root=runtime_root,
            config=config,
        )
        command = build_claude_cli_command(
            claude_bin=config.claude_bin,
            model=config.model,
            settings_path=settings_path,
        )
        try:
            result = subprocess.run(
                command,
                input=prompt,
                text=True,
                capture_output=True,
                cwd=str(cwd),
                env=env,
                timeout=config.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Claude Code CLI not found: {config.claude_bin!r}. "
                "Install it with `npm install -g @anthropic-ai/claude-code` or set EXTERNAL_LLM_CLAUDE_BIN."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"Claude Code CLI timed out after {config.timeout_seconds}s"
            ) from exc

        if result.returncode != 0:
            stderr = response_body_text(result.stderr or "")
            stdout = response_body_text(result.stdout or "")
            detail = " ".join(
                part
                for part in (
                    f"exit_code={result.returncode}",
                    f"stderr={stderr[:1000]}" if stderr else "",
                    f"stdout={stdout[:1000]}" if stdout else "",
                )
                if part
            )
            raise RuntimeError(f"Claude Code CLI review failed: {detail}")

        return result.stdout.strip()


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
    parser.add_argument(
        "--backend",
        choices=_REVIEW_BACKENDS,
        default=None,
        help="review transport backend (default: EXTERNAL_LLM_REVIEW_BACKEND or api)",
    )
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
        default=16000,
        help="maximum model output tokens (default 16000; set <=0 to omit)",
    )
    parser.add_argument(
        "--api-timeout-seconds",
        type=int,
        default=180,
        help=(
            "hard wall-clock timeout around the API call (default 180). "
            "Set <=0 to drop the wall-clock cap and fall back to the OpenAI "
            "SDK default (~600s)."
        ),
    )
    return parser


async def run_review(*, args: argparse.Namespace, skill_dir: Path) -> int:
    legacy_format = os.environ.get("EXTERNAL_LLM_API_FORMAT", "").strip()
    if legacy_format and legacy_format.lower() != "chat":
        print(
            f"ERROR: EXTERNAL_LLM_API_FORMAT={legacy_format!r} is no longer read by "
            "reviewer.py. Only OpenAI Chat Completions (backend=api) and the local "
            "Claude CLI (backend=claude-code-cli) remain. Please remove this "
            "variable from your .env file. If you previously used 'anthropic' "
            "format, set EXTERNAL_LLM_REVIEW_BACKEND=claude-code-cli with "
            "ANTHROPIC_BASE_URL instead (see .env.example).",
            file=sys.stderr,
        )
        return 1

    for legacy_var in ("EXTERNAL_LLM_CACHE_MODE", "EXTERNAL_LLM_CACHE_DIFF"):
        if os.environ.get(legacy_var, "").strip():
            print(
                f"WARN: {legacy_var} is set but no longer honored "
                "(qwen-explicit cache support has been removed). Remove it from "
                "your .env to silence this warning.",
                file=sys.stderr,
            )

    try:
        backend = resolve_review_backend(args, env=os.environ)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    review_depth = (
        args.review_depth
        or os.environ.get("EXTERNAL_LLM_REVIEW_DEPTH", "exhaustive").strip().lower()
    )

    if review_depth not in _REVIEW_DEPTHS:
        print(
            f"ERROR: EXTERNAL_LLM_REVIEW_DEPTH/--review-depth must be one of {_REVIEW_DEPTHS}, got {review_depth!r}",
            file=sys.stderr,
        )
        return 1

    if args.max_issues < 1:
        print("ERROR: --max-issues must be >= 1", file=sys.stderr)
        return 1

    cli_config: ClaudeCliConfig | None = None
    base_url = ""
    api_key = ""
    model = ""
    if backend == "claude-code-cli":
        try:
            cli_config = resolve_claude_cli_config(os.environ)
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
    else:
        base_url = os.environ.get("EXTERNAL_LLM_API_BASE", "").strip().rstrip("/")
        api_key = os.environ.get("EXTERNAL_LLM_API_KEY", "").strip()
        model = os.environ.get("EXTERNAL_LLM_MODEL", "").strip()

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

    user_prompt = build_review_user_prompt(
        base_sha=args.base_sha,
        head_sha=args.head_sha,
        diff=diff,
        truncated=truncated,
        review_depth=review_depth,
        review_round=args.review_round,
        max_issues=args.max_issues,
    )

    plain_prompt = build_plain_user_prompt(
        user_prompt=user_prompt,
        spec_block=spec_block,
    )

    if backend == "claude-code-cli":
        try:
            assert cli_config is not None
            print(
                f"[external-llm-review] backend=claude-code-cli model={cli_config.model}"
                f" endpoint_host={endpoint_host(cli_config.base_url)}"
                f" diff_chars={len(diff)}{' (truncated)' if truncated else ''}"
                f" review_depth={review_depth} review_round={args.review_round}"
                f" max_issues={args.max_issues}",
                file=sys.stderr,
            )
            content = run_claude_cli_review(
                prompt=plain_prompt,
                config=cli_config,
                base_env=os.environ,
                cwd=Path(args.worktree).resolve(),
            )
        except Exception as exc:
            print(f"ERROR: claude-code-cli review failed: {describe_api_exception(exc)}", file=sys.stderr)
            return 4

        print(content)
        return 0

    print(
        f"[external-llm-review] backend=api model={model} base={base_url}"
        f" diff_chars={len(diff)}{' (truncated)' if truncated else ''}"
        f" review_depth={review_depth} review_round={args.review_round}"
        f" max_issues={args.max_issues}"
        f" api_timeout_seconds={args.api_timeout_seconds}",
        file=sys.stderr,
    )

    try:
        hard_timeout = args.api_timeout_seconds if args.api_timeout_seconds > 0 else None
        async with asyncio.timeout(hard_timeout):
            async with AsyncOpenAI(api_key=api_key, base_url=base_url) as oclient:
                chat_kwargs = {}
                if args.max_output_tokens > 0:
                    chat_kwargs["max_tokens"] = args.max_output_tokens
                if hard_timeout is not None:
                    chat_kwargs["timeout"] = hard_timeout
                resp = await oclient.chat.completions.create(
                    model=model,
                    messages=build_chat_messages(
                        user_prompt=user_prompt,
                        spec_block=spec_block,
                    ),
                    temperature=0.2,
                    **chat_kwargs,
                )
                content = extract_chat_content(resp)
    except TimeoutError:
        print(
            f"ERROR: chat.create exceeded api_timeout_seconds={args.api_timeout_seconds}",
            file=sys.stderr,
        )
        return 4
    except Exception as exc:
        print(
            f"ERROR: chat.create failed: {describe_api_exception(exc)}",
            file=sys.stderr,
        )
        return 4
    print(content)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
