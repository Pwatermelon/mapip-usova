from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.map_object_resolve import map_object_exists
from app.models import MapObject, Route
from app.serializers import route_with_status

router = APIRouter(prefix="/api/routes", tags=["routes-db"])


@router.get("/GetRoutesWithDataStatus")
def routes_with_status(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(Route).options(selectinload(Route.list_objects)).all()
    return [route_with_status(r, db) for r in rows]


@router.post("/AddRoute")
def add_route(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    user_id = int(body.get("userId"))
    map_object_id = int(body.get("mapObjectId"))
    date = str(body.get("date") or "")
    if not map_object_exists(db, map_object_id):
        return {"message": "object not found"}
    r = Route(Date=date, UserId=user_id)
    if map_object_id > 0:
        obj = db.query(MapObject).filter(MapObject.Id == map_object_id).first()
        if obj:
            r.list_objects = [obj]
    else:
        r.LinkedMapObjectId = map_object_id
    db.add(r)
    db.commit()
    return {"message": "ok", "routeId": r.Id}
