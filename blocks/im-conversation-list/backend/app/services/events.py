from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

from app.ws.hub import WSHub

EVENT_VERSION = 1


class EventPublisher:
    def __init__(self, hub: WSHub) -> None:
        self._hub = hub

    async def _send(self, user_ids: Iterable[str], event_type: str, body: dict[str, Any]) -> None:
        async def factory(user_id: str) -> dict[str, Any]:
            seq = await self._hub.next_seq(user_id)
            return {
                "type": event_type,
                "event_version": EVENT_VERSION,
                "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "seq": seq,
                **body,
            }

        await self._hub.send_to_users(user_ids, factory)

    async def message_new(
        self,
        recipients: Iterable[str],
        message: dict[str, Any],
        conversation_summary: dict[str, Any],
    ) -> None:
        await self._send(
            recipients,
            "message.new",
            {"message": message, "conversation_summary": conversation_summary},
        )

    async def message_updated(
        self, recipients: Iterable[str], message: dict[str, Any]
    ) -> None:
        await self._send(recipients, "message.updated", {"message": message})

    async def message_read(
        self,
        recipients: Iterable[str],
        conversation_id: str,
        reader_id: str,
        up_to_message_id: str,
    ) -> None:
        await self._send(
            recipients,
            "message.read",
            {
                "conversation_id": conversation_id,
                "reader_id": reader_id,
                "up_to_message_id": up_to_message_id,
            },
        )

    async def conversation_created(
        self, recipients: Iterable[str], conversation: dict[str, Any]
    ) -> None:
        await self._send(recipients, "conversation.created", {"conversation": conversation})

    async def conversation_updated(
        self,
        recipients: Iterable[str],
        conversation: dict[str, Any],
        changed_fields: list[str],
    ) -> None:
        await self._send(
            recipients,
            "conversation.updated",
            {"conversation": conversation, "changed_fields": changed_fields},
        )

    async def conversation_deleted(
        self, recipients: Iterable[str], conversation_id: str
    ) -> None:
        await self._send(
            recipients,
            "conversation.deleted",
            {"conversation_id": conversation_id},
        )
