from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from app.deps import OptionalUserId, RequiredUserId, SessionDep
from app.schemas.comment import Comment, CommentList, CreateCommentRequest
from app.services.comments import CommentService

router = APIRouter(prefix="/comments", tags=["Comments"])

ULID_RE = r"^[0-9A-HJKMNP-TV-Z]{26}$"


@router.get("", response_model=CommentList)
async def list_comments(
    session: SessionDep,
    resource_type: Annotated[str, Query(min_length=1, max_length=50)],
    resource_id: Annotated[str, Query(pattern=ULID_RE)],
    user_id: OptionalUserId = None,
) -> CommentList:
    # anonymous read allowed; user_id ignored on read
    del user_id
    return await CommentService(session).list_for_resource(resource_type, resource_id)


@router.post("", response_model=Comment, status_code=status.HTTP_201_CREATED)
async def create_comment(
    user_id: RequiredUserId,
    session: SessionDep,
    body: CreateCommentRequest,
) -> Comment:
    result = await CommentService(session).create(user_id, body)
    await session.commit()
    return result


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    user_id: RequiredUserId,
    session: SessionDep,
    comment_id: Annotated[str, Path(pattern=ULID_RE)],
) -> Response:
    await CommentService(session).soft_delete(user_id, comment_id)
    await session.commit()
    return Response(status_code=204)
