import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { coreBase, errorTextFromResponse, fetchJson, routingBase } from "../api";

type MapObject = { id: number; x: number; y: number; display_name: string };
type OrsGeoJson = GeoJSON.FeatureCollection & { features?: GeoJSON.Feature[] };
const DEMO_OBJECTS: MapObject[] = [
  { id: 90001, x: 51.533557, y: 46.034257, display_name: "Театр оперы (demo)" },
  { id: 90002, x: 51.5293, y: 46.0201, display_name: "Городской парк (demo)" },
  { id: 90003, x: 51.5402, y: 46.0418, display_name: "Ж/д вокзал (demo)" },
];

function lineCoordsFromOrs(data: OrsGeoJson): number[][] {
  const out: number[][] = [];
  for (const f of data.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") {
      for (const c of g.coordinates as number[][]) out.push([c[1], c[0]]);
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates as number[][][]) {
        for (const c of line) out.push([c[1], c[0]]);
      }
    }
  }
  return out;
}

function routeFeaturesFromOrs(data: OrsGeoJson): GeoJSON.Feature<GeoJSON.LineString>[] {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const f of data.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") {
      features.push({
        type: "Feature",
        geometry: g as GeoJSON.LineString,
        properties: f.properties ?? {},
      });
      continue;
    }
    if (g.type === "MultiLineString") {
      const multi = g.coordinates as number[][][];
      for (const line of multi) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: line },
          properties: f.properties ?? {},
        });
      }
    }
  }
  return features.map((feature, idx) => ({
    ...feature,
    properties: { ...(feature.properties ?? {}), routeIndex: idx },
  }));
}

function routeLatLonCoords(feature: GeoJSON.Feature<GeoJSON.LineString>): [number, number][] {
  return (feature.geometry.coordinates ?? []).map((c) => [c[1], c[0]]);
}

function sqDist(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = aLat - bLat;
  const dLon = aLon - bLon;
  return dLat * dLat + dLon * dLon;
}

/** Ближайшая точка на полилинии маршрута (сегменты), не только вершины — без «заезда» в оффлайн‑POI. */
function nearestFootOnPolyline(
  route: [number, number][],
  lat: number,
  lon: number,
): { lat: number; lon: number; distSq: number; progress01: number } | null {
  if (route.length < 2) return null;
  let bestSq = Number.POSITIVE_INFINITY;
  let bestLat = lat;
  let bestLon = lon;
  let bestProgress01 = 0;
  const n = route.length;
  for (let i = 0; i < n - 1; i++) {
    const [lat1, lon1] = route[i];
    const [lat2, lon2] = route[i + 1];
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-22) continue;
    const t = Math.max(0, Math.min(1, ((lon - lon1) * dx + (lat - lat1) * dy) / len2));
    const plon = lon1 + t * dx;
    const plat = lat1 + t * dy;
    const d = sqDist(plat, plon, lat, lon);
    if (d < bestSq) {
      bestSq = d;
      bestLat = plat;
      bestLon = plon;
      bestProgress01 = (i + t) / (n - 1);
    }
  }
  return { lat: bestLat, lon: bestLon, distSq: bestSq, progress01: bestProgress01 };
}

/** Приблизительное расстояние между двумя точками в метрах (плоская аппроксимация). */
function metersApprox(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Доля точек полилинии A, лежащих близко к B (частичное совпадение участков — норма). */
function overlapFractionAlong(
  a: GeoJSON.Feature<GeoJSON.LineString>,
  b: GeoJSON.Feature<GeoJSON.LineString>,
  closeMeters: number,
  sampleCount = 36,
): number {
  const la = routeLatLonCoords(a);
  const lbRaw = b.geometry.coordinates ?? [];
  const lb: [number, number][] = lbRaw.map((c) => [c[1], c[0]]);
  if (la.length < 2 || lb.length < 2) return 1;
  let close = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const idx = Math.min(la.length - 1, Math.round((i / Math.max(1, sampleCount - 1)) * (la.length - 1)));
    const [lat, lon] = la[idx];
    const foot = nearestFootOnPolyline(lb, lat, lon);
    if (!foot) continue;
    if (metersApprox(lat, lon, foot.lat, foot.lon) <= closeMeters) close += 1;
  }
  return close / sampleCount;
}

