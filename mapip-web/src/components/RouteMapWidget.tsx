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
    const near = route.some(([lat, lon]) => sqDist(lat, lon, poiLat, poiLon) <= nearThresholdSq);
    if (!near) continue;
    score += 3;
    const tags = (poi.properties as { tags?: Record<string, string> } | undefined)?.tags ?? {};
    if (profile === "wheelchair" && (tags.wheelchair || tags.ramp || tags.kerb)) score += 4;
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
  const fromSuggestReqRef = useRef(0);
  const toSuggestReqRef = useRef(0);
  const fromSuggestTimerRef = useRef<number | null>(null);
  const toSuggestTimerRef = useRef<number | null>(null);
  const fromPointRef = useRef<[number, number] | null>(null);
  const toPointRef = useRef<[number, number] | null>(null);
  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ] = useState("");
  const [profile, setProfile] = useState("foot-walking");
  const [alternativeCount, setAlternativeCount] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [fromSuggestions, setFromSuggestions] = useState<{ lat: number; lon: number; display_name: string }[]>([]);
  const [toSuggestions, setToSuggestions] = useState<{ lat: number; lon: number; display_name: string }[]>([]);
  const [fromPoint, setFromPoint] = useState<[number, number] | null>(null);
  const [toPoint, setToPoint] = useState<[number, number] | null>(null);
  const [myPoint, setMyPoint] = useState<[number, number] | null>(null);
  const [useMyLocationRouting, setUseMyLocationRouting] = useState(false);

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
    });
    map.on("click", (e) => {
      const point: [number, number] = [e.lngLat.lat, e.lngLat.lng];
      const text = `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
      if (!fromPointRef.current || (fromPointRef.current && toPointRef.current)) {
        setFromPoint(point);
        setToPoint(null);
        setFromQ(text);
        setToQ("");
      } else {
        setToPoint(point);
        setToQ(text);
      }
    });
    return () => {
      fromMarkerRef.current?.remove();
      toMarkerRef.current?.remove();
      meMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
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
  }, [objects]);

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
    setErr(null);
    setMsg(null);
    const map = mapRef.current;
    if ((!fromQ.trim() && !useMyLocationRouting) || !toQ.trim()) {
      setErr("Укажите «Откуда» и «Куда».");
      return;
    }
    try {
      const fromCoord = useMyLocationRouting ? myPoint : await resolvePoint(fromQ, fromPoint);
      if (!fromCoord) {
        setErr("Текущее местоположение еще не определено.");
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
      const routeFeaturesRaw = routeFeaturesFromOrs(data);
      const coords = lineCoordsFromOrs(data);
      const routeColor =
        requestProfile === "wheelchair" ? "#7c3aed" : requestProfile === "driving-car" ? "#ef4444" : "#22c55e";
      if (map?.getLayer("route-line")) {
        map.setPaintProperty("route-line", "line-color", [
          "match",
          ["coalesce", ["get", "routeIndex"], 0],
          0,
          routeColor,
          1,
          requestProfile === "wheelchair" ? "#8b5cf6" : requestProfile === "driving-car" ? "#f97316" : "#16a34a",
          2,
          requestProfile === "wheelchair" ? "#a78bfa" : requestProfile === "driving-car" ? "#fb923c" : "#15803d",
          routeColor,
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
      const ranked = [...routeFeaturesRaw]
        .map((f) => ({ feature: f, score: infraScoreForRoute(f, objects, overpassFeatures, requestProfile) }))
        .sort((a, b) => b.score - a.score)
        .map((row, idx) => ({ ...row.feature, properties: { ...(row.feature.properties ?? {}), routeIndex: idx, infraScore: row.score } }));
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
      setMsg(
        `Маршрут (${requestProfile}): ~${km} км${min != null ? `, ~${min} мин` : ""}. Альтернатив: ${ranked.length}. Приоритет: инфраструктура доступности (core + overpass), а не длина.`,
      );
    } catch (e) {
      setErr(String(e));
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
        </div>
        <p className="muted small">Можно кликнуть по карте: первый клик — старт, второй — финиш.</p>
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
