from __future__ import annotations

import asyncio
from typing import Any

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class WSHub:
    """In-process WebSocket fan-out keyed by user_id."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._seq: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def register(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(ws)

    async def unregister(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(user_id)
            if not conns:
                return
            conns.discard(ws)
            if not conns:
                del self._connections[user_id]

    async def next_seq(self, user_id: str) -> int:
        async with self._lock:
            self._seq[user_id] = self._seq.get(user_id, 0) + 1
            return self._seq[user_id]

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.get(user_id, ()))
        if not targets:
            return
        await asyncio.gather(
            *(self._safe_send(ws, payload) for ws in targets),
            return_exceptions=True,
        )

    @staticmethod
    async def _safe_send(ws: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await ws.send_json(payload)
        except Exception as exc:
            logger.warning("ws.send_failed", error=str(exc))
            try:
                await ws.close()
            except Exception:
                pass