/** Почти одна и та же линия (≈100% наложение), а не просто общий кусок пути. */
function isAlmostFullOverlap(
  a: GeoJSON.Feature<GeoJSON.LineString>,
  b: GeoJSON.Feature<GeoJSON.LineString>,
): boolean {
  const corridorM = 14;
  const minOverlapBothWays = 0.9;
  return (
    overlapFractionAlong(a, b, corridorM) >= minOverlapBothWays &&
    overlapFractionAlong(b, a, corridorM) >= minOverlapBothWays
  );
}

function isTooSimilarRoute(
  candidate: GeoJSON.Feature<GeoJSON.LineString>,
  existing: GeoJSON.Feature<GeoJSON.LineString>[],
): boolean {
  return existing.some((ex) => isAlmostFullOverlap(candidate, ex));
}

function stepObstaclePoints(overpass: GeoJSON.Feature[]): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (const f of overpass) {
    const tags = (f.properties as { tags?: Record<string, string> } | undefined)?.tags;
    if (tags?.highway !== "steps") continue;
    const c = f.geometry?.type === "Point" ? (f.geometry.coordinates as number[]) : null;
    if (!c || c.length < 2) continue;
    out.push({ lat: c[1], lon: c[0] });
  }
  return out;
}

/** Для профиля wheelchair: маршрут проходит неприемлемо близко к лестнице (узел steps). */
function routeUnacceptableNearSteps(
  feature: GeoJSON.Feature<GeoJSON.LineString>,
  steps: { lat: number; lon: number }[],
  thresholdSq: number,
): boolean {
  if (!steps.length) return false;
  const line = routeLatLonCoords(feature);
  if (line.length < 2) return false;
  for (const s of steps) {
    const foot = nearestFootOnPolyline(line, s.lat, s.lon);
    if (foot && foot.distSq < thresholdSq) return true;
  }
  return false;
}

function objectTypeLabel(tags: Record<string, string> | undefined, fallback?: string): string {
  if (!tags) return fallback || "Объект";
  if (tags.ramp === "yes") return "Пандус";
  if (tags.kerb) return `Бордюр (${tags.kerb})`;
  if (tags.wheelchair) return `Доступность wheelchair: ${tags.wheelchair}`;
  if (tags.highway === "steps") return "Лестница";
  if (tags.amenity) return `Amenity: ${tags.amenity}`;
  if (tags.tourism) return `Tourism: ${tags.tourism}`;
  return fallback || "Объект";
}

function infraScoreForRoute(
  feature: GeoJSON.Feature<GeoJSON.LineString>,
  coreObjects: MapObject[],
  overpass: GeoJSON.Feature[],
  profile: string,
): number {
  const route = routeLatLonCoords(feature);
  if (!route.length) return 0;
  const nearThresholdSq = 0.0012 * 0.0012; // ~130m
  let score = 0;
  for (const obj of coreObjects) {
    const near = route.some(([lat, lon]) => sqDist(lat, lon, obj.x, obj.y) <= nearThresholdSq);
    if (near) score += 2;
  }
  for (const poi of overpass) {
    const coords = poi.geometry?.type === "Point" ? (poi.geometry.coordinates as number[]) : null;
    if (!coords || coords.length < 2) continue;
    const poiLat = coords[1];
    const poiLon = coords[0];
    const tags = (poi.properties as { tags?: Record<string, string> } | undefined)?.tags ?? {};
    const near = route.some(([lat, lon]) => sqDist(lat, lon, poiLat, poiLon) <= nearThresholdSq);
    if (tags.highway === "steps") {
      if (profile === "wheelchair" && near) score -= 220;
      continue;
    }
    if (!near) continue;
    score += 3;
    if (profile === "wheelchair" && (tags.wheelchair || tags.ramp || tags.kerb)) score += 4;
  }
  return score;
}

