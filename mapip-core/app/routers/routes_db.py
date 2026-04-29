from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import MapObject, Route, route_map_object
from app.serializers import route_with_status

router = APIRouter(prefix="/api/routes", tags=["routes-db"])


@router.get("/GetRoutesWithDataStatus")
def routes_with_status(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(Route).options(selectinload(Route.list_objects)).all()
    return [route_with_status(r) for r in rows]


@router.post("/AddRoute")
def add_route(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    user_id = int(body.get("userId"))
    map_object_id = int(body.get("mapObjectId"))
    date = str(body.get("date") or "")
    obj = db.query(MapObject).filter(MapObject.Id == map_object_id).first()
    if not obj:
        return {"message": "object not found"}
    r = Route(Date=date, UserId=user_id)
    r.list_objects = [obj]
    db.add(r)
    db.commit()
    return {"message": "ok", "routeId": r.Id}
