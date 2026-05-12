from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, Response, status

from app.deps import CurrentUserId, IdempotencyKey, SessionDep, SettingsDep
from app.schemas.message import Message, MessagePage, SendMessageRequest
from app.services.conversations import ConversationService
from app.services.messages import MessageService

router = APIRouter(prefix="/conversations/{conversation_id}/messages", tags=["Messages"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"


@router.get("", response_model=MessagePage)
async def list_messages(
    user_id: CurrentUserId,
    session: SessionDep,
    conversation_id: Annotated[str, Path(pattern=ULID_RE)],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> MessagePage:
    return await MessageService(session).list_for_conversation(
        user_id, conversation_id, cursor=cursor, limit=limit
    )


@router.post("", response_model=Message, status_code=status.HTTP_201_CREATED)
async def send_message(
    user_id: CurrentUserId,
    session: SessionDep,
    settings: SettingsDep,
    request: Request,
    conversation_id: Annotated[str, Path(pattern=ULID_RE)],
    body: SendMessageRequest,
    idempotency_key: IdempotencyKey,
    response: Response,
) -> Message:
    msg_service = MessageService(session, idempotency_ttl_hours=settings.idempotency_ttl_hours)
    message, replay = await msg_service.send(
        user_id,
        conversation_id,
        content=body.content,
        client_id=body.client_id,
        idempotency_key=idempotency_key,
    )
    if not replay:
        await session.commit()
        conv_service = ConversationService(session)
        members = await conv_service.participants(conversation_id)
        events = request.app.state.event_publisher
        for recipient in members:
            conv_summary = await conv_service.get(recipient, conversation_id)
            await events.message_new(
                [recipient],
                message.model_dump(mode="json"),
                {
                    "id": conv_summary.id,
                    "unread_count": conv_summary.unread_count,
                    "last_activity_at": conv_summary.last_activity_at.isoformat(),
                },
            )
    if replay:
        response.headers["Idempotent-Replay"] = "true"
    return message
