"""LLM-powered tech_stack / capability classifier backed by a local ollama daemon.

Uses stdlib ``http.client`` only (no new runtime deps). All failures are
soft-degraded to ``ClassifyResult(error=...)`` so the caller can fall back to
an empty-tag pipeline.
"""

from __future__ import annotations

import http.client
import json
import socket
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse


SYSTEM_PROMPT = (
    "你是技术栈和能力域分类器。任务：根据用户需求 + workspace 指纹，从给定的"
    "合法 tag 闭集中选出相关 tag。输出纯 JSON，两个字段：tech_stack、capability。\n"
    "\n"
    "规则：\n"
    "- tech_stack 只能从\"合法 tech_stack\"列表中选\n"
    "- capability 只能从\"合法 capability\"列表中选\n"
    "- 禁止生造 tag；不确定宁可返回空数组\n"
    "- 纯后端逻辑/文档/配置类任务允许返回 tech_stack=[]\n"
    "- 识别用户原始意图优先于 workspace 指纹（\"我想写 Next.js\" 压过没有 package.json）"
)


_RESPONSE_FORMAT = {
    "type": "object",
    "properties": {
        "tech_stack": {"type": "array", "items": {"type": "string"}},
        "capability": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tech_stack", "capability"],
}


@dataclass(frozen=True)
class ClassifierConfig:
    host_url: str
    model: str = "qwen3:4b"
    timeout_s: float = 5.0
    num_ctx: int = 2048


@dataclass
class ClassifyResult:
    tech_stack: list[str] = field(default_factory=list)
    capability: list[str] = field(default_factory=list)
    elapsed_s: float = 0.0
    error: str | None = None


def _build_user_prompt(
    user_prompt: str,
    fingerprint_summary: str,
    available_tech_stack: list[str],
    available_capability: list[str],
) -> str:
    return (
        f"合法 tech_stack: {json.dumps(available_tech_stack, ensure_ascii=False)}\n"
        f"合法 capability: {json.dumps(available_capability, ensure_ascii=False)}\n"
        "\n"
        "workspace 指纹:\n"
        f"{fingerprint_summary}\n"
        "\n"
        "用户需求:\n"
        f"{user_prompt}"
    )


class Classifier:
    def __init__(self, config: ClassifierConfig) -> None:
        self.config = config
        parsed = urlparse(config.host_url)
        self._host = parsed.hostname or "127.0.0.1"
        self._port = parsed.port or 11435
        self._scheme = parsed.scheme or "http"

    def classify(
        self,
        user_prompt: str,
        fingerprint_summary: str,
        available_tech_stack: list[str],
        available_capability: list[str],
    ) -> ClassifyResult:
        payload = {
            "model": self.config.model,
            "stream": False,
            "think": False,
            "options": {"temperature": 0, "num_ctx": self.config.num_ctx},
            "format": _RESPONSE_FORMAT,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": _build_user_prompt(
                        user_prompt,
                        fingerprint_summary,
                        available_tech_stack,
                        available_capability,
                    ),
                },
            ],
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        t0 = time.monotonic()

        if self._scheme == "https":
            conn_cls = http.client.HTTPSConnection
        else:
            conn_cls = http.client.HTTPConnection
        conn = conn_cls(self._host, self._port, timeout=self.config.timeout_s)
        try:
            conn.request(
                "POST",
                "/api/chat",
                body=body,
                headers={"Content-Type": "application/json"},
            )
            resp = conn.getresponse()
            raw = resp.read()
            if not (200 <= resp.status < 300):
                return ClassifyResult(
                    elapsed_s=time.monotonic() - t0,
                    error=f"http {resp.status}: {raw[:200].decode('utf-8', 'replace')}",
                )
        except (
            ConnectionRefusedError,
            socket.timeout,
            TimeoutError,
            OSError,
            http.client.HTTPException,
        ) as e:
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error=f"transport: {type(e).__name__}: {e}",
            )
        finally:
            try:
                conn.close()
            except Exception:
                pass

        try:
            outer = json.loads(raw.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error=f"outer json: {e}",
            )

        content = (outer or {}).get("message", {}).get("content")
        if not isinstance(content, str):
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error="missing message.content",
            )

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as e:
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error=f"inner json: {e}",
            )

        if not isinstance(parsed, dict):
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error="inner not object",
            )

        ts_raw = parsed.get("tech_stack", [])
        cap_raw = parsed.get("capability", [])
        if not isinstance(ts_raw, list) or not isinstance(cap_raw, list):
            return ClassifyResult(
                elapsed_s=time.monotonic() - t0,
                error="schema: fields must be arrays",
            )

        ts_allowed = set(available_tech_stack)
        cap_allowed = set(available_capability)

        tech_stack = [str(t) for t in ts_raw if isinstance(t, str) and t in ts_allowed]
        capability = [str(c) for c in cap_raw if isinstance(c, str) and c in cap_allowed]

        # de-dup while preserving order
        tech_stack = list(dict.fromkeys(tech_stack))
        capability = list(dict.fromkeys(capability))

        return ClassifyResult(
            tech_stack=tech_stack,
            capability=capability,
            elapsed_s=time.monotonic() - t0,
            error=None,
        )
