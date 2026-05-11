"""Статистика модерации и объектов карты."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import MapObject, PendingSocialMapObject

router = APIRouter(tags=["statistics"])


@router.get("/api/Statistics")
def get_statistics(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Счётчики очереди модерации и объектов карты (как в старом Statistics API)."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    try:
        pending_count = (
            db.query(PendingSocialMapObject).filter(PendingSocialMapObject.Status == "Pending").count()
        )
        added_count = db.query(MapObject).filter(MapObject.CreatedAt >= cutoff).count()
        deleted_count = (
            db.query(PendingSocialMapObject).filter(PendingSocialMapObject.Status == "Rejected").count()
        )
    except SQLAlchemyError:
        return {
            "pending": 0,
            "added": 0,
            "deleted": 0,
            "history": [],
        }

    history: list[dict[str, Any]] = []
    for i in range(30):
        day = (now - timedelta(days=i)).date()
        # Начало суток в UTC (раньше ошибочно передавали date вместо day.day → 500 у всего endpoint).
        day_start = datetime.combine(day, time.min, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        try:
            added = (
                db.query(MapObject)
                .filter(MapObject.CreatedAt >= day_start, MapObject.CreatedAt < day_end)
                .count()
            )
            deleted = (
                db.query(PendingSocialMapObject)
                .filter(
                    PendingSocialMapObject.Status == "Rejected",
                    PendingSocialMapObject.DateAdded >= day_start,
                    PendingSocialMapObject.DateAdded < day_end,
                )
                .count()
            )
            pend_day = (
                db.query(PendingSocialMapObject)
                .filter(
                    PendingSocialMapObject.Status == "Pending",
                    PendingSocialMapObject.DateAdded >= day_start,
                    PendingSocialMapObject.DateAdded < day_end,
                )
                .count()
            )
        except SQLAlchemyError:
            added = deleted = pend_day = 0
        history.append(
            {
                "date": day.isoformat(),
                "added": added,
                "deleted": deleted,
                "pending": pend_day,
            }
        )

    return {
        "pending": pending_count,
        "added": added_count,
        "deleted": deleted_count,
        "history": history,
    }
