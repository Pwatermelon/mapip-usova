from typing import Any

from sqlalchemy.orm import Session

from app.map_object_resolve import resolve_map_object_dict
from app.models import Comment, MapObject, Route


def map_object_to_json(m: MapObject) -> dict[str, Any]:
    return {
        "id": m.Id,
        "x": m.X,
        "y": m.Y,
        "display_name": m.Display_name,
        "iri": m.IRI,
        "adress": m.Adress,
        "description": m.Description,
        "images": m.Images,
        "type": m.Type,
        "rating": m.Rating,
        "workingHours": m.WorkingHours,
        "createdAt": m.CreatedAt.isoformat() if m.CreatedAt else None,
        "updatedAt": m.UpdatedAt.isoformat() if m.UpdatedAt else None,
    }


def user_public(u) -> dict[str, Any]:
    return {
        "id": u.Id,
        "name": u.Name,
        "type": u.Type,
        "email": u.Email,
        "score": u.Score,
        "isAdmin": bool(getattr(u, "IsAdmin", False)),
    }


def comment_to_json(c: Comment, db: Session, map_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    mo = map_payload if map_payload is not None else resolve_map_object_dict(db, c.MapObjectId)
    return {
        "id": c.Id,
        "text": c.Text,
        "rate": c.Rate,
        "userId": c.UserId,
        "date": c.Date.isoformat() if c.Date else None,
        "mapObjectId": c.MapObjectId,
        "user": user_public(c.user) if c.user else None,
        "mapObject": mo,
    }


def route_with_status(r: Route, db: Session) -> dict[str, Any]:
    objs = r.list_objects or []
    list_objects = [
        {
            "id": o.Id,
            "x": o.X,
            "y": o.Y,
            "displayName": o.Display_name,
        }
        for o in objs
    ]
    if not list_objects and r.LinkedMapObjectId is not None:
        d = resolve_map_object_dict(db, r.LinkedMapObjectId)
        if d:
            list_objects = [
                {
                    "id": d["id"],
                    "x": d["x"],
                    "y": d["y"],
                    "displayName": d.get("display_name"),
                }
            ]
    count = len(list_objects)
    return {
        "id": r.Id,
        "date": r.Date,
        "userId": r.UserId,
        "hasAccessibilityData": count > 0,
        "objectsCount": count,
        "listObjects": list_objects,
    }
