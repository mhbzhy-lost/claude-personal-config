from __future__ import annotations

import asyncio
from collections.abc import Iterable
from typing import Any

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


class WSHub:
    """In-process WebSocket fan-out keyed by user_id.

    For multi-instance deployments, replace with a Redis pub/sub adapter that
    implements the same interface. The rest of the app depends only on
    `register`, `unregister`, `send_to_user`, and `send_to_users`.
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._seq: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def register(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(ws)
        logger.debug("ws.register", user_id=user_id, count=len(self._connections[user_id]))

    async def unregister(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(user_id)
            if not conns:
                return
            conns.discard(ws)
            if not conns:
                del self._connections[user_id]
        logger.debug("ws.unregister", user_id=user_id)

    async def next_seq(self, user_id: str) -> int:
        async with self._lock:
            self._seq[user_id] = self._seq.get(user_id, 0) + 1
            return self._seq[user_id]

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.get(user_id, ()))
        await self._broadcast(targets, payload)

    async def send_to_users(
        self, user_ids: Iterable[str], payload_factory: Any
    ) -> None:
        """Send a per-user payload (factory called with user_id, returns dict).

        Useful when each recipient needs a personalized envelope (e.g. their
        own seq number).
        """
        async with self._lock:
            target_map = {
                uid: list(self._connections.get(uid, ()))
                for uid in user_ids
            }
        for uid, targets in target_map.items():
            if not targets:
                continue
            if asyncio.iscoroutinefunction(payload_factory):
                payload = await payload_factory(uid)
            else:
                payload = payload_factory(uid)
            await self._broadcast(targets, payload)

    async def _broadcast(self, targets: list[WebSocket], payload: dict[str, Any]) -> None:
        if not targets:
            return
        results = await asyncio.gather(
            *(self._safe_send(ws, payload) for ws in targets),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                logger.warning("ws.send_failed", error=str(r))

    @staticmethod
    async def _safe_send(ws: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await ws.send_json(payload)
        except Exception:
            try:
                await ws.close()
            except Exception:
                pass
            raise

    @property
    def connected_user_count(self) -> int:
        return len(self._connections)
