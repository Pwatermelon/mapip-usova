from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import MapObject
from app.serializers import map_object_to_json

router = APIRouter(tags=["legacy-compat"])

_INFRA = {
    "Культура": ["Библиотека", "Музей", "Театр", "Кинотеатр"],
    "Еда": ["Кофейня", "Ресторан", "Бистро"],
    "Шопинг": ["Супермаркет", "Торговый центр", "Минимаркет"],
    "Красота": ["Салон красоты", "Парикмахерская"],
    "Туризм": ["Гостиница", "Туристическая база", "Пляж"],
}
_ACCESS = [
    "Пандус",
    "Лифт",
    "Тактильная плитка",
    "Широкий вход",
    "Кнопка вызова персонала",
    "Парковка для МГН",
]
_SETTINGS: dict[str, Any] = {
    "rnValue": 4,
    "cronExpression": "0 0 * * *",
    "excludedCategories": [],
}


def _guess_categories(obj: MapObject) -> list[str]:
    t = (obj.Type or "").lower()
    if "коляс" in t:
        return ["К"]
    if "слух" in t:
        return ["Г"]
    if "зрен" in t:
        return ["С"]
    return ["К", "С"]


@router.get("/api/SocialMapObject/get/accessibility")
def get_accessibility() -> list[str]:
    return _ACCESS


@router.get("/api/admin/get/infrastructure")
def get_infrastructure() -> dict[str, list[str]]:
    return _INFRA


@router.get("/api/admin/GetSettings")
def get_settings() -> dict[str, Any]:
    return _SETTINGS


@router.post("/api/admin/settings/UpdateRnValue")
def update_rn_value(body: dict[str, Any]) -> dict[str, str]:
    _SETTINGS["rnValue"] = int(body.get("RnValue", _SETTINGS["rnValue"]))
    return {"message": "ok"}


@router.post("/api/admin/settings/UpdateCronExpression")
def update_cron(body: dict[str, Any]) -> dict[str, str]:
    _SETTINGS["cronExpression"] = str(body.get("CronExpression", _SETTINGS["cronExpression"]))
    return {"message": "ok"}


@router.post("/api/admin/settings/UpdateExcludedCategories")
def update_excluded(body: dict[str, Any]) -> dict[str, str]:
    _SETTINGS["excludedCategories"] = list(body.get("ExcludedCategories", []))
    return {"message": "ok"}


@router.post("/client/getOntologyInfo")
async def get_ontology_info(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    form = await request.form()
    iri = str(form.get("iri", ""))
    obj = db.query(MapObject).filter(MapObject.IRI == iri).first()
    if not obj:
        return {"categories": [], "accessibilityElements": []}
    return {"categories": _guess_categories(obj), "accessibilityElements": _ACCESS[:3]}


@router.post("/client/AddMapObject")
async def add_or_edit_map_object(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    form = await request.form()
    map_object_id = form.get("mapObjectId")
    name = str(form.get("name", "")).strip()
    obj_type = str(form.get("type", "")).strip() or "Социальная инфраструктура"
    address = str(form.get("address", "")).strip()
    description = str(form.get("description", "")).strip() or None
    working_hours = str(form.get("workingHours", "")).strip() or None
    if not name or not address:
        raise HTTPException(status_code=400, detail="name/address required")

    row: MapObject | None = None
    if map_object_id:
        row = db.query(MapObject).filter(MapObject.Id == int(str(map_object_id))).first()

    if row is None:
        row = MapObject(
            X=51.533557,
            Y=46.034257,
            Display_name=name,
            IRI=f"generated:{name}:{int(datetime.now(timezone.utc).timestamp())}",
            Adress=address,
            Description=description,
            Images="Нет изображения",
            Type=obj_type,
            Rating=0,
            WorkingHours=working_hours,
            CreatedAt=datetime.now(timezone.utc),
            UpdatedAt=datetime.now(timezone.utc),
        )
        db.add(row)
    else:
        row.Display_name = name
        row.Adress = address
        row.Description = description
        row.Type = obj_type
        row.WorkingHours = working_hours
        row.UpdatedAt = datetime.now(timezone.utc)
    db.commit()
    return {"message": "ok"}


def _dist_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))


@router.get("/api/recommendation/GetPopularRecommendations")
def get_popular_recommendations(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(MapObject).limit(40).all()
    return [map_object_to_json(m) for m in rows]


@router.get("/api/recommendation/GetRecommendationsByUserId/{user_id}")
def get_user_recommendations(user_id: int, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    rows = db.query(MapObject).order_by(MapObject.Rating.desc().nullslast()).limit(40).all()
    return [map_object_to_json(m) for m in rows]


@router.delete("/api/recommendation/RemoveRecommendation/{map_object_id}/{user_id}")
def remove_recommendation(map_object_id: int, user_id: int) -> dict[str, str]:
    return {"message": "ok"}


@router.get("/api/recommendation/GetFilteringIntersectedData")
def filtering_intersected(
    user: int = Query(...),
    Categories: list[str] = Query(default=[]),
    AccessibilityElements: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = db.query(MapObject).limit(40).all()
    out = [{"mapObject": map_object_to_json(m), "distance": 0.0} for m in rows]
    return out


@router.get("/api/recommendation/GetFilteringPopularData")
def filtering_popular(
    user: int = Query(...),
    Categories: list[str] = Query(default=[]),
    AccessibilityElements: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = db.query(MapObject).limit(40).all()
    out = [{"mapObject": map_object_to_json(m), "distance": 0.0} for m in rows]
    return out


@router.post("/api/recommendation/SortRecommendations")
def sort_recommendations(body: dict[str, Any]) -> list[dict[str, Any]]:
    user_lat = float(body.get("UserLatitude", 51.533557))
    user_lon = float(body.get("UserLongitude", 46.034257))
    recs = list(body.get("Recommendations", []))
    for rec in recs:
        mo = rec.get("mapObject") or {}
        lat = float(mo.get("x", user_lat))
        lon = float(mo.get("y", user_lon))
        rec["distance"] = _dist_km(user_lat, user_lon, lat, lon)
    recs.sort(key=lambda r: float(r.get("distance", 0.0)))
    return recs
