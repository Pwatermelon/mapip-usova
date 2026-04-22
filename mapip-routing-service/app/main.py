"""
MAPIP Routing microservice — внешнее API в духе картографических SDK:
геокодирование и построение маршрутов (OpenRouteService), без привязки к UI.
"""
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


class DirectionsRequest(BaseModel):
    """Точки в формате [широта, долгота] — как в прежнем RouteBuildController."""

    from_: list[float] = Field(..., alias="from")
    to: list[float]
    profile: str | None = "foot-walking"
    alternative_count: int | None = Field(1, alias="alternativeCount")

    model_config = {"populate_by_name": True}


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


@app.post("/v1/directions/geojson")
async def directions_geojson(body: DirectionsRequest) -> Any:
    """
    Построить маршрут; ответ — GeoJSON от OpenRouteService (как раньше /api/routebuild/Build).
    """
    if not settings.openroute_api_key:
        raise HTTPException(
            status_code=503,
            detail="Не задан OPENROUTE_API_KEY для обращения к OpenRouteService.",
        )
    if len(body.from_) != 2 or len(body.to) != 2:
        raise HTTPException(status_code=400, detail="from и to должны быть [lat, lon]")

    profile = (body.profile or "foot-walking").lower()
    if profile not in ("wheelchair", "foot-walking", "driving-car"):
        profile = "foot-walking"

    coordinates = [[body.from_[1], body.from_[0]], [body.to[1], body.to[0]]]
    alt = body.alternative_count or 1
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
