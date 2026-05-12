from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response, status

from app.deps import RequiredUserId, SessionDep
from app.schemas.message import MarkReadRequest, Message, MessagePage, SendMessageRequest
from app.services.chat import ChatService

router = APIRouter(tags=["Messages"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"


@router.get("/messages/with/{peer_id}", response_model=MessagePage)
async def list_messages_with_peer(
    user_id: RequiredUserId,
    session: SessionDep,
    peer_id: Annotated[str, Path(pattern=ULID_RE)],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> MessagePage:
    return await ChatService(session).list_messages(
        user_id, peer_id, cursor=cursor, limit=limit
    )


@router.post("/messages", response_model=Message, status_code=status.HTTP_201_CREATED)
async def send_message(
    user_id: RequiredUserId,
    session: SessionDep,
    body: SendMessageRequest,
    request: Request,
) -> Message:
    chat = ChatService(session)
    msg = await chat.send_message(user_id, body.recipient_id, body.content, body.client_id)
    await session.commit()
    # Fan out to peer via WS.
    hub = request.app.state.ws_hub
    seq = await hub.next_seq(body.recipient_id)
    await hub.send_to_user(
        body.recipient_id,
        {
            "type": "message.new",
            "event_version": 1,
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "seq": seq,
            "message": msg.model_dump(mode="json"),
        },
    )
    return msg


@router.post("/messages/with/{peer_id}/read", status_code=204)
async def mark_messages_read(
    user_id: RequiredUserId,
    session: SessionDep,
    peer_id: Annotated[str, Path(pattern=ULID_RE)],
    body: MarkReadRequest,
    request: Request,
) -> Response:
    chat = ChatService(session)
    n = await chat.mark_read(user_id, peer_id, body.up_to_message_id)
    await session.commit()
    if n > 0:
        hub = request.app.state.ws_hub
        seq = await hub.next_seq(peer_id)
        await hub.send_to_user(
            peer_id,
            {
                "type": "message.read",
                "event_version": 1,
                "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "seq": seq,
                "reader_id": user_id,
                "up_to_message_id": body.up_to_message_id,
            },
        )
    return Response(status_code=204)


@router.post("/messages/{message_id}/recall", response_model=Message)
async def recall_message(
    user_id: RequiredUserId,
    session: SessionDep,
    message_id: Annotated[str, Path(pattern=ULID_RE)],
    request: Request,
) -> Message:
    chat = ChatService(session)
    msg = await chat.recall_message(user_id, message_id)
    await session.commit()
    hub = request.app.state.ws_hub
    seq = await hub.next_seq(msg.recipient_id)
    await hub.send_to_user(
        msg.recipient_id,
        {
            "type": "message.updated",
            "event_version": 1,
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "seq": seq,
            "message": msg.model_dump(mode="json"),
        },
    )
    return msg
