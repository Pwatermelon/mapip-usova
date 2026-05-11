"""Разрешение объекта карты: онтология (отрицательные id) или строка в PostgreSQL (положительные)."""

from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import MapObject
from app.ontology_service import get_graph, list_map_objects_from_ontology


def ontology_objects_cached() -> list[dict[str, Any]]:
    g = get_graph(settings.ontology_path)
    if not g:
        return []
    return list_map_objects_from_ontology(g)


def resolve_map_object_dict(db: Session, object_id: int) -> dict[str, Any] | None:
    """
    Каноническое представление объекта для UI: в первую очередь из онтологии.
    Положительный id из БД: если у строки MapObject тот же IRI, что у индивида в RDF — отдаём
    запись из онтологии (те же id/x/y, что и на карте), а не «сырой» MapObject.
    """
    from app.serializers import map_object_to_json

    objs = ontology_objects_cached()
    by_id: dict[int, dict[str, Any]] = {}
    by_iri: dict[str, dict[str, Any]] = {}
    for o in objs:
        oid = o.get("id")
        if oid is not None:
            try:
                by_id[int(oid)] = o
            except (TypeError, ValueError):
                pass
        iri = (o.get("iri") or "").strip()
        if iri:
            by_iri[iri] = o

    if object_id in by_id:
        return by_id[object_id]

    if object_id > 0:
        m = db.query(MapObject).filter(MapObject.Id == object_id).first()
        if not m:
            return None
        iri = (m.IRI or "").strip()
        if iri and iri in by_iri:
            return by_iri[iri]
        return map_object_to_json(m)

    return None


def map_object_exists(db: Session, object_id: int) -> bool:
    return resolve_map_object_dict(db, object_id) is not None


def list_recommendation_objects(limit: int = 200) -> list[dict[str, Any]]:
    """Публичные подборки: только онтология, без выборки из MapObject."""
    objs = ontology_objects_cached()
    return objs[:limit] if limit else objs


def filter_ontology_objects(
    objs: list[dict[str, Any]],
    categories: list[str],
    _accessibility_elements: list[str],
) -> list[dict[str, Any]]:
    """
    Грубая фильтрация по типу (категория в онтологии = поле type).
    Элементы доступности в плоском списке объектов нет — при непустом списке не отсекаем всё.
    """
    out = objs
    if categories:
        cats = [c.strip().lower() for c in categories if c and str(c).strip()]
        if cats:
            out = [
                o
                for o in out
                if any(
                    c in (o.get("type") or "").lower() or c in (o.get("display_name") or "").lower()
                    for c in cats
                )
            ]
    # В плоском списке объектов нет полей доступности по элементам — не отсекаем по ним.
    return out
