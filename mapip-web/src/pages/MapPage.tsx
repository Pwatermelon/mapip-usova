import maplibregl, { Map as MLMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { coreBase, fetchJson } from "../api";

type MapObject = {
  id: number;
  x: number;
  y: number;
  display_name: string;
  adress: string;
  type: string;
  description?: string;
  rating?: number;
};

type CommentRow = {
  id: number;
  text: string;
  rate: number;
  user?: { name: string };
  date?: string;
};

function objectsToGeoJson(objects: MapObject[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: objects.map((o) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [o.y, o.x] },
      properties: { id: o.id, label: o.display_name },
    })),
  };
}

export function MapPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const objectsRef = useRef<MapObject[]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<MapObject[] | null>(null);
  const [selected, setSelected] = useState<MapObject | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentRate, setCommentRate] = useState(5);
  const [userId, setUserId] = useState<number | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  objectsRef.current = objects;

  const refreshUser = useCallback(async () => {
    try {
      const u = await fetchJson<{ id: number }>(`${coreBase}/api/users/current-user`);
      setUserId(u.id);
    } catch {
      setUserId(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

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

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: ["objects-circles"] });
      const id = feats[0]?.properties?.id as number | undefined;
      if (id == null) return;
      const obj = objectsRef.current.find((o) => o.id === id) ?? null;
      setSelected(obj);
    };

    map.on("load", () => {
      map.addSource("objects", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "objects-circles",
        type: "circle",
        source: "objects",
        paint: {
          "circle-radius": 9,
          "circle-color": "#3b82f6",
          "circle-opacity": 0.55,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#93c5fd",
        },
      });
      map.on("click", onClick);
    });

    return () => {
      map.off("click", onClick);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("objects")) return;
    (map.getSource("objects") as maplibregl.GeoJSONSource).setData(objectsToGeoJson(objects));
  }, [objects]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchJson<MapObject[]>(`${coreBase}/GetSocialMapObject`);
        setObjects(data);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) {
      setComments([]);
      return;
    }
    void (async () => {
      try {
        const c = await fetchJson<CommentRow[]>(
          `${coreBase}/api/comment/GetCommentsByMapObject/${selected.id}`,
        );
        setComments(c);
      } catch {
        setComments([]);
      }
    })();
  }, [selected]);

  const runSearch = async () => {
    setErr(null);
    const q = encodeURIComponent(search.trim());
    try {
      const data = await fetchJson<MapObject[]>(`${coreBase}/api/SocialMapObject/SearchBy/?search=${q}`);
      setHits(data);
    } catch (e) {
      setErr(String(e));
    }
  };

  const flyTo = (o: MapObject) => {
    mapRef.current?.flyTo({ center: [o.y, o.x], zoom: 15 });
    setSelected(o);
  };

  const login = async () => {
    setErr(null);
    try {
      const res = await fetch(`${coreBase}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: authEmail, password: authPass }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { detail?: { message?: string } | string };
        const d = j.detail;
        setErr(typeof d === "object" && d && "message" in d ? d.message : "Ошибка входа");
        return;
      }
      await refreshUser();
      setAuthPass("");
    } catch (e) {
      setErr(String(e));
    }
  };

  const sendComment = async () => {
    if (!selected || userId == null) {
      setErr("Войдите, чтобы оставить комментарий.");
      return;
    }
    setErr(null);
    try {
      const res = await fetch(`${coreBase}/api/comment/AddComment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          newText: commentText,
          newRate: commentRate,
          user: userId,
          mapObject: selected.id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCommentText("");
      const c = await fetchJson<CommentRow[]>(
        `${coreBase}/api/comment/GetCommentsByMapObject/${selected.id}`,
      );
      setComments(c);
    } catch (e) {
      setErr(String(e));
    }
  };

  const list = hits ?? objects.slice(0, 14);

  return (
    <div className="map-layout">
      <aside className="side-panel">
        <h2>Объекты и поиск</h2>
        {userId != null ? (
          <p className="pill">В сессии: пользователь {userId}</p>
        ) : (
          <div className="field">
            <label>Вход</label>
            <input placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            <input
              style={{ marginTop: 6 }}
              type="password"
              placeholder="Пароль"
              value={authPass}
              onChange={(e) => setAuthPass(e.target.value)}
            />
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => void login()}>
              Войти
            </button>
          </div>
        )}
        <div className="field" style={{ marginTop: 12 }}>
          <label>Поиск</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название или адрес" />
            <button type="button" className="btn btn-ghost" onClick={() => void runSearch()}>
              Найти
            </button>
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="search-results">
          {list.map((o) => (
            <div
              key={o.id}
              className="search-hit"
              onClick={() => flyTo(o)}
              onKeyDown={(e) => e.key === "Enter" && flyTo(o)}
              role="button"
              tabIndex={0}
            >
              <h3>{o.display_name}</h3>
              <p>{o.adress}</p>
            </div>
          ))}
        </div>
        {selected && (
          <div style={{ marginTop: 16 }}>
            <h2>Выбрано</h2>
            <p>
              <strong>{selected.display_name}</strong>
            </p>
            <p className="muted">{selected.type}</p>
            <p className="muted">{selected.adress}</p>
            <h3 style={{ fontSize: "0.95rem", marginTop: 12 }}>Комментарии</h3>
            {comments.length === 0 && <p className="muted">Пока нет.</p>}
            {comments.map((c) => (
              <div key={c.id} style={{ marginBottom: 8, fontSize: "0.88rem" }}>
                <strong>{c.user?.name ?? "—"}</strong>: {c.text}{" "}
                <span className="muted">({c.rate})</span>
              </div>
            ))}
            <div className="field">
              <label>Новый комментарий</label>
              <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} />
            </div>
            <div className="field">
              <label>Оценка 1–5</label>
              <input
                type="number"
                min={1}
                max={5}
                value={commentRate}
                onChange={(e) => setCommentRate(Number(e.target.value))}
              />
            </div>
            <button type="button" className="btn" onClick={() => void sendComment()}>
              Отправить
            </button>
          </div>
        )}
      </aside>
      <div className="map-wrap">
        <div ref={mapEl} className="map-canvas" />
      </div>
    </div>
  );
}
