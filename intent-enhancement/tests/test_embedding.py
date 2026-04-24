"""Embedding client / cache / VectorStore 降级路径单测。"""

import io
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from retrieval.embedding_client import OllamaEmbeddingClient, OllamaEmbeddingError
from retrieval.embedding_cache import EmbeddingCache
from retrieval.hybrid_engine import VectorStore


def _fake_http_response(status: int, body_obj: dict):
    """构造一个 mock http.client response 对象。"""
    resp = MagicMock()
    resp.status = status
    resp.read.return_value = json.dumps(body_obj).encode("utf-8")
    return resp


class TestOllamaEmbeddingClient(unittest.TestCase):
    def test_embed_single(self):
        client = OllamaEmbeddingClient(
            host_url="http://127.0.0.1:11435",
            model="bge-m3",
            timeout_s=1.0,
        )
        fake_resp = _fake_http_response(200, {"embeddings": [[0.1, 0.2, 0.3]]})
        with patch("retrieval.embedding_client.http.client.HTTPConnection") as conn_cls:
            conn = MagicMock()
            conn.getresponse.return_value = fake_resp
            conn_cls.return_value = conn

            vec = client.embed("hello")

        self.assertEqual(vec, [0.1, 0.2, 0.3])
        self.assertEqual(client.dimension, 3)

    def test_embed_batch(self):
        client = OllamaEmbeddingClient(host_url="http://127.0.0.1:11435")
        fake_resp = _fake_http_response(
            200, {"embeddings": [[1.0, 2.0], [3.0, 4.0]]}
        )
        with patch("retrieval.embedding_client.http.client.HTTPConnection") as conn_cls:
            conn = MagicMock()
            conn.getresponse.return_value = fake_resp
            conn_cls.return_value = conn

            vecs = client.embed_batch(["a", "b"])

        self.assertEqual(vecs, [[1.0, 2.0], [3.0, 4.0]])

    def test_embed_batch_empty(self):
        client = OllamaEmbeddingClient()
        self.assertEqual(client.embed_batch([]), [])

    def test_embed_http_error(self):
        client = OllamaEmbeddingClient()
        fake_resp = _fake_http_response(500, {})
        fake_resp.read.return_value = b"internal error"
        with patch("retrieval.embedding_client.http.client.HTTPConnection") as conn_cls:
            conn = MagicMock()
            conn.getresponse.return_value = fake_resp
            conn_cls.return_value = conn

            with self.assertRaises(OllamaEmbeddingError):
                client.embed("x")

    def test_embed_malformed(self):
        client = OllamaEmbeddingClient()
        fake_resp = _fake_http_response(200, {"not_embeddings": []})
        with patch("retrieval.embedding_client.http.client.HTTPConnection") as conn_cls:
            conn = MagicMock()
            conn.getresponse.return_value = fake_resp
            conn_cls.return_value = conn

            with self.assertRaises(OllamaEmbeddingError):
                client.embed("x")

    def test_ping_success(self):
        client = OllamaEmbeddingClient()
        fake_resp = _fake_http_response(200, {"models": []})
        with patch("retrieval.embedding_client.http.client.HTTPConnection") as conn_cls:
            conn = MagicMock()
            conn.getresponse.return_value = fake_resp
            conn_cls.return_value = conn
            self.assertTrue(client.ping())

    def test_ping_failure_returns_false(self):
        client = OllamaEmbeddingClient()
        with patch(
            "retrieval.embedding_client.http.client.HTTPConnection",
            side_effect=ConnectionRefusedError("no daemon"),
        ):
            self.assertFalse(client.ping())


