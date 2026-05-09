from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query, Request, Response
from sqlalchemy import or_, select

from app.deps import CurrentUserId, SessionDep, SettingsDep
from app.models import Conversation as ConversationModel
from app.models import UserConversationState
from app.schemas.conversation import (
    Conversation,
    ConversationPage,
    ConversationPatch,
    MarkReadRequest,
)
from app.services.conversations import ConversationService

router = APIRouter(prefix="/conversations", tags=["Conversations"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"


@router.get("", response_model=ConversationPage)
async def list_conversations(
    user_id: CurrentUserId,
    session: SessionDep,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    filter: Annotated[
        Literal["all", "unread", "pinned", "muted", "archived"], Query()
    ] = "all",
) -> ConversationPage:
    service = ConversationService(session)
    return await service.list_for_user(
        user_id, cursor_raw=cursor, limit=limit, filter_=filter
    )


@router.get("/search", response_model=ConversationPage)
async def search_conversations(
    user_id: CurrentUserId,
    session: SessionDep,
    q: Annotated[str, Query(min_length=1, max_length=200)],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ConversationPage:
    service = ConversationService(session)
    page = await service.list_for_user(
        user_id, cursor_raw=cursor, limit=limit, filter_="all"
    )
    needle = q.lower()
    filtered = [
        c for c in page.items
        if (c.title or "").lower().find(needle) >= 0
        or (c.last_message and _content_text(c.last_message.content.model_dump()).find(needle) >= 0)
    ]
    return page.model_copy(update={"items": filtered})


def _content_text(content: dict) -> str:
    kind = content.get("kind")
    if kind == "text":
        return str(content.get("text", "")).lower()
    if kind == "system":
        return str(content.get("code", "")).lower()
    return ""


@router.get("/{conversation_id}", response_model=Conversation)
async def get_conversation(
    user_id: CurrentUserId,
    session: SessionDep,
    conversation_id: Annotated[str, Path(pattern=ULID_RE)],
) -> Conversation:
    service = ConversationService(session)
    return await service.get(user_id, conversation_id)


@router.patch("/{conversation_id}", response_model=Conversation)
async def patch_conversation(
    user_id: CurrentUserId,
    session: SessionDep,
    settings: SettingsDep,
    conversation_id: Annotated[str, Path(pattern=ULID_RE)],
    body: ConversationPatch,
    request: Request,
) -> Conversation:
    service = ConversationService(session)
    conv, changed = await service.patch_flags(
        user_id,
        conversation_id,
        is_pinned=body.is_pinned,
        is_muted=body.is_muted,
        pinned_cap=settings.pinned_cap_per_user,
    )
    await session.commit()
    if changed:
        events = request.app.state.event_publisher
        members = await service.participants(conversation_id)
        await events.conversation_updated([user_id], conv.model_dump(mode="json"), changed)
        del members
    return conv


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    user_id: CurrentUserId,
    session: SessionDep,
    conversation_id: Annotated[str, Path(pattern=ULID_RE)],
    request: Request,
) -> Response:
    service = ConversationService(session)
    await service.soft_delete(user_id, conversation_id)
    await session.commit()
    events = request.app.state.event_publisher
    await events.conversation_deleted([user_id], conversation_id)
    return Response(status_code=204)


@router.post("/{conversation_id}/read", status_code=204)
async def mark_read(
    user_id: CurrentUserId,
    session: SessionDep,
    conversation_id: Annotated[str, Path(pattern=ULID_RE)],
    body: MarkReadRequest,
    request: Request,
) -> Response:
    service = ConversationService(session)
    await service.mark_read(user_id, conversation_id, body.up_to_message_id)
    await session.commit()
    events = request.app.state.event_publisher
    members = await service.participants(conversation_id)
    await events.message_read(
        members,
        conversation_id=conversation_id,
        reader_id=user_id,
        up_to_message_id=body.up_to_message_id,
    )
    return Response(status_code=204)
