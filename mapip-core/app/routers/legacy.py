from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from starlette.datastructures import FormData
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.map_object_resolve import filter_ontology_objects, list_recommendation_objects
from app.models import AdminSetting, MapObject, PendingSocialMapObject, User
from app.ontology_service import get_graph, get_ontology_info, infrastructure_by_type, list_accessibility_elements

router = APIRouter(tags=["legacy-compat"])


def _admin_row(db: Session) -> AdminSetting | None:
    try:
        return db.query(AdminSetting).order_by(AdminSetting.Id).first()
    except SQLAlchemyError:
        return None


def _default_settings_dict() -> dict[str, Any]:
    return {"rnValue": 4, "cronExpression": "0 0 * * *", "excludedCategories": []}


def _settings_to_response(row: AdminSetting | None) -> dict[str, Any]:
    if not row:
        return _default_settings_dict()
    raw = row.ExcludedCategories or ""
    excluded = [x.strip() for x in raw.split(",") if x.strip()]
    return {
        "rnValue": row.RnValue,
        "cronExpression": row.CronExpression or "0 0 * * *",
        "excludedCategories": excluded,
    }


@router.get("/api/SocialMapObject/get/accessibility")
def get_accessibility() -> list[str]:
    g = get_graph(settings.ontology_path)
    if not g:
        return []
    return list_accessibility_elements(g)


@router.get("/api/admin/get/infrastructure")
def get_infrastructure() -> dict[str, list[str]]:
    g = get_graph(settings.ontology_path)
    if not g:
        return {}
    return infrastructure_by_type(g)


@router.get("/api/admin/GetSettings")
def get_settings(db: Session = Depends(get_db)) -> dict[str, Any]:
    return _settings_to_response(_admin_row(db))


@router.post("/api/admin/settings/UpdateRnValue")
def update_rn_value(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, str]:
    val = int(body.get("RnValue", body.get("rnValue", 4)))
    row = _admin_row(db)
    if not row:
        raise HTTPException(status_code=503, detail="AdminSettings table missing or empty")
    row.RnValue = val
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "ok"}


@router.post("/api/admin/settings/UpdateCronExpression")
def update_cron(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, str]:
    expr = str(body.get("CronExpression", body.get("cronExpression", ""))).strip()
    if not expr:
        raise HTTPException(status_code=400, detail="Cron expression cannot be empty")
    row = _admin_row(db)
    if not row:
        raise HTTPException(status_code=503, detail="AdminSettings table missing or empty")
    row.CronExpression = expr
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "ok"}


@router.post("/api/admin/settings/UpdateExcludedCategories")
def update_excluded(body: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, str]:
    cats = body.get("ExcludedCategories", body.get("excludedCategories", []))
    if not isinstance(cats, list):
        cats = []
    row = _admin_row(db)
    if not row:
        raise HTTPException(status_code=503, detail="AdminSettings table missing or empty")
    row.ExcludedCategories = ",".join(str(c) for c in cats)
    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"message": "ok"}


@router.post("/client/getOntologyInfo")
async def get_ontology_info_endpoint(request: Request) -> dict[str, Any]:
    form = await request.form()
    iri = str(form.get("iri", "")).strip()
    g = get_graph(settings.ontology_path)
    if not g:
        return {"categories": [], "accessibilityElements": []}
    info = get_ontology_info(g, iri)
    # Совместимость с legacy .NET (PascalCase) и с фронтом (camelCase)
    return {
        **info,
        "Categories": info["categories"],
        "AccessibilityElements": info["accessibilityElements"],
    }


def _form_float(form: FormData, key: str) -> float | None:
    v = form.get(key)
    if v is None or v == "":
        return None
    try:
        return float(str(v))
    except ValueError:
        return None


def _form_positive_int(form: FormData, key: str) -> int | None:
    v = form.get(key)
    if v in (None, ""):
        return None
    try:
        i = int(str(v))
        return i if i > 0 else None
    except ValueError:
        return None