class TestEmbeddingCache(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "cache.sqlite"

    def tearDown(self):
        self.tmp.cleanup()

    def test_put_get_roundtrip(self):
        cache = EmbeddingCache(self.db, model="bge-m3")
        cache.put("hello", [0.1, 0.2, 0.3])
        got = cache.get("hello")
        self.assertIsNotNone(got)
        self.assertEqual(len(got), 3)
        for a, b in zip(got, [0.1, 0.2, 0.3]):
            self.assertAlmostEqual(a, b, places=5)
        cache.close()

    def test_get_miss(self):
        cache = EmbeddingCache(self.db, model="bge-m3")
        self.assertIsNone(cache.get("absent"))
        cache.close()

    def test_get_many(self):
        cache = EmbeddingCache(self.db, model="bge-m3")
        cache.put("a", [1.0, 2.0])
        cache.put("b", [3.0, 4.0])
        hits = cache.get_many(["a", "b", "c"])
        self.assertIn("a", hits)
        self.assertIn("b", hits)
        self.assertNotIn("c", hits)
        cache.close()

    def test_put_many(self):
        cache = EmbeddingCache(self.db, model="bge-m3")
        cache.put_many([("x", [1.0]), ("y", [2.0])])
        self.assertIsNotNone(cache.get("x"))
        self.assertIsNotNone(cache.get("y"))
        cache.close()

    def test_model_switch_invalidates(self):
        """不同 model 生成的 key 不会互相命中（天然隔离）。"""
        c1 = EmbeddingCache(self.db, model="model-a")
        c1.put("hello", [1.0, 2.0])
        c1.close()

        c2 = EmbeddingCache(self.db, model="model-b")
        self.assertIsNone(c2.get("hello"))
        c2.close()


class TestVectorStoreFallback(unittest.TestCase):
    def test_ping_fail_falls_back_to_hash(self):
        client = MagicMock(spec=OllamaEmbeddingClient)
        client.ping.return_value = False
        client.host_url = "http://fake"
        client.model = "bge-m3"

        store = VectorStore(embedding_client=client)
        self.assertEqual(store.backend, "hash")

        # hash backend 下 create_embedding 仍可用，固定 384 维
        vec = store.create_embedding("hello")
        self.assertEqual(len(vec), VectorStore.HASH_DIM)

    def test_disable_ollama_flag(self):
        store = VectorStore(disable_ollama=True)
        self.assertEqual(store.backend, "hash")
        # 不应尝试初始化 client / cache
        self.assertIsNone(store._client)
        self.assertIsNone(store._cache)

    def test_ollama_backend_uses_cache(self):
        """ping=True 走 ollama 分支；cache 命中时不再调 client.embed。"""
        client = MagicMock(spec=OllamaEmbeddingClient)
        client.ping.return_value = True
        client.host_url = "http://fake"
        client.model = "bge-m3"

        with tempfile.TemporaryDirectory() as tmp:
            cache = EmbeddingCache(Path(tmp) / "c.sqlite", model="bge-m3")
            cache.put("hello", [0.5, 0.5])

            store = VectorStore(embedding_client=client, cache=cache)
            self.assertEqual(store.backend, "ollama")

            vec = store.create_embedding("hello")
            self.assertEqual(vec, [0.5, 0.5])
            client.embed.assert_not_called()  # 缓存命中，零 HTTP

    def test_ollama_error_downgrades_per_call(self):
        """单次调用遇 OllamaEmbeddingError 时返回 hash 向量，不破坏 backend 标志。"""
        client = MagicMock(spec=OllamaEmbeddingClient)
        client.ping.return_value = True
        client.host_url = "http://fake"
        client.model = "bge-m3"
        client.embed.side_effect = OllamaEmbeddingError("boom")

        with tempfile.TemporaryDirectory() as tmp:
            cache = EmbeddingCache(Path(tmp) / "c.sqlite", model="bge-m3")
            store = VectorStore(embedding_client=client, cache=cache)

            vec = store.create_embedding("fresh-text")
            self.assertEqual(len(vec), VectorStore.HASH_DIM)
            self.assertEqual(store.backend, "ollama")  # 标志不变


if __name__ == "__main__":
    unittest.main()
