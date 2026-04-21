"""Unit tests for Classifier.

Uses a local stdlib HTTP server to mock the ollama /api/chat endpoint.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from skill_catalog.classifier import Classifier, ClassifierConfig


class _MockHandler(BaseHTTPRequestHandler):
    response_body: bytes = b""
    status: int = 200
    delay_s: float = 0.0
    captured_requests: list[dict] = []

    def log_message(self, format, *args):  # noqa: A002
        return

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            _MockHandler.captured_requests.append(json.loads(raw))
        except Exception:
            _MockHandler.captured_requests.append({"_raw": raw.decode("utf-8", "replace")})

        if _MockHandler.delay_s:
            import time
            time.sleep(_MockHandler.delay_s)

        self.send_response(_MockHandler.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(_MockHandler.response_body)))
        self.end_headers()
        self.wfile.write(_MockHandler.response_body)


@pytest.fixture
def mock_server():
    _MockHandler.response_body = b""
    _MockHandler.status = 200
    _MockHandler.delay_s = 0.0
    _MockHandler.captured_requests = []

    server = HTTPServer(("127.0.0.1", 0), _MockHandler)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}", _MockHandler
    finally:
        server.shutdown()
        server.server_close()


def _chat_response(content_obj: dict) -> bytes:
    return json.dumps({"message": {"content": json.dumps(content_obj)}}).encode("utf-8")


def test_classify_success(mock_server):
    url, handler = mock_server
    handler.response_body = _chat_response(
        {"tech_stack": ["react", "antd"], "capability": ["ui-form"]}
    )
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))

    result = clf.classify(
        user_prompt="登录表单",
        fingerprint_summary="(空)",
        available_tech_stack=["react", "antd", "django"],
        available_capability=["ui-form", "auth"],
    )

    assert result.error is None
    assert result.tech_stack == ["react", "antd"]
    assert result.capability == ["ui-form"]
    assert result.elapsed_s >= 0
    # Verify request payload shape
    req = handler.captured_requests[0]
    assert req["think"] is False
    assert req["stream"] is False
    assert req["options"]["temperature"] == 0
    assert req["format"]["type"] == "object"


def test_classify_filters_out_of_universe_tags(mock_server):
    url, handler = mock_server
    handler.response_body = _chat_response(
        {
            "tech_stack": ["react", "bogus-framework", "antd"],
            "capability": ["ui-form", "invented-cap"],
        }
    )
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))

    result = clf.classify(
        user_prompt="q",
        fingerprint_summary="",
        available_tech_stack=["react", "antd"],
        available_capability=["ui-form"],
    )

    assert result.error is None
    assert result.tech_stack == ["react", "antd"]
    assert result.capability == ["ui-form"]


def test_classify_dedup(mock_server):
    url, handler = mock_server
    handler.response_body = _chat_response(
        {"tech_stack": ["react", "react"], "capability": []}
    )
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))
    result = clf.classify("q", "", ["react"], [])
    assert result.tech_stack == ["react"]


def test_classify_timeout(mock_server):
    url, handler = mock_server
    handler.delay_s = 1.0
    handler.response_body = _chat_response({"tech_stack": [], "capability": []})
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=0.2))

    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert result.tech_stack == []
    assert result.capability == []


def test_classify_invalid_outer_json(mock_server):
    url, handler = mock_server
    handler.response_body = b"this is not json"
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))

    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert "outer json" in result.error


def test_classify_invalid_inner_json(mock_server):
    url, handler = mock_server
    handler.response_body = json.dumps(
        {"message": {"content": "not-valid-json"}}
    ).encode("utf-8")
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))

    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert "inner json" in result.error


def test_classify_schema_wrong_types(mock_server):
    url, handler = mock_server
    handler.response_body = json.dumps(
        {"message": {"content": json.dumps({"tech_stack": "react", "capability": []})}}
    ).encode("utf-8")
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))

    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert "schema" in result.error


def test_classify_http_error(mock_server):
    url, handler = mock_server
    handler.status = 500
    handler.response_body = b"server boom"
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))

    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert "http 500" in result.error


def test_classify_connection_refused():
    # Pick a port that's almost certainly closed.
    clf = Classifier(
        ClassifierConfig(host_url="http://127.0.0.1:1", timeout_s=1.0)
    )
    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert result.tech_stack == []
    assert result.capability == []


def test_classify_missing_content_field(mock_server):
    url, handler = mock_server
    handler.response_body = json.dumps({"message": {}}).encode("utf-8")
    clf = Classifier(ClassifierConfig(host_url=url, timeout_s=3.0))
    result = clf.classify("q", "", ["react"], [])
    assert result.error is not None
    assert "message.content" in result.error
