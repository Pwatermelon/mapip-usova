from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import MapObject
from app.serializers import map_object_to_json

router = APIRouter(tags=["map-objects"])


@router.get("/GetSocialMapObject")
def get_social_map_objects(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(MapObject).all()
    return [map_object_to_json(m) for m in rows]


@router.get("/api/SocialMapObject/GetSocialMapObjectById/{obj_id}")
def get_by_id(obj_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    m = db.query(MapObject).filter(MapObject.Id == obj_id).first()
    if not m:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")
    return map_object_to_json(m)


@router.get("/api/SocialMapObject/SearchBy/")
def search_by(search: str | None = None, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    q = db.query(MapObject)
    if search and search.strip():
        s = f"%{search.strip().lower()}%"
        q = q.filter(
            or_(
                func.lower(MapObject.Display_name).like(s),
                func.lower(MapObject.Adress).like(s),
            )
        )
    return [map_object_to_json(m) for m in q.all()]
