import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { coreBase, errorTextFromResponse, fetchJson, routingBase } from "../api";

type MapObject = { id: number; x: number; y: number; display_name: string };
type OrsGeoJson = GeoJSON.FeatureCollection & { features?: GeoJSON.Feature[] };

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

export function RouteMapWidget() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [fromQ, setFromQ] = useState("");
  const [toQ, setToQ] = useState("");
  const [profile, setProfile] = useState("wheelchair");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [objects, setObjects] = useState<MapObject[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchJson<MapObject[]>(`${coreBase}/GetSocialMapObject`);
        setObjects(data);
      } catch {
        setObjects([]);
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
        paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.9 },
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const build = async () => {
    setErr(null);
    setMsg(null);
    const map = mapRef.current;
    if (!fromQ.trim() || !toQ.trim()) {
      setErr("Укажите «Откуда» и «Куда».");
      return;
    }
    try {
      const enc = (s: string) => encodeURIComponent(s.trim());
      const fromHits = await fetchJson<{ lat: number; lon: number }[]>(
        `${routingBase}/v1/geocode/search?q=${enc(fromQ)}&limit=1`,
      );
      const toHits = await fetchJson<{ lat: number; lon: number }[]>(
        `${routingBase}/v1/geocode/search?q=${enc(toQ)}&limit=1`,
      );
      if (!fromHits.length || !toHits.length) {
        setErr("Не удалось найти одну из точек.");
        return;
      }
      const fromCoord = [fromHits[0].lat, fromHits[0].lon] as [number, number];
      const toCoord = [toHits[0].lat, toHits[0].lon] as [number, number];

      const res = await fetch(`${routingBase}/v1/directions/geojson`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromCoord,
          to: toCoord,
          profile,
          alternativeCount: 1,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
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
      const coords = lineCoordsFromOrs(data);
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features:
          coords.length >= 2
            ? [
                {
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: coords.map(([lat, lon]) => [lon, lat]) },
                  properties: {},
                },
              ]
            : [],
      };
      if (map?.getSource("route")) {
        (map.getSource("route") as maplibregl.GeoJSONSource).setData(fc);
      }
      const bb = bboxFromLngLats(coords.map(([lat, lon]) => [lat, lon]));
      if (bb && map) map.fitBounds(bb, { padding: 48, maxZoom: 16 });

      const feat = data.features?.[0];
      const summary = (feat?.properties as { summary?: { distance?: number; duration?: number } })?.summary;
      const km = summary?.distance != null ? (summary.distance / 1000).toFixed(2) : "?";
      const min = summary?.duration != null ? Math.round(summary.duration / 60) : null;
      setMsg(
        `Маршрут: ~${km} км${min != null ? `, ~${min} мин` : ""}. Участки без данных об объектах можно подсветить на клиенте, сравнивая с ${objects.length} объектами из core API.`,
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
          <input value={fromQ} onChange={(e) => setFromQ(e.target.value)} placeholder="Адрес или место" />
        </div>
        <div className="field">
          <label>Куда</label>
          <input value={toQ} onChange={(e) => setToQ(e.target.value)} placeholder="Адрес или место" />
        </div>
        <div className="field">
          <label>Профиль ORS</label>
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="wheelchair">Колясочник (wheelchair)</option>
            <option value="foot-walking">Пешеход</option>
            <option value="driving-car">Авто</option>
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