@router.post("/client/AddMapObject")
async def add_or_edit_map_object(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    form = await request.form()
    name = str(form.get("name", "")).strip()
    obj_type = str(form.get("type", "")).strip() or "Социальная инфраструктура"
    address = str(form.get("address", "")).strip()
    description = str(form.get("description", "")).strip() or None
    working_hours = str(form.get("workingHours", "")).strip() or None
    if not name or not address:
        raise HTTPException(status_code=400, detail="name/address required")

    accessibility: list[str] = []
    disability: list[str] = []
    image_names: list[str] = []
    for key, val in form.multi_items():
        if key == "accessibility" and isinstance(val, str) and val.strip():
            accessibility.append(val.strip())
        elif key == "disabilityCategory" and isinstance(val, str) and val.strip():
            disability.append(val.strip())
        elif key == "images" and isinstance(val, UploadFile) and val.filename:
            image_names.append(val.filename)
            await val.read()

    lat = _form_float(form, "latitude")
    lon = _form_float(form, "longitude")
    default_x, default_y = 51.533557, 46.034257
    x_val = lat if lat is not None else default_x
    y_val = lon if lon is not None else default_y

    uid_raw = request.session.get("UserId")
    if uid_raw is None and form.get("userId") not in (None, ""):
        try:
            uid_raw = int(str(form.get("userId")))
        except ValueError:
            uid_raw = None
    user_row: User | None = None
    if uid_raw is not None:
        try:
            user_row = db.query(User).filter(User.Id == int(uid_raw)).first()
        except (TypeError, ValueError):
            user_row = None

    edit_existing = str(form.get("editExisting", "")).lower() in ("1", "true", "yes")
    edit_id = _form_positive_int(form, "mapObjectId")

    excluded_raw = str(form.get("excluded", "false")).lower()
    excluded = excluded_raw in ("1", "true", "yes")

    now = datetime.now(timezone.utc)

    if edit_existing and edit_id is not None:
        row = db.query(MapObject).filter(MapObject.Id == edit_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="map object not found")
        row.Display_name = name
        row.Adress = address
        row.Description = description
        row.Type = obj_type
        row.WorkingHours = working_hours
        row.X = x_val
        row.Y = y_val
        row.UpdatedAt = now
        db.commit()
        return {"message": "ok"}

    link_raw = form.get("mapObjectId")
    map_link: int | None = None
    if link_raw not in (None, ""):
        try:
            mi = int(str(link_raw))
            map_link = mi if mi > 0 else None
        except ValueError:
            map_link = None

    if user_row is not None:
        pending = PendingSocialMapObject(
            DisplayName=name,
            Address=address,
            X=lat,
            Y=lon,
            Type=obj_type,
            Description=description,
            DisabilityCategory=",".join(disability) if disability else None,
            WorkingHours=working_hours,
            Accessibility=",".join(accessibility) if accessibility else None,
            Images=",".join(image_names) if image_names else None,
            Excluded=excluded,
            MapObjectLinkId=map_link,
            DateAdded=now,
            Status="Pending",
            UserId=user_row.Id,
        )
        db.add(pending)
        db.commit()
        return {"message": "ok"}

    row = MapObject(
        X=x_val,
        Y=y_val,
        Display_name=name,
        IRI=f"generated:{name}:{int(now.timestamp())}",
        Adress=address,
        Description=description,
        Images="Нет изображения",
        Type=obj_type,
        Rating=0,
        WorkingHours=working_hours,
        CreatedAt=now,
        UpdatedAt=now,
    )
    db.add(row)
    db.commit()
    return {"message": "ok"}


def _dist_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))


@router.get("/api/recommendation/GetPopularRecommendations")
def get_popular_recommendations() -> list[dict[str, Any]]:
    return list_recommendation_objects(40)


@router.get("/api/recommendation/GetRecommendationsByUserId/{user_id}")
def get_user_recommendations(user_id: int) -> list[dict[str, Any]]:
    _ = user_id
    rows = list_recommendation_objects(500)
    return sorted(rows, key=lambda o: (o.get("display_name") or ""))[:40]


@router.delete("/api/recommendation/RemoveRecommendation/{map_object_id}/{user_id}")
def remove_recommendation(map_object_id: int, user_id: int) -> dict[str, str]:
    return {"message": "ok"}


@router.get("/api/recommendation/GetFilteringIntersectedData")
def filtering_intersected(
    user: int = Query(...),
    Categories: list[str] = Query(default=[]),
    AccessibilityElements: list[str] = Query(default=[]),
) -> list[dict[str, Any]]:
    _ = user
    base = list_recommendation_objects(500)
    filtered = filter_ontology_objects(base, Categories, AccessibilityElements)
    return [{"mapObject": o, "distance": 0.0} for o in filtered[:40]]


@router.get("/api/recommendation/GetFilteringPopularData")
def filtering_popular(
    user: int = Query(...),
    Categories: list[str] = Query(default=[]),
    AccessibilityElements: list[str] = Query(default=[]),
) -> list[dict[str, Any]]:
    _ = user
    base = list_recommendation_objects(500)
    filtered = filter_ontology_objects(base, Categories, AccessibilityElements)
    return [{"mapObject": o, "distance": 0.0} for o in filtered[:40]]


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
