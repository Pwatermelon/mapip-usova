import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.map_object_resolve import resolve_map_object_dict
from app.ontology_service import get_graph, list_map_objects_from_ontology

router = APIRouter(tags=["map-objects"])
log = logging.getLogger(__name__)


def _require_ontology_list() -> list[dict[str, Any]]:
    """Список объектов карты только из RDF/XML; без файла графа — ошибка, а не пустой массив «как из БД»."""
    g = get_graph(settings.ontology_path)
    if not g:
        raise HTTPException(
            status_code=503,
            detail="Онтология не загружена: проверьте ONTOLOGY_PATH и наличие RDF в образе / контейнере.",
        )
    try:
        return list_map_objects_from_ontology(g)
    except Exception as e:
        log.exception("GetSocialMapObject: ошибка SPARQL/разбора списка из онтологии")
        msg = f"{type(e).__name__}: {e!s}"
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка чтения объектов из онтологии. {msg[:400]}",
        ) from e


@router.get("/GetSocialMapObject")
def get_social_map_objects() -> list[dict[str, Any]]:
    return _require_ontology_list()


@router.get("/api/SocialMapObject/GetSocialMapObjectById/{obj_id}")
def get_by_id(obj_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Сначала онтология (включая совпадение по IRI для старых положительных id в БД)."""
    row = resolve_map_object_dict(db, obj_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.get("/api/SocialMapObject/SearchBy/")
def search_by(search: str | None = None) -> list[dict[str, Any]]:
    merged = _require_ontology_list()
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
