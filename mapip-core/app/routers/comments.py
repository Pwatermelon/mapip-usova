from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
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
def get_comments(map_object_id: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    q = db.query(Comment).options(joinedload(Comment.user), joinedload(Comment.map_object))
    if map_object_id.isdigit():
        q = q.filter(Comment.MapObjectId == int(map_object_id))
    else:
        like = f"%{map_object_id.lower()}%"
        q = q.join(MapObject, MapObject.Id == Comment.MapObjectId).filter(
            (MapObject.Display_name.ilike(like)) | (MapObject.Adress.ilike(like))
        )
    rows = q.all()
    return [comment_to_json(c) for c in rows]


@router.get("/GetCommentsByMapObject")
def get_comment_by_object_and_user(
    mapObjectId: int = Query(...),
    userId: int = Query(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = (
        db.query(Comment)
        .options(joinedload(Comment.user), joinedload(Comment.map_object))
        .filter(Comment.MapObjectId == mapObjectId, Comment.UserId == userId)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    return comment_to_json(row)


@router.get("/GetLastComments")
def get_last_comments(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = (
        db.query(Comment)
        .options(joinedload(Comment.user), joinedload(Comment.map_object))
        .order_by(Comment.Date.desc())
        .limit(80)
        .all()
    )
    return [comment_to_json(c) for c in rows]


@router.get("/GetOffensiveComments")
def get_offensive_comments(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    # Legacy moderation compatibility: lightweight эвристика вместо ML-пайплайна.
    bad_markers = ("хуй", "бля", "пизд", "еб", "сук")
    rows = (
        db.query(Comment)
        .options(joinedload(Comment.user), joinedload(Comment.map_object))
        .all()
    )
    out = [c for c in rows if any(m in (c.Text or "").lower() for m in bad_markers)]
    return [comment_to_json(c) for c in out]


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


@router.put("/EditComment/{comment_id}")
def edit_comment(comment_id: int, body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.query(Comment).filter(Comment.Id == comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    text = body.get("newText", body.get("NewText", row.Text))
    rate_raw = body.get("newRate", body.get("NewRate", row.Rate))
    try:
        rate = int(rate_raw)
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail="Некорректная оценка") from e
    row.Text = str(text or "").strip()
    row.Rate = rate
    db.commit()
    return {"message": "Комментарий обновлен"}


@router.delete("/DeleteComment/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(Comment).filter(Comment.Id == comment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    db.delete(row)
    db.commit()
    return {"message": "Комментарий удален"}
