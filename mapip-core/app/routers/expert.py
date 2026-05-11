"""Модерация объектов на карте (legacy ExpertController)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import MapObject, PendingSocialMapObject

router = APIRouter(tags=["expert"])


def _pending_to_json(p: PendingSocialMapObject) -> dict[str, Any]:
    return {
        "id": p.Id,
        "displayName": p.DisplayName,
        "address": p.Address,
        "x": p.X,
        "y": p.Y,
        "type": p.Type,
        "description": p.Description,
        "disabilityCategory": p.DisabilityCategory,
        "workingHours": p.WorkingHours,
        "images": p.Images,
        "accessibility": p.Accessibility,
        "excluded": p.Excluded,
        "mapObjectId": p.MapObjectLinkId,
        "dateAdded": p.DateAdded.isoformat() if p.DateAdded else None,
        "status": p.Status,
        "userId": p.UserId,
    }


class PendingEditBody(BaseModel):
    displayName: str | None = None
    address: str | None = None
    description: str | None = None
    disabilityCategory: str | None = None
    workingHours: str | None = None
    accessibility: str | None = None


@router.get("/api/Expert/pending")
def get_pending_objects(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    try:
        rows = (
            db.query(PendingSocialMapObject)
            .filter(PendingSocialMapObject.Status == "Pending")
            .order_by(PendingSocialMapObject.DateAdded.desc())
            .all()
        )
        return [_pending_to_json(p) for p in rows]
    except SQLAlchemyError:
        return []


@router.post("/api/Expert/{obj_id}/approve")
def approve_object(obj_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    p = db.query(PendingSocialMapObject).filter(PendingSocialMapObject.Id == obj_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    now = datetime.now(timezone.utc)
    iri = f"urn:mapip:approved-pending:{p.Id}:{int(now.timestamp())}"
    m = MapObject(
        X=float(p.X or 0.0),
        Y=float(p.Y or 0.0),
        Display_name=p.DisplayName,
        IRI=iri,
        Adress=p.Address,
        Description=p.Description or "",
        Images=p.Images or "Нет изображения",
        Type=p.Type,
        Rating=0,
        WorkingHours=p.WorkingHours,
        CreatedAt=now,
        UpdatedAt=now,
    )
    db.add(m)
    p.Status = "Approved"
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "ok"}


@router.post("/api/Expert/{obj_id}/reject")
def reject_object(obj_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    p = db.query(PendingSocialMapObject).filter(PendingSocialMapObject.Id == obj_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    p.Status = "Rejected"
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "ok"}


@router.put("/api/Expert/{obj_id}/edit")
def edit_pending_object(obj_id: int, body: PendingEditBody, db: Session = Depends(get_db)) -> dict[str, str]:
    p = db.query(PendingSocialMapObject).filter(PendingSocialMapObject.Id == obj_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if body.displayName is not None:
        p.DisplayName = body.displayName
    if body.address is not None:
        p.Address = body.address
    if body.description is not None:
        p.Description = body.description
    if body.disabilityCategory is not None:
        p.DisabilityCategory = body.disabilityCategory
    if body.workingHours is not None:
        p.WorkingHours = body.workingHours
    if body.accessibility is not None:
        p.Accessibility = body.accessibility
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "ok"}
