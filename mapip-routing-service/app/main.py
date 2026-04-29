"""
MAPIP Routing microservice — внешнее API в духе картографических SDK:
геокодирование и построение маршрутов (OpenRouteService), без привязки к UI.
"""
from typing import Any
import re

import httpx
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(
    title="MAPIP Routing API",
    description="Сервис маршрутизации и геокодирования для веб, iOS и Android.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "mapip-routing"}


@app.get("/v1/geocode/search")
async def geocode_search(
    q: str = Query(..., min_length=1, description="Адрес или название"),
    limit: int = Query(5, ge=1, le=10),
) -> list[dict[str, Any]]:
    """Прокси к Nominatim (OSM), чтобы мобильные и веб-клиенты не упирались в CORS и политику User-Agent."""
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": q, "format": "json", "limit": limit, "addressdetails": 1}
    headers = {"Accept-Language": "ru", "User-Agent": settings.nominatim_user_agent}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url, params=params, headers=headers)
    if not r.is_success:
        raise HTTPException(status_code=502, detail="Nominatim error")
    data = r.json()
    out: list[dict[str, Any]] = []
    for row in data:
        out.append(
            {
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "display_name": row.get("display_name", ""),
                "place_id": row.get("place_id"),
            }
        )
    return out


def _parse_lat_lon_pair(value: Any, field: str) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise HTTPException(status_code=400, detail=f"{field}: ожидается [lat, lon]")
    try:
        return [float(value[0]), float(value[1])]
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"{field}: неверные координаты") from e


async def _post_ors(profile: str, payload: dict[str, Any]) -> httpx.Response:
    url = f"https://api.openrouteservice.org/v2/directions/{profile}/geojson"
    params = {"api_key": settings.openroute_api_key}
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        return await client.post(url, params=params, headers=headers, json=payload)


def _has_ors_2007(text: str | None) -> bool:
    if not text:
        return False
    return bool(re.search(r'"code"\s*:\s*2007|response format is not supported', text, re.IGNORECASE))


@app.post("/v1/directions/geojson")
async def directions_geojson(body: dict[str, Any] = Body(...)) -> Any:
    """
    Построить маршрут; ответ — GeoJSON от OpenRouteService (как раньше /api/routebuild/Build).
    Тело — JSON с ключами from / to ([широта, долгота]), опционально profile, alternativeCount.
    Разбор через dict, чтобы ключ «from» не ломался на уровне Pydantic/OpenAPI.
    """
    if not settings.openroute_api_key:
        raise HTTPException(
            status_code=503,
            detail="Не задан OPENROUTE_API_KEY для обращения к OpenRouteService.",
        )
    raw_from = body.get("from")
    if raw_from is None:
        raw_from = body.get("from_")
    raw_to = body.get("to")
    from_ = _parse_lat_lon_pair(raw_from, "from")
    to = _parse_lat_lon_pair(raw_to, "to")

    profile = (body.get("profile") or "foot-walking")
    if isinstance(profile, str):
        profile = profile.lower()
    else:
        profile = "foot-walking"
    if profile not in ("wheelchair", "foot-walking", "driving-car"):
        profile = "foot-walking"

    coordinates = [[from_[1], from_[0]], [to[1], to[0]]]
    alt_raw = body.get("alternativeCount", body.get("alternative_count", 1))
    try:
        alt = int(alt_raw) if alt_raw is not None else 1
    except (TypeError, ValueError):
        alt = 1
    alt = max(1, min(3, alt))

    if alt > 1:
        payload: dict[str, Any] = {
            "coordinates": coordinates,
            "options": {
                "alternative_routes": {"target_count": alt, "weight_factor": 1.45}
            },
        }
        r = await _post_ors(profile, payload)
        if not r.is_success:
            r = await _post_ors(profile, {"coordinates": coordinates})
    else:
        r = await _post_ors(profile, {"coordinates": coordinates})

    if _has_ors_2007(r.text):
        # У ORS иногда code 2007; пробуем совместимые профили.
        for fallback_profile in ("foot-walking", "driving-car"):
            if fallback_profile == profile:
                continue
            r = await _post_ors(fallback_profile, {"coordinates": coordinates})
            if r.is_success and not _has_ors_2007(r.text):
                break

    if not r.is_success or _has_ors_2007(r.text):
        raise HTTPException(status_code=r.status_code, detail=r.text[:2000])

    return r.json()


@app.get("/v1/overpass/objects")
async def overpass_objects(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat"),
    profile: str = Query("foot-walking"),
) -> dict[str, Any]:
    try:
        min_lon, min_lat, max_lon, max_lat = [float(x) for x in bbox.split(",")]
    except Exception as e:
        raise HTTPException(status_code=400, detail="bbox: ожидается minLon,minLat,maxLon,maxLat") from e

    # Простые профили выборки: для колясочников добавляем барьеры/пандусы,
    # для пешехода — общественно полезные POI.
    if profile == "wheelchair":
        clauses = """
          node["highway"="steps"]({min_lat},{min_lon},{max_lat},{max_lon});
          way["highway"="steps"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
          way["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["kerb"]({min_lat},{min_lon},{max_lat},{max_lon});
        """
    else:
        clauses = """
          node["amenity"="drinking_water"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["tourism"="museum"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["tourism"="hotel"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["amenity"="toilets"]({min_lat},{min_lon},{max_lat},{max_lon});
        """

    query = f"""
    [out:json][timeout:25];
    (
      {clauses}
    );
    out center tags;
    """.format(min_lat=min_lat, min_lon=min_lon, max_lat=max_lat, max_lon=max_lon)

    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            headers={"User-Agent": settings.nominatim_user_agent},
        )
    if not r.is_success:
        raise HTTPException(status_code=502, detail="Overpass API error")
    data = r.json()
    features: list[dict[str, Any]] = []
    for el in data.get("elements", []):
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None or lon is None:
            center = el.get("center") or {}
            lat = center.get("lat")
            lon = center.get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags", {})
        label = (
            tags.get("name")
            or tags.get("amenity")
            or tags.get("tourism")
            or tags.get("highway")
            or tags.get("wheelchair")
            or "OSM object"
        )
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
                "properties": {"id": el.get("id"), "label": label, "tags": tags},
            }
        )

    return {"type": "FeatureCollection", "features": features}
