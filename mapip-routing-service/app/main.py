"""
MAPIP Routing microservice — внешнее API в духе картографических SDK:
геокодирование и построение маршрутов (OpenRouteService), без привязки к UI.
"""
from typing import Any
import re
import time
import json

import httpx
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover
    Redis = None  # type: ignore[assignment]

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

_OVERPASS_CACHE_TTL_SECONDS = 300
_overpass_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_redis_client: Any = None


@app.on_event("shutdown")
async def _close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception:
            pass
        _redis_client = None


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
        # Fallback на локальные базовые подсказки, чтобы фронт не оставался без вариантов.
        ql = q.strip().lower()
        fallback = [
            {"lat": 51.533557, "lon": 46.034257, "display_name": "Саратов, центр", "place_id": "fallback-1"},
            {"lat": 51.530249, "lon": 46.036759, "display_name": "ул. Тархова, Саратов", "place_id": "fallback-2"},
            {"lat": 51.529300, "lon": 46.020100, "display_name": "Городской парк, Саратов", "place_id": "fallback-3"},
        ]
        return [row for row in fallback if ql in row["display_name"].lower()][:limit]
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


def _parse_via_points(value: Any) -> list[list[float]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail="via: ожидается список точек [lat, lon]")
    out: list[list[float]] = []
    for idx, point in enumerate(value):
        out.append(_parse_lat_lon_pair(point, f"via[{idx}]"))
    return out


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


def _has_unknown_alternative_routes(text: str | None) -> bool:
    if not text:
        return False
    return bool(re.search(r"unknown parameter.+alternative_routes|code\"\s*:\s*2012", text, re.IGNORECASE))


async def _post_ors_points(profile: str, points: list[list[float]]) -> httpx.Response:
    return await _post_ors(profile, {"coordinates": points})


def _bbox_for_points(points: list[list[float]], pad: float = 0.01) -> tuple[float, float, float, float]:
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad


async def _fetch_accessibility_candidates(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    profile: str,
    limit: int,
) -> list[list[float]]:
    if profile == "wheelchair":
        clauses = """
          node["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["kerb"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["ramp"]({min_lat},{min_lon},{max_lat},{max_lon});
          way["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
        """
    else:
        clauses = """
          node["amenity"="toilets"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["amenity"="drinking_water"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["tourism"="museum"]({min_lat},{min_lon},{max_lat},{max_lon});
        """
    data = await _fetch_overpass_raw(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
        profile=profile,
    )
    if not data:
        return []
    out: list[list[float]] = []
    for el in data.get("elements", []):
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None or lon is None:
            center = el.get("center") or {}
            lat = center.get("lat")
            lon = center.get("lon")
        if lat is None or lon is None:
            continue
        out.append([float(lon), float(lat)])
        if len(out) >= limit:
            break
    return out


def _overpass_cache_key(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    profile: str,
) -> str:
    # Квантование bbox, чтобы близкие запросы переиспользовали один и тот же кэш.
    q = 0.01
    def r(v: float) -> float:
        return round(v / q) * q
    return f"{profile}:{r(min_lon):.2f},{r(min_lat):.2f},{r(max_lon):.2f},{r(max_lat):.2f}"


async def _get_redis() -> Any:
    global _redis_client
    if not settings.redis_url or Redis is None:
        return None
    if _redis_client is None:
        try:
            _redis_client = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
            await _redis_client.ping()
        except Exception:
            _redis_client = None
            return None
    return _redis_client


def _overpass_clauses(profile: str) -> str:
    if profile == "wheelchair":
        return """
          node["highway"="steps"]({min_lat},{min_lon},{max_lat},{max_lon});
          way["highway"="steps"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
          way["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["kerb"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["ramp"]({min_lat},{min_lon},{max_lat},{max_lon});
        """
    return """
          node["amenity"="drinking_water"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["tourism"="museum"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["tourism"="hotel"]({min_lat},{min_lon},{max_lat},{max_lon});
          node["amenity"="toilets"]({min_lat},{min_lon},{max_lat},{max_lon});
        """


async def _fetch_overpass_raw(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    profile: str,
) -> dict[str, Any] | None:
    key = _overpass_cache_key(min_lon, min_lat, max_lon, max_lat, profile)
    now = time.time()
    redis = await _get_redis()
    if redis is not None:
        try:
            raw = await redis.get(f"overpass:{key}")
            if raw:
                cached_data = json.loads(raw)
                _overpass_cache[key] = (now + _OVERPASS_CACHE_TTL_SECONDS, cached_data)
                return cached_data
        except Exception:
            pass
    cached = _overpass_cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    clauses = _overpass_clauses(profile)
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
        return None
    data = r.json()
    _overpass_cache[key] = (now + _OVERPASS_CACHE_TTL_SECONDS, data)
    if redis is not None:
        try:
            await redis.setex(f"overpass:{key}", _OVERPASS_CACHE_TTL_SECONDS, json.dumps(data))
        except Exception:
            pass
    return data


