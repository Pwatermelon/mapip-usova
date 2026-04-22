from typing import Any

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
    }


def comment_to_json(c: Comment) -> dict[str, Any]:
    return {
        "id": c.Id,
        "text": c.Text,
        "rate": c.Rate,
        "userId": c.UserId,
        "date": c.Date.isoformat() if c.Date else None,
        "mapObjectId": c.MapObjectId,
        "user": user_public(c.user) if c.user else None,
        "mapObject": map_object_to_json(c.map_object) if c.map_object else None,
    }


def route_with_status(r: Route) -> dict[str, Any]:
    objs = r.list_objects or []
    return {
        "id": r.Id,
        "date": r.Date,
        "userId": r.UserId,
        "hasAccessibilityData": len(objs) > 0,
        "objectsCount": len(objs),
        "listObjects": [
            {
                "id": o.Id,
                "x": o.X,
                "y": o.Y,
                "displayName": o.Display_name,
            }
            for o in objs
        ],
    }
