from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path

from app.deps import RequiredUserId, SessionDep
from app.schemas.peer import Peer
from app.services.chat import ChatService

router = APIRouter(prefix="/peers", tags=["Peers"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"


@router.get("/{peer_id}", response_model=Peer)
async def get_peer(
    user_id: RequiredUserId,
    session: SessionDep,
    peer_id: Annotated[str, Path(pattern=ULID_RE)],
) -> Peer:
    del user_id
    return await ChatService(session).get_peer(peer_id)
