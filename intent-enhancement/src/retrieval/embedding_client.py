"""Ollama embedding client（stdlib-only）。

负责把文本（单条 / 批量）提交到 Ollama `/api/embed` 并返回浮点向量。
所有传输 / 解析异常统一抛 OllamaEmbeddingError，由上层（VectorStore）
决定是否降级到 hash backend。

不引入新依赖：urllib + json + http.client 足够（与 classifier 同风格）。
"""

from __future__ import annotations

import http.client
import json
import os
import socket
import time
from dataclasses import dataclass
from typing import List, Optional, Union
from urllib.parse import urlparse


class OllamaEmbeddingError(RuntimeError):
    """任何 Ollama embedding 调用失败（网络 / HTTP / JSON / schema）统一抛出。"""


@dataclass(frozen=True)
class _EmbedConfig:
    host_url: str
    model: str
    timeout_s: float


def _default_host_url() -> str:
    return os.environ.get("SKILL_CATALOG_OLLAMA_HOST", "http://127.0.0.1:11435")


def _default_model() -> str:
    return os.environ.get("SKILL_CATALOG_EMBEDDING_MODEL", "bge-m3")


class OllamaEmbeddingClient:
    """轻量 Ollama embedding HTTP 客户端。

    - 构造不做网络 IO；首次 embed/ping 才触发连接
    - dimension 在首次成功 embed 后缓存
    - batch embed 一次 HTTP 请求提交整批（Ollama /api/embed 的 input 字段支持列表）
    """

    def __init__(
        self,
        host_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout_s: float = 30.0,
    ) -> None:
        self._cfg = _EmbedConfig(
            host_url=host_url or _default_host_url(),
            model=model or _default_model(),
            timeout_s=float(timeout_s),
        )
        parsed = urlparse(self._cfg.host_url)
        self._host = parsed.hostname or "127.0.0.1"
        self._port = parsed.port or 11435
        self._scheme = parsed.scheme or "http"
        self._dimension: Optional[int] = None

    # ---- public API ---------------------------------------------------------

    @property
    def model(self) -> str:
        return self._cfg.model

    @property
    def host_url(self) -> str:
        return self._cfg.host_url

    @property
    def dimension(self) -> Optional[int]:
        """首次 embed 后的向量维度；未调用过返回 None。"""
        return self._dimension

    def ping(self, timeout_s: float = 2.0) -> bool:
        """快速探活：调用 /api/tags（轻量，不触发模型加载）。"""
        try:
            conn = self._make_conn(timeout_s)
            try:
                conn.request("GET", "/api/tags")
                resp = conn.getresponse()
                resp.read()  # drain
                return 200 <= resp.status < 300
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
        except Exception:
            return False

    def embed(self, text: str) -> List[float]:
        """单条 embed；返回向量。"""
        vecs = self._embed_impl([text])
        if len(vecs) != 1:
            raise OllamaEmbeddingError(
                f"expected 1 embedding, got {len(vecs)}"
            )
        return vecs[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量 embed；空列表直接返回 []。"""
        if not texts:
            return []
        vecs = self._embed_impl(list(texts))
        if len(vecs) != len(texts):
            raise OllamaEmbeddingError(
                f"expected {len(texts)} embeddings, got {len(vecs)}"
            )
        return vecs

    # ---- internals ----------------------------------------------------------

    def _make_conn(self, timeout_s: float) -> http.client.HTTPConnection:
        if self._scheme == "https":
            return http.client.HTTPSConnection(self._host, self._port, timeout=timeout_s)
        return http.client.HTTPConnection(self._host, self._port, timeout=timeout_s)

    def _embed_impl(self, inputs: List[str]) -> List[List[float]]:
        payload_input: Union[str, List[str]] = inputs if len(inputs) > 1 else inputs[0]
        payload = {
            "model": self._cfg.model,
            "input": payload_input,
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        t0 = time.monotonic()
        try:
            conn = self._make_conn(self._cfg.timeout_s)
            try:
                conn.request(
                    "POST",
                    "/api/embed",
                    body=body,
                    headers={"Content-Type": "application/json"},
                )
                resp = conn.getresponse()
                raw = resp.read()
                if not (200 <= resp.status < 300):
                    raise OllamaEmbeddingError(
                        f"http {resp.status}: {raw[:200].decode('utf-8', 'replace')}"
                    )
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
        except (
            ConnectionRefusedError,
            socket.timeout,
            TimeoutError,
            OSError,
            http.client.HTTPException,
        ) as e:
            raise OllamaEmbeddingError(
                f"transport: {type(e).__name__}: {e} (elapsed={time.monotonic()-t0:.2f}s)"
            ) from e

        try:
            outer = json.loads(raw.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise OllamaEmbeddingError(f"response json: {e}") from e

        if not isinstance(outer, dict):
            raise OllamaEmbeddingError("response not object")

        embeddings = outer.get("embeddings")
        if not isinstance(embeddings, list):
            raise OllamaEmbeddingError(
                f"missing/invalid 'embeddings' field: keys={list(outer.keys())}"
            )

        vecs: List[List[float]] = []
        for i, vec in enumerate(embeddings):
            if not isinstance(vec, list):
                raise OllamaEmbeddingError(f"embeddings[{i}] not list")
            try:
                vecs.append([float(x) for x in vec])
            except (TypeError, ValueError) as e:
                raise OllamaEmbeddingError(f"embeddings[{i}] non-numeric: {e}") from e

        if vecs and self._dimension is None:
            self._dimension = len(vecs[0])

        return vecs
