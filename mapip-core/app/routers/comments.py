from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Comment, MapObject, User
from app.serializers import comment_to_json

router = APIRouter(prefix="/api/comment", tags=["comments"])


class AddCommentFlexible(BaseModel):
    """Совместимость с разными клиентами (старый map.js и DTO C#)."""

    new_text: str | None = Field(None, alias="newText")
    new_rate: int | None = Field(None, alias="newRate")
    user: int | None = None
    map_object: int | None = Field(None, alias="mapObject")
    text: str | None = None
    rate: int | str | None = None
    user_id: int | None = Field(None, alias="userId")
    map_object_id: int | None = Field(None, alias="mapObjectId")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def normalize(self):
        text = self.new_text or self.text
        if not text or not str(text).strip():
            raise ValueError("empty text")
        uid = self.user if self.user is not None else self.user_id
        mid = self.map_object if self.map_object is not None else self.map_object_id
        if uid is None or mid is None:
            raise ValueError("user and mapObject required")
        r = self.new_rate if self.new_rate is not None else self.rate
        if r is None:
            raise ValueError("rate required")
        rate = int(r)
        self._resolved = (str(text).strip(), rate, int(uid), int(mid))
        return self

    def resolved(self) -> tuple[str, int, int, int]:
        return getattr(self, "_resolved")


@router.get("/GetCommentsByMapObject/{map_object_id}")
def get_comments(map_object_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = (
        db.query(Comment)
        .options(joinedload(Comment.user), joinedload(Comment.map_object))
        .filter(Comment.MapObjectId == map_object_id)
        .all()
    )
    return [comment_to_json(c) for c in rows]


@router.post("/AddComment")
def add_comment(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        dto = AddCommentFlexible.model_validate(body)
        text, rate, uid, mid = dto.resolved()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not db.query(User).filter(User.Id == uid).first():
        raise HTTPException(status_code=400, detail="Пользователь не найден.")
    if not db.query(MapObject).filter(MapObject.Id == mid).first():
        raise HTTPException(status_code=400, detail="Объект карты не найден.")

    c = Comment(
        UserId=uid,
        MapObjectId=mid,
        Text=text,
        Rate=rate,
        Date=datetime.now(timezone.utc),
    )
    db.add(c)
    db.commit()
    return {"message": "Комментарий добавлен успешно!", "isOffensive": False}
