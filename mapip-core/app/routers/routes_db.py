from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Route
from app.serializers import route_with_status

router = APIRouter(prefix="/api/routes", tags=["routes-db"])


@router.get("/GetRoutesWithDataStatus")
def routes_with_status(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(Route).options(selectinload(Route.list_objects)).all()
    return [route_with_status(r) for r in rows]