/** Сколько overpass-объектов маршрут реально «накрывает» (главный критерий цвета). */
function overpassCoverageScore(
  feature: GeoJSON.Feature<GeoJSON.LineString>,
  overpass: GeoJSON.Feature[],
  profile: string,
): number {
  const route = routeLatLonCoords(feature);
  if (route.length < 2 || !overpass.length) return 0;
  const nearThresholdSq = 0.0012 * 0.0012; // ~130m
  let score = 0;
  for (const poi of overpass) {
    const coords = poi.geometry?.type === "Point" ? (poi.geometry.coordinates as number[]) : null;
    if (!coords || coords.length < 2) continue;
    const poiLat = coords[1];
    const poiLon = coords[0];
    const tags = (poi.properties as { tags?: Record<string, string> } | undefined)?.tags ?? {};
    if (profile === "wheelchair" && tags.highway === "steps") continue;
    const near = route.some(([lat, lon]) => sqDist(lat, lon, poiLat, poiLon) <= nearThresholdSq);
    if (!near) continue;
    score += 1;
    if (profile === "wheelchair" && (tags.wheelchair || tags.ramp || tags.kerb)) score += 1;
  }
  return score;
}

function bboxFromLngLats(coords: number[][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  let minLon = coords[0][1];
  let maxLon = coords[0][1];
  let minLat = coords[0][0];
  let maxLat = coords[0][0];
  for (const [lat, lon] of coords) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

function hasOrs2007(text: string): boolean {
  return /2007|response format is not supported/i.test(text);
}

export function RouteMapWidget() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fromMarkerRef = useRef<maplibregl.Marker | null>(null);
  const toMarkerRef = useRef<maplibregl.Marker | null>(null);
  const meMarkerRef = useRef<maplibregl.Marker | null>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const altRateLimitUntilRef = useRef(0);
  const buildInFlightRef = useRef(false);
  const mapPickModeRef = useRef<"from" | "to" | null>(null);
  const fromSuggestReqRef = useRef(0);
  const toSuggestReqRef = useRef(0);
  const fromSuggestTimerRef = useRef<number | null>(null);
  const toSuggestTimerRef = useRef<number | null>(null);
  const fromPointRef = useRef<[number, number] | null>(null);
  const toPointRef = useRef<[number, number] | null>(null);
  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ] = useState("");
  const [profile, setProfile] = useState("foot-walking");
  const [alternativeCount, setAlternativeCount] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [fromSuggestions, setFromSuggestions] = useState<{ lat: number; lon: number; display_name: string }[]>([]);
  const [toSuggestions, setToSuggestions] = useState<{ lat: number; lon: number; display_name: string }[]>([]);
  const [fromPoint, setFromPoint] = useState<[number, number] | null>(null);
  const [toPoint, setToPoint] = useState<[number, number] | null>(null);
  const [myPoint, setMyPoint] = useState<[number, number] | null>(null);
  const [useMyLocationRouting, setUseMyLocationRouting] = useState(false);
  const [mapPickMode, setMapPickMode] = useState<"from" | "to" | null>(null);
  /** Без этого эффект с setData может отработать до map.on("load") и больше не повториться. */
  const [mapReady, setMapReady] = useState(false);

  mapPickModeRef.current = mapPickMode;

  useEffect(() => {
    fromPointRef.current = fromPoint;
  }, [fromPoint]);

  useEffect(() => {
    toPointRef.current = toPoint;
  }, [toPoint]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchJson<MapObject[]>(`${coreBase}/GetSocialMapObject`);
        setObjects(data.length ? data : DEMO_OBJECTS);
      } catch {
        setObjects(DEMO_OBJECTS);
      }
    })();
  }, []);

  useEffect(() => {
    if (!mapEl.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [46.034257, 51.533557],
      zoom: 13,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match",
            ["coalesce", ["get", "routeIndex"], 0],
            0,
            "#22c55e",
            1,
            "#16a34a",
            2,
            "#15803d",
            "#22c55e",
          ],
          "line-width": ["match", ["coalesce", ["get", "routeIndex"], 0], 0, 6, 1, 5, 2, 4, 4],
          "line-opacity": ["match", ["coalesce", ["get", "routeIndex"], 0], 0, 0.95, 1, 0.7, 2, 0.55, 0.5],
        },
      });
      map.addSource("core-objects", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "core-objects-circles",
        type: "circle",
        source: "core-objects",
        paint: {
          "circle-radius": 5,
          "circle-color": "#2563eb",
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#1e3a8a",
          "circle-opacity": 0.85,
        },
      });
      map.addSource("overpass-pois", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "overpass-pois-circles",
        type: "circle",
        source: "overpass-pois",
        paint: {
          "circle-radius": 6,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#7c2d12",
          "circle-opacity": 0.9,
        },
      });
      map.on("mouseenter", "core-objects-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "core-objects-circles", () => {
        if (!mapPickModeRef.current) map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "overpass-pois-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "overpass-pois-circles", () => {
        if (!mapPickModeRef.current) map.getCanvas().style.cursor = "";
      });

      map.on("click", (e) => {
        const poiLayers = ["core-objects-circles", "overpass-pois-circles"];
        const hits = map.queryRenderedFeatures(e.point, { layers: poiLayers });
        if (hits.length > 0) {
          const f = hits[0];
          const coords = f.geometry?.type === "Point" ? (f.geometry.coordinates as number[]) : null;
          if (!coords) return;
          popupRef.current?.remove();
          if (f.layer?.id === "core-objects-circles") {
            const name = String((f.properties as { name?: string } | undefined)?.name ?? "Объект из базы");
            popupRef.current = new maplibregl.Popup({ offset: 12 })
              .setLngLat([coords[0], coords[1]])
              .setText(name)
              .addTo(map);
          } else {
            const props = (f.properties as { label?: string; tags?: Record<string, string> } | undefined) ?? {};
            const text = `${props.label ?? "Объект OSM"} — ${objectTypeLabel(props.tags, "инфраструктура")}`;
            popupRef.current = new maplibregl.Popup({ offset: 12 })
              .setLngLat([coords[0], coords[1]])
              .setText(text)
              .addTo(map);
          }
          return;
        }
        const pick = mapPickModeRef.current;
        if (!pick) return;
        const point: [number, number] = [e.lngLat.lat, e.lngLat.lng];
        const text = `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
        if (pick === "from") {
          setFromPoint(point);
          setFromQ(text);
          setMapPickMode(null);
        } else {
          setToPoint(point);
          setToQ(text);
          setMapPickMode(null);
        }
      });
      setMapReady(true);
    });
    return () => {
      setMapReady(false);
      fromMarkerRef.current?.remove();
      toMarkerRef.current?.remove();
      meMarkerRef.current?.remove();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map?.getSource("core-objects")) return;
    const features: GeoJSON.Feature[] = objects.map((obj) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [obj.y, obj.x] },
      properties: { id: obj.id, name: obj.display_name },
    }));
    (map.getSource("core-objects") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
  }, [objects, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fromPoint) return;
    fromMarkerRef.current?.remove();
    fromMarkerRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([fromPoint[1], fromPoint[0]])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setText("Старт"))
      .addTo(map);
  }, [fromPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!toPoint) {
      toMarkerRef.current?.remove();
      toMarkerRef.current = null;
      return;
    }
    toMarkerRef.current?.remove();
    toMarkerRef.current = new maplibregl.Marker({ color: "#dc2626" })
      .setLngLat([toPoint[1], toPoint[0]])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setText("Финиш"))
      .addTo(map);
  }, [toPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!myPoint) {
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      return;
    }
    meMarkerRef.current?.remove();
    meMarkerRef.current = new maplibregl.Marker({ color: "#0ea5e9" })
      .setLngLat([myPoint[1], myPoint[0]])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setText("Моё местоположение"))
      .addTo(map);
  }, [myPoint]);

  useEffect(() => {
    if (!useMyLocationRouting) {
      if (geoWatchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      return;
    }
    if (!window.isSecureContext) {
      setErr("Геолокация в браузере блокируется на http. Нужен https или localhost.");
      setUseMyLocationRouting(false);
      return;
    }
    if (!navigator.geolocation) {
      setErr("Геолокация не поддерживается браузером.");
      return;
    }
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyPoint(point);
      },
      () => setErr("Нет доступа к геолокации. Разрешите доступ к местоположению в браузере."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 },
    );
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyPoint(point);
      },
      () => setErr("Нет доступа к геолокации. Разрешите доступ к местоположению в браузере."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 },
    );
    return () => {
      if (geoWatchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
    };
  }, [useMyLocationRouting]);

  useEffect(() => {
    if (!useMyLocationRouting || !myPoint) return;
    setFromPoint(myPoint);
    setFromQ(`${myPoint[0].toFixed(6)}, ${myPoint[1].toFixed(6)}`);
  }, [myPoint, useMyLocationRouting]);

  useEffect(() => {
    return () => {
      if (fromSuggestTimerRef.current != null) window.clearTimeout(fromSuggestTimerRef.current);
      if (toSuggestTimerRef.current != null) window.clearTimeout(toSuggestTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = mapRef.current?.getCanvas();
    if (!el) return;
    el.style.cursor = mapPickMode ? "crosshair" : "";
  }, [mapPickMode]);

  const parseLatLon = (value: string): [number, number] | null => {
    const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  };

  const resolvePoint = async (text: string, selectedPoint: [number, number] | null) => {
    if (selectedPoint) return selectedPoint;
    const parsed = parseLatLon(text);
    if (parsed) return parsed;
    const enc = encodeURIComponent(text.trim());
    const hits = await fetchJson<{ lat: number; lon: number }[]>(`${routingBase}/v1/geocode/search?q=${enc}&limit=1`);
    if (!hits.length) throw new Error("Не удалось найти одну из точек.");
    return [hits[0].lat, hits[0].lon] as [number, number];
  };

  const resolveAndSetPoint = async (target: "from" | "to") => {
    try {
      if (target === "from") {
        const point = await resolvePoint(fromQ, fromPoint);
        setFromPoint(point);
      } else {
        const point = await resolvePoint(toQ, toPoint);
        setToPoint(point);
      }
    } catch {
      // Silent on blur/focusout: explicit errors are shown on route build.
    }
  };

  const loadSuggestions = async (q: string, target: "from" | "to") => {
    const term = q.trim();
    if (term.length < 2) {
      if (target === "from") setFromSuggestions([]);
      else setToSuggestions([]);
      return;
    }
    const local = objects
      .filter((o) => o.display_name.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 5)
      .map((o) => ({ lat: o.x, lon: o.y, display_name: o.display_name }));
    const reqId = target === "from" ? ++fromSuggestReqRef.current : ++toSuggestReqRef.current;
    try {
      const hits = await fetchJson<{ lat: number; lon: number; display_name: string }[]>(
        `${routingBase}/v1/geocode/search?q=${encodeURIComponent(term)}&limit=5`,
      );
      if (target === "from" && reqId !== fromSuggestReqRef.current) return;
      if (target === "to" && reqId !== toSuggestReqRef.current) return;
      const merged = [...local, ...hits].filter(
        (item, idx, arr) => arr.findIndex((x) => x.display_name === item.display_name) === idx,
      );
      if (target === "from") {
        setFromSuggestions(merged);
      } else {
        setToSuggestions(merged);
      }
    } catch {
      if (target === "from" && reqId !== fromSuggestReqRef.current) return;
      if (target === "to" && reqId !== toSuggestReqRef.current) return;
      if (target === "from") {
        setFromSuggestions(local);
      } else {
        setToSuggestions(local);
      }
    }
  };

  const queueSuggestions = (q: string, target: "from" | "to") => {
    const timerRef = target === "from" ? fromSuggestTimerRef : toSuggestTimerRef;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void loadSuggestions(q, target);
    }, 260);
  };

  const build = async () => {
    if (buildInFlightRef.current) return;
    buildInFlightRef.current = true;
    setErr(null);
    setMsg(null);
    const map = mapRef.current;
    if ((!fromQ.trim() && !useMyLocationRouting) || !toQ.trim()) {
      setErr("Укажите «Откуда» и «Куда».");
      buildInFlightRef.current = false;
      return;
    }
    try {
      const fromCoord = useMyLocationRouting ? myPoint : await resolvePoint(fromQ, fromPoint);
      if (!fromCoord) {
        setErr("Текущее местоположение еще не определено.");
        buildInFlightRef.current = false;
        return;
      }
      const toCoord = await resolvePoint(toQ, toPoint);
      const requestProfile = profile;
      const res = await fetch(`${routingBase}/v1/directions/geojson`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromCoord,
          to: toCoord,
          profile,
          alternativeCount,
        }),
      });
      const text = await res.text();
      if (res.status === 429) {
        altRateLimitUntilRef.current = Date.now() + 120_000;
        setErr(
          "Слишком много запросов к сервису маршрутов (лимит OpenRouteService). Подождите 1–2 минуты или временно выберите меньше альтернатив.",
        );
        return;
      }
      if (!res.ok || hasOrs2007(text)) {
        setErr(errorTextFromResponse(res, text));
        return;
      }
      let data: OrsGeoJson;
      try {
        data = JSON.parse(text) as OrsGeoJson;
      } catch {
        setErr("Сервис маршрутов вернул не JSON (проверьте прокси /routing и ключ OPENROUTE_API_KEY).");
        return;
      }
      const routeBasesAll = routeFeaturesFromOrs(data);
      const routeFeaturesRaw: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      for (const f of routeBasesAll) {
        if (routeFeaturesRaw.length >= alternativeCount) break;
        if (isTooSimilarRoute(f, routeFeaturesRaw)) continue;
        routeFeaturesRaw.push(f);
      }
      const coords = lineCoordsFromOrs(data);
      if (map?.getLayer("route-line")) {
        map.setPaintProperty("route-line", "line-color", [
          "match",
          ["coalesce", ["get", "routeIndex"], 0],
          0,
          "#22c55e",
          1,
          "#eab308",
          2,
          "#ef4444",
          "#94a3b8",
        ]);
      }
      const bb = bboxFromLngLats(coords.map(([lat, lon]) => [lat, lon]));
      if (bb && map) map.fitBounds(bb, { padding: 48, maxZoom: 16 });
      let overpassFeatures: GeoJSON.Feature[] = [];
      if (bb && map?.getSource("overpass-pois")) {
        const bbox = `${bb[0][0]},${bb[0][1]},${bb[1][0]},${bb[1][1]}`;
        try {
          const pois = await fetchJson<GeoJSON.FeatureCollection>(
            `${routingBase}/v1/overpass/objects?bbox=${encodeURIComponent(bbox)}&profile=${encodeURIComponent(requestProfile)}`,
          );
          overpassFeatures = pois.features ?? [];
          (map.getSource("overpass-pois") as maplibregl.GeoJSONSource).setData(pois);
        } catch {
          overpassFeatures = [];
          (map.getSource("overpass-pois") as maplibregl.GeoJSONSource).setData({
            type: "FeatureCollection",
            features: [],
          });
        }
      }
      const stepHazardPoints = stepObstaclePoints(overpassFeatures);
      const wheelchairStepsNearSq = 0.00042 * 0.00042;

      const now = Date.now();
      const inRateLimitCooldown = now < altRateLimitUntilRef.current;

      if (!inRateLimitCooldown && routeFeaturesRaw.length > 0 && routeFeaturesRaw.length < alternativeCount) {
        const mainRoute = routeFeaturesRaw[0];
        const mainLine = routeLatLonCoords(mainRoute);
        const viaCandidates = overpassFeatures
          .map((poi) => {
            const c = poi.geometry?.type === "Point" ? (poi.geometry.coordinates as number[]) : null;
            if (!c || c.length < 2) return null;
            const lat = c[1];
            const lon = c[0];
            const foot = nearestFootOnPolyline(mainLine, lat, lon);
            if (!foot) return null;
            return { lat, lon, progress: foot.progress01, distSq: foot.distSq };
          })
          .filter((x): x is { lat: number; lon: number; progress: number; distSq: number } => Boolean(x))
          .filter((x) => x.progress > 0.1 && x.progress < 0.9)
          .sort((a, b) => a.distSq - b.distSq)
          .filter((x, idx, arr) => arr.findIndex((y) => Math.abs(y.progress - x.progress) < 0.06) === idx)
          .slice(0, 8);

        for (const via of viaCandidates) {
          if (routeFeaturesRaw.length >= alternativeCount) break;
          const viaRes = await fetch(`${routingBase}/v1/directions/geojson`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromCoord,
              to: toCoord,
              profile: requestProfile,
              via: [[via.lat, via.lon]],
            }),
          });
          const viaText = await viaRes.text();
          if (viaRes.status === 429) {
            altRateLimitUntilRef.current = Date.now() + 60_000;
            break;
          }
          if (!viaRes.ok || hasOrs2007(viaText)) continue;
          let viaData: OrsGeoJson;
          try {
            viaData = JSON.parse(viaText) as OrsGeoJson;
          } catch {
            continue;
          }
          const cand = routeFeaturesFromOrs(viaData)[0];
          if (!cand) continue;
          if (
            requestProfile === "wheelchair" &&
            routeUnacceptableNearSteps(cand, stepHazardPoints, wheelchairStepsNearSq)
          ) {
            continue;
          }
          if (isTooSimilarRoute(cand, routeFeaturesRaw)) continue;
          routeFeaturesRaw.push(cand);
        }
      }

      const allRouteFeatures = routeFeaturesRaw.slice(0, alternativeCount);
      const ranked = [...allRouteFeatures]
        .map((f) => ({
          feature: f,
          overpassScore: overpassCoverageScore(f, overpassFeatures, requestProfile),
          infraScore: infraScoreForRoute(f, objects, overpassFeatures, requestProfile),
        }))
        .sort((a, b) => b.overpassScore - a.overpassScore || b.infraScore - a.infraScore)
        .map((row, idx) => ({
          ...row.feature,
          properties: { ...(row.feature.properties ?? {}), routeIndex: idx, infraScore: row.infraScore, overpassScore: row.overpassScore },
        }))
        .map((f, idx) => ({
        ...f,
        properties: { ...(f.properties ?? {}), routeIndex: idx },
      }));
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: ranked,
      };
      if (map?.getSource("route")) {
        (map.getSource("route") as maplibregl.GeoJSONSource).setData(fc);
      }

      const feat = data.features?.[0];
      const summary = (feat?.properties as { summary?: { distance?: number; duration?: number } })?.summary;
      const km = summary?.distance != null ? (summary.distance / 1000).toFixed(2) : "?";
      const min = summary?.duration != null ? Math.round(summary.duration / 60) : null;
      const stairWarn =
        requestProfile === "wheelchair" &&
        ranked.length > 0 &&
        stepHazardPoints.length > 0 &&
        routeUnacceptableNearSteps(ranked[0], stepHazardPoints, wheelchairStepsNearSq);
      setMsg(
        `Маршрут (${requestProfile}): ~${km} км${min != null ? `, ~${min} мин` : ""}. Альтернатив: ${ranked.length}.${stairWarn ? " Внимание: выбранный путь проходит рядом с лестницей по данным OSM — перепроверьте участок." : ""}`,
      );
      if (inRateLimitCooldown) {
        setErr(
          "Недавно срабатывал лимит запросов к маршрутам. Подождите немного и постройте снова — сейчас все альтернативы приходят одним запросом к сервису.",
        );
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      buildInFlightRef.current = false;
    }
  };

  return (
    <div className="map-layout">
      <aside className="side-panel">
        <h2>Маршрутизатор</h2>
        <p className="muted">
          Запросы идут в отдельный сервис <code>mapip-routing-service</code> (геокод + OpenRouteService), как у внешнего
          картографического API.
        </p>
        <div className="field">
          <label>Откуда</label>
          <input
            value={fromQ}
            disabled={useMyLocationRouting}
            onChange={(e) => {
              setFromQ(e.target.value);
              setFromPoint(null);
              queueSuggestions(e.target.value, "from");
            }}
            onBlur={() => void resolveAndSetPoint("from")}
            placeholder={useMyLocationRouting ? "Текущее местоположение (live)" : "Адрес или место"}
          />
          {fromSuggestions.length > 0 && (
            <div className="search-results">
              {fromSuggestions.map((s, i) => (
                <div
                  key={`from-${i}-${s.lat}-${s.lon}`}
                  className="search-hit"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setFromQ(s.display_name);
                    setFromPoint([s.lat, s.lon]);
                    setFromSuggestions([]);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <p>{s.display_name}</p>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className={`btn btn-sm ${mapPickMode === "from" ? "btn-nav-active" : ""}`}
            disabled={useMyLocationRouting}
            onClick={() => setMapPickMode((m) => (m === "from" ? null : "from"))}
          >
            {useMyLocationRouting ? "Откуда: геолокация" : mapPickMode === "from" ? "Кликните по карте для старта…" : "Указать «Откуда» на карте"}
          </button>
        </div>
        <div className="field">
          <label>Куда</label>
          <input
            value={toQ}
            onChange={(e) => {
              setToQ(e.target.value);
              setToPoint(null);
              queueSuggestions(e.target.value, "to");
            }}
            onBlur={() => void resolveAndSetPoint("to")}
            placeholder="Адрес или место"
          />
          {toSuggestions.length > 0 && (
            <div className="search-results">
              {toSuggestions.map((s, i) => (
                <div
                  key={`to-${i}-${s.lat}-${s.lon}`}
                  className="search-hit"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setToQ(s.display_name);
                    setToPoint([s.lat, s.lon]);
                    setToSuggestions([]);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <p>{s.display_name}</p>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className={`btn btn-sm ${mapPickMode === "to" ? "btn-nav-active" : ""}`}
            onClick={() => setMapPickMode((m) => (m === "to" ? null : "to"))}
          >
            {mapPickMode === "to" ? "Кликните по карте для финиша…" : "Указать «Куда» на карте"}
          </button>
        </div>
        <p className="muted small">
          Клик по слоям карты (синие и оранжевые точки) — подсказка об объекте. Точки маршрута на карте ставятся только после нажатия кнопок выше.
        </p>
        <label className="muted small" style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={useMyLocationRouting}
            onChange={(e) => {
              setUseMyLocationRouting(e.target.checked);
              if (e.target.checked && !window.isSecureContext) {
                setErr("Геолокация работает только в защищенном контексте (https/localhost).");
              }
              if (e.target.checked && myPoint) {
                setFromPoint(myPoint);
                setFromQ(`${myPoint[0].toFixed(6)}, ${myPoint[1].toFixed(6)}`);
              }
            }}
            style={{ marginRight: 8 }}
          />
          Строить маршрут от моего местоположения (в реальном времени)
        </label>
        <div className="field">
          <label>Профиль ORS</label>
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="wheelchair">Колясочник (wheelchair)</option>
            <option value="foot-walking">Пешеход</option>
            <option value="driving-car">Авто</option>
          </select>
        </div>
        <div className="field">
          <label>Вариантов маршрута</label>
          <select value={alternativeCount} onChange={(e) => setAlternativeCount(Number(e.target.value) || 1)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <button type="button" className="btn" onClick={() => void build()}>
          Построить маршрут
        </button>
        {err && (
          <p className="err" style={{ marginTop: 10 }}>
            {err}
          </p>
        )}
        {msg && (
          <p className="ok" style={{ marginTop: 10 }}>
            {msg}
          </p>
        )}
      </aside>
      <div className="map-wrap">
        <div ref={mapEl} className="map-canvas" />
      </div>
    </div>
  );
}
