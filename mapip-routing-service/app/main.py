"""
MAPIP Routing microservice — внешнее API в духе картографических SDK:
геокодирование и построение маршрутов (OpenRouteService), без привязки к UI.
"""
from typing import Any

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

    url = f"https://api.openrouteservice.org/v2/directions/{profile}/geojson"
    params = {"api_key": settings.openroute_api_key}
    headers = {"Accept": "application/json", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        if alt > 1:
            payload: dict[str, Any] = {
                "coordinates": coordinates,
                "options": {
                    "alternative_routes": {"target_count": alt, "weight_factor": 1.45}
                },
            }
            r = await client.post(url, params=params, headers=headers, json=payload)
            if not r.is_success:
                payload = {"coordinates": coordinates}
                r = await client.post(url, params=params, headers=headers, json=payload)
        else:
            r = await client.post(
                url, params=params, headers=headers, json={"coordinates": coordinates}
            )

    if not r.is_success:
        raise HTTPException(status_code=r.status_code, detail=r.text[:2000])

    return r.json()
