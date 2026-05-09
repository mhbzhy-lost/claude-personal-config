from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture(scope="module")
def sync_client(settings: Settings) -> TestClient:
    """Sync TestClient — httpx lacks ASGI WS support."""
    return TestClient(create_app(settings))


def test_ws_rejects_unauthenticated(sync_client: TestClient) -> None:
    with pytest.raises(Exception):
        with sync_client.websocket_connect("/v1/ws"):
            pass


def test_ws_rejects_invalid_dev_user(sync_client: TestClient) -> None:
    with pytest.raises(Exception):
        with sync_client.websocket_connect(
            "/v1/ws", headers={"X-Dev-User-Id": "not-a-ulid"}
        ):
            pass
