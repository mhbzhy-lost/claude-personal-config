"""持久化 embedding 缓存（SQLite + struct BLOB）。

设计要点：
  - 单表 embeddings(key PK, model, dim, vector BLOB)
  - key = md5(model + "\\n" + text)，模型切换键不命中即等价于缓存失效
  - vector 存储为 struct.pack("<{dim}f", *floats)（little-endian float32）——
    比 JSON 体积小 ~4 倍、解析快；不引 numpy
  - WAL 模式以支持读并发（MCP server 单进程，写并发忽略）
  - put/get/get_many 三件套覆盖 VectorStore 的批量命中策略
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import struct
import threading
from pathlib import Path
from typing import Dict, Iterable, List, Optional


_SCHEMA = """
CREATE TABLE IF NOT EXISTS embeddings (
    key    TEXT PRIMARY KEY,
    model  TEXT NOT NULL,
    dim    INTEGER NOT NULL,
    vector BLOB NOT NULL
);
"""


def _make_key(model: str, text: str) -> str:
    raw = f"{model}\n{text}".encode("utf-8")
    return hashlib.md5(raw).hexdigest()


def _pack(vec: List[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def _unpack(blob: bytes, dim: int) -> List[float]:
    return list(struct.unpack(f"<{dim}f", blob))


class EmbeddingCache:
    """SQLite-backed 向量缓存，线程安全（内部 Lock 串行化写）。"""

    def __init__(self, db_path: str | os.PathLike, model: str) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._model = model
        self._lock = threading.Lock()
        # check_same_thread=False 让多个线程共享连接；用自身 Lock 保证串行
        self._conn = sqlite3.connect(
            str(self._db_path),
            check_same_thread=False,
            isolation_level=None,  # autocommit
        )
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.executescript(_SCHEMA)

    @property
    def model(self) -> str:
        return self._model

    @property
    def db_path(self) -> Path:
        return self._db_path

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.close()
            except Exception:
                pass

    # ---- single-key ---------------------------------------------------------

    def get(self, text: str) -> Optional[List[float]]:
        key = _make_key(self._model, text)
        with self._lock:
            cur = self._conn.execute(
                "SELECT dim, vector FROM embeddings WHERE key = ?",
                (key,),
            )
            row = cur.fetchone()
        if not row:
            return None
        dim, blob = row
        try:
            return _unpack(blob, int(dim))
        except struct.error:
            return None

    def put(self, text: str, vec: List[float]) -> None:
        key = _make_key(self._model, text)
        blob = _pack(vec)
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO embeddings(key, model, dim, vector) VALUES (?,?,?,?)",
                (key, self._model, len(vec), blob),
            )

    # ---- batch --------------------------------------------------------------

    def get_many(self, texts: Iterable[str]) -> Dict[str, List[float]]:
        """返回 {text: vec} 的命中子集；未命中的 text 不出现在结果里。

        注意：键是 text（原始字符串），方便调用方对照 missing 列表。
        """
        texts_list = list(texts)
        if not texts_list:
            return {}

        key_to_text: Dict[str, str] = {}
        for t in texts_list:
            key_to_text[_make_key(self._model, t)] = t

        # chunk query（避免 IN (?,?,...) 参数过多）
        results: Dict[str, List[float]] = {}
        keys = list(key_to_text.keys())
        CHUNK = 500
        with self._lock:
            for i in range(0, len(keys), CHUNK):
                chunk = keys[i : i + CHUNK]
                placeholders = ",".join("?" * len(chunk))
                cur = self._conn.execute(
                    f"SELECT key, dim, vector FROM embeddings WHERE key IN ({placeholders})",
                    chunk,
                )
                for key, dim, blob in cur.fetchall():
                    text = key_to_text.get(key)
                    if text is None:
                        continue
                    try:
                        results[text] = _unpack(blob, int(dim))
                    except struct.error:
                        continue
        return results

    def put_many(self, items: Iterable[tuple]) -> None:
        """items: iterable of (text, vec)."""
        rows = []
        for text, vec in items:
            key = _make_key(self._model, text)
            rows.append((key, self._model, len(vec), _pack(vec)))
        if not rows:
            return
        with self._lock:
            self._conn.executemany(
                "INSERT OR REPLACE INTO embeddings(key, model, dim, vector) VALUES (?,?,?,?)",
                rows,
            )