def _merge_geojson_features(collections: list[dict[str, Any]]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for c in collections:
        for f in c.get("features", []):
            f_props = dict(f.get("properties") or {})
            f_props["routeIndex"] = len(features)
            features.append({**f, "properties": f_props})
    return {"type": "FeatureCollection", "features": features}


def _extract_first_line_coords(geo: dict[str, Any]) -> list[list[float]]:
    for f in geo.get("features", []):
        geom = f.get("geometry") or {}
        if geom.get("type") == "LineString":
            coords = geom.get("coordinates") or []
            if isinstance(coords, list):
                return coords
    return []


async def _build_offset_alternatives(
    profile: str,
    start: list[float],
    end: list[float],
    base_geo: dict[str, Any],
    need_count: int,
) -> list[dict[str, Any]]:
    if need_count <= 0:
        return []
    out: list[dict[str, Any]] = []
    base_line = _extract_first_line_coords(base_geo)
    if len(base_line) < 2:
        return out
    n = len(base_line)
    idxs = sorted({0, n // 4, n // 3, (2 * n) // 3, (3 * n) // 4, n - 1})
    samples = [base_line[i] for i in idxs if 0 <= i < n]
    if len(samples) < 2:
        samples = [base_line[0], base_line[-1]]
    offsets = [0.0012, -0.0012, 0.0024, -0.0024, 0.004, -0.004, 0.0065, -0.0065]
    for sample in samples:
        if len(out) >= need_count:
            break
        sx, sy = float(sample[0]), float(sample[1])
        for delta in offsets:
            if len(out) >= need_count:
                break
            via = [sx + delta, sy - delta * 0.85]
            r_via = await _post_ors_points(profile, [start, via, end])
            if not r_via.is_success or _has_ors_2007(r_via.text):
                continue
            try:
                via_geo = r_via.json()
            except Exception:
                continue
            if via_geo.get("features"):
                out.append(via_geo)
    return out


async def _post_ors_json_geo(profile: str, payload: dict[str, Any]) -> httpx.Response:
    # Fallback на json endpoint ORS.
    url = f"https://api.openrouteservice.org/v2/directions/{profile}"
    params = {"api_key": settings.openroute_api_key}
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    body = {
        **payload,
        "instructions": False,
        "elevation": False,
        "geometry_simplify": False,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        return await client.post(url, params=params, headers=headers, json=body)


def _decode_polyline(encoded: str, precision: int = 5) -> list[list[float]]:
    coords: list[list[float]] = []
    index = 0
    lat = 0
    lon = 0
    factor = 10**precision

    while index < len(encoded):
        result = 0
        shift = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if result & 1 else result >> 1
        lat += dlat

        result = 0
        shift = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlon = ~(result >> 1) if result & 1 else result >> 1
        lon += dlon
        coords.append([lon / factor, lat / factor])
    return coords


def _json_route_to_geojson(payload: dict[str, Any]) -> dict[str, Any]:
    routes = payload.get("routes") or []
    features: list[dict[str, Any]] = []
    for idx, route in enumerate(routes):
        geom = route.get("geometry")
        if not geom:
            continue
        geometry: dict[str, Any]
        if isinstance(geom, dict) and geom.get("type") == "LineString":
            geometry = geom
        elif isinstance(geom, str):
            geometry = {"type": "LineString", "coordinates": _decode_polyline(geom)}
        else:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "summary": route.get("summary", {}),
                    "segments": route.get("segments", []),
                    "way_points": route.get("way_points", []),
                    "routeIndex": idx,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


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
    via_points = _parse_via_points(body.get("via"))

    profile = (body.get("profile") or "foot-walking")
    if isinstance(profile, str):
        profile = profile.lower()
    else:
        profile = "foot-walking"
    if profile not in ("wheelchair", "foot-walking", "driving-car"):
        profile = "foot-walking"

    coordinates = [[from_[1], from_[0]], *[[v[1], v[0]] for v in via_points], [to[1], to[0]]]
    alt_raw = body.get("alternativeCount", body.get("alternative_count", 1))
    try:
        alt = int(alt_raw) if alt_raw is not None else 1
    except (TypeError, ValueError):
        alt = 1
    alt = max(1, min(3, alt))
    if via_points:
        # Для маршрута через конкретные объекты строим один детерминированный путь.
        alt = 1

    if alt > 1:
        payload: dict[str, Any] = {
            "coordinates": coordinates,
            "options": {
                "alternative_routes": {"target_count": alt, "weight_factor": 1.82}
            },
        }
        r = await _post_ors(profile, payload)
        if not r.is_success or _has_unknown_alternative_routes(r.text):
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
        # Остаемся строго в ORS: fallback на directions/{profile} + geometry_format=geojson.
        fallback_payload: dict[str, Any] = {"coordinates": coordinates}
        if alt > 1:
            fallback_payload["options"] = {"alternative_routes": {"target_count": alt, "weight_factor": 1.82}}
        r_json = await _post_ors_json_geo(profile, fallback_payload)
        if (_has_unknown_alternative_routes(r_json.text) and alt > 1) or (
            not r_json.is_success and alt > 1
        ):
            r_json = await _post_ors_json_geo(profile, {"coordinates": coordinates})
        if _has_ors_2007(r_json.text) or not r_json.is_success:
            for fallback_profile in ("foot-walking", "driving-car"):
                if fallback_profile == profile:
                    continue
                r_json = await _post_ors_json_geo(fallback_profile, fallback_payload)
                if (_has_unknown_alternative_routes(r_json.text) and alt > 1) or (
                    not r_json.is_success and alt > 1
                ):
                    r_json = await _post_ors_json_geo(fallback_profile, {"coordinates": coordinates})
                if r_json.is_success and not _has_ors_2007(r_json.text):
                    break
        if not r_json.is_success or _has_ors_2007(r_json.text):
            raise HTTPException(status_code=r_json.status_code, detail=r_json.text[:2000])
        main_geo = _json_route_to_geojson(r_json.json())
        if alt <= 1:
            return main_geo

        # Реальные альтернативы через разные точки доступной инфраструктуры.
        min_lon, min_lat, max_lon, max_lat = _bbox_for_points(coordinates)
        candidates = await _fetch_accessibility_candidates(
            min_lon=min_lon,
            min_lat=min_lat,
            max_lon=max_lon,
            max_lat=max_lat,
            profile=profile,
            limit=max(8, alt * 3),
        )
        routes: list[dict[str, Any]] = [main_geo]
        for via in candidates:
            if len(routes) >= alt:
                break
            r_via = await _post_ors_points(profile, [coordinates[0], via, coordinates[1]])
            if not r_via.is_success or _has_ors_2007(r_via.text):
                continue
            try:
                via_geo = r_via.json()
            except Exception:
                continue
            if via_geo.get("features"):
                routes.append(via_geo)
        if len(routes) < alt:
            extras = await _build_offset_alternatives(
                profile=profile,
                start=coordinates[0],
                end=coordinates[1],
                base_geo=main_geo,
                need_count=alt - len(routes),
            )
            routes.extend(extras)
        return _merge_geojson_features(routes[:alt])

    base_geo = r.json()
    if alt <= 1:
        return base_geo
    # Если ORS вернул меньше альтернатив, чем просили, добавляем через POI.
    have = len(base_geo.get("features", []))
    if have >= alt:
        return base_geo
    min_lon, min_lat, max_lon, max_lat = _bbox_for_points(coordinates)
    candidates = await _fetch_accessibility_candidates(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
        profile=profile,
        limit=max(8, alt * 3),
    )
    routes: list[dict[str, Any]] = [base_geo]
    for via in candidates:
        if have + len(routes) - 1 >= alt:
            break
        r_via = await _post_ors_points(profile, [coordinates[0], via, coordinates[1]])
        if not r_via.is_success or _has_ors_2007(r_via.text):
            continue
        try:
            via_geo = r_via.json()
        except Exception:
            continue
        if via_geo.get("features"):
            routes.append(via_geo)
    if len(routes) < alt:
        extras = await _build_offset_alternatives(
            profile=profile,
            start=coordinates[0],
            end=coordinates[1],
            base_geo=base_geo,
            need_count=alt - len(routes),
        )
        routes.extend(extras)
    return _merge_geojson_features(routes[:alt])


@app.get("/v1/overpass/objects")
async def overpass_objects(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat"),
    profile: str = Query("foot-walking"),
) -> dict[str, Any]:
    try:
        min_lon, min_lat, max_lon, max_lat = [float(x) for x in bbox.split(",")]
    except Exception as e:
        raise HTTPException(status_code=400, detail="bbox: ожидается minLon,minLat,maxLon,maxLat") from e

    data = await _fetch_overpass_raw(
        min_lon=min_lon,
        min_lat=min_lat,
        max_lon=max_lon,
        max_lat=max_lat,
        profile=profile,
    )
    if not data:
        raise HTTPException(status_code=502, detail="Overpass API error")
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
