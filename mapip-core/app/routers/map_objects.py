from typing import Any

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.ontology_service import get_graph, list_map_objects_from_ontology

router = APIRouter(tags=["map-objects"])


def _objects_from_ontology_only() -> list[dict[str, Any]]:
    """Только RDF/XML онтология — без PostgreSQL MapObject (как задумано для карты)."""
    g = get_graph(settings.ontology_path)
    if not g:
        return []
    return list_map_objects_from_ontology(g)


@router.get("/GetSocialMapObject")
def get_social_map_objects() -> list[dict[str, Any]]:
    return _objects_from_ontology_only()


@router.get("/api/SocialMapObject/GetSocialMapObjectById/{obj_id}")
def get_by_id(obj_id: int) -> dict[str, Any]:
    g = get_graph(settings.ontology_path)
    if not g:
        raise HTTPException(status_code=404, detail="Not found")
    for o in list_map_objects_from_ontology(g):
        if o.get("id") == obj_id:
            return o
    raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/SocialMapObject/SearchBy/")
def search_by(search: str | None = None) -> list[dict[str, Any]]:
    merged = _objects_from_ontology_only()
    if not search or not search.strip():
        return merged
    s = search.strip().lower()
    return [
        o
        for o in merged
        if s in (o.get("display_name") or "").lower()
        or s in (o.get("adress") or "").lower()
        or s in (o.get("type") or "").lower()
    ]
