import maplibregl, { Map as MLMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { coreBase, fetchJson, routingBase } from "../api";

type MapObject = {
  id: number;
  x: number;
  y: number;
  display_name: string;
  adress: string;
  type: string;
  description?: string;
  rating?: number;
  iri?: string;
};

type CommentRow = {
  id: number;
  text: string;
  rate: number;
  userId?: number;
  user?: { name: string };
  date?: string;
};

type OntologyInfo = {
  categories?: string[];
  accessibilityElements?: string[];
};
type RecommendationRow = { mapObject: MapObject; distance?: number };
type Mode = "search" | "personal" | "popular" | "likes";
type OrsGeoJson = GeoJSON.FeatureCollection & { features?: GeoJSON.Feature[] };

const disabilityLabels: Record<string, string> = {
  Г: "Для людей с нарушением слуха",
  К: "Для инвалидов, передвигающихся на коляске",
  О: "Для людей с нарушением опорно-двигательного аппарата",
  С: "Для людей с нарушением зрения",
  У: "Для людей с нарушением умственного развития",
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

function categoryByType(type: string): "Красота" | "Культура" | "Еда" | "Шопинг" | "Туризм" | null {
  const t = type.toLowerCase();
  if (t.includes("парикмах") || t.includes("салон")) return "Красота";
  if (t.includes("библиот") || t.includes("музе") || t.includes("театр") || t.includes("кино")) return "Культура";
  if (t.includes("ресторан") || t.includes("кофе") || t.includes("бистро")) return "Еда";
  if (t.includes("магаз") || t.includes("торгов") || t.includes("маркет")) return "Шопинг";
  if (t.includes("тур") || t.includes("гостин") || t.includes("пляж")) return "Туризм";
  return null;
}

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

export function MapPage() {
  const { user } = useAuth();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const objectsRef = useRef<MapObject[]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<MapObject[] | null>(null);
  const [selected, setSelected] = useState<MapObject | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [ontology, setOntology] = useState<OntologyInfo | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentRate, setCommentRate] = useState(5);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const [mode, setMode] = useState<Mode>("search");
  const [recommendations, setRecommendations] = useState<MapObject[]>([]);
  const [recommendationRows, setRecommendationRows] = useState<RecommendationRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accOptions, setAccOptions] = useState<string[]>([]);
  const [filterDisability, setFilterDisability] = useState<string[]>([]);
  const [filterAccessibility, setFilterAccessibility] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  objectsRef.current = objects;

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
      map.on("click", onClick);
    });

    return () => {
      map.off("click", onClick);
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    void (async () => {
      try {
        const data = await fetchJson<string[]>(`${coreBase}/api/SocialMapObject/get/accessibility`);
        setAccOptions(data);
      } catch {
        setAccOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) {
      setComments([]);
      setOntology(null);
      setFavorite(false);
      setEditingCommentId(null);
      setCommentText("");
      setCommentRate(5);
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

  useEffect(() => {
    if (!selected || !user) {
      setFavorite(false);
      return;
    }
    void (async () => {
      try {
        const likes = await fetchJson<MapObject[]>(`${coreBase}/api/users/GetLikesByUserId/${user.id}`);
        setFavorite(likes.some((x) => x.id === selected.id));
      } catch {
        setFavorite(false);
      }
    })();
  }, [selected, user]);

  useEffect(() => {
    if (!selected || !user) {
      setEditingCommentId(null);
      setCommentText("");
      setCommentRate(5);
      return;
    }
    void (async () => {
      try {
        const own = await fetchJson<CommentRow>(
          `${coreBase}/api/comment/GetCommentsByMapObject?mapObjectId=${selected.id}&userId=${user.id}`,
        );
        setEditingCommentId(own.id);
        setCommentText(own.text ?? "");
        setCommentRate(own.rate ?? 5);
      } catch {
        setEditingCommentId(null);
        setCommentText("");
        setCommentRate(5);
      }
    })();
  }, [selected, user]);

  const activateMode = (next: Mode) => {
    setMode(next);
    setActiveCategory(null);
    setShowFilter(false);
    setMenuOpen(false);
    setShowComments(true);
    setErr(null);
    if (next !== "search") setHits(null);
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setShowFilter(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => {
    if (mode !== "personal" && mode !== "popular") {
      setShowFilter(false);
      setFilterDisability([]);
      setFilterAccessibility([]);
    }
  }, [mode]);

  useEffect(() => {
    const iri = selected?.iri;
    if (!iri) return;
    void (async () => {
      try {
        const body = new URLSearchParams({ iri });
        const res = await fetch("/client/getOntologyInfo", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as OntologyInfo;
        setOntology(data);
      } catch {
        setOntology(null);
      }
    })();
  }, [selected]);

  const runSearch = async () => {
    activateMode("search");
    setErr(null);
    const term = search.trim();
    if (!term) {
      setHits(null);
      return;
    }
    const q = encodeURIComponent(term);
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

  const loadPersonal = async () => {
    activateMode("personal");
    if (!user) {
      setErr("Нужна авторизация для персональных рекомендаций.");
      return;
    }
    try {
      const data = await fetchJson<MapObject[]>(`${coreBase}/api/recommendation/GetRecommendationsByUserId/${user.id}`);
      setRecommendations(data);
      setRecommendationRows(data.map((d) => ({ mapObject: d })));
    } catch (e) {
      setErr(String(e));
      setRecommendations([]);
      setRecommendationRows([]);
    }
  };

  const loadPopular = async () => {
    activateMode("popular");
    try {
      const data = await fetchJson<MapObject[]>(`${coreBase}/api/recommendation/GetPopularRecommendations`);
      setRecommendations(data);
      setRecommendationRows(data.map((d) => ({ mapObject: d })));
    } catch (e) {
      setErr(String(e));
      setRecommendations([]);
      setRecommendationRows([]);
    }
  };

  const loadLikes = async () => {
    activateMode("likes");
    if (!user) {
      setErr("Нужна авторизация для избранного.");
      return;
    }
    try {
      const data = await fetchJson<MapObject[]>(`${coreBase}/api/users/GetLikesByUserId/${user.id}`);
      setRecommendations(data);
      setRecommendationRows(data.map((d) => ({ mapObject: d })));
    } catch (e) {
      setErr(String(e));
      setRecommendations([]);
      setRecommendationRows([]);
    }
  };

  const sendComment = async () => {
    if (!selected || !user) {
      setErr("Войдите через кнопку в шапке, чтобы оставить комментарий.");
      return;
    }
    setErr(null);
    try {
      const url = editingCommentId
        ? `${coreBase}/api/comment/EditComment/${editingCommentId}`
        : `${coreBase}/api/comment/AddComment`;
      const method = editingCommentId ? "PUT" : "POST";
      const body = editingCommentId
        ? JSON.stringify({ newText: commentText, newRate: commentRate })
        : JSON.stringify({
            newText: commentText,
            newRate: commentRate,
            user: user.id,
            mapObject: selected.id,
          });
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      const c = await fetchJson<CommentRow[]>(
        `${coreBase}/api/comment/GetCommentsByMapObject/${selected.id}`,
      );
      setComments(c);
      const mine = c.find((x) => x.userId === user.id || x.user?.name === user.name);
      if (mine) setEditingCommentId(mine.id);
    } catch (e) {
      setErr(String(e));
    }
  };

  const buildRouteToObject = async (o: MapObject) => {
    const map = mapRef.current;
    if (!map) return;
    setErr(null);
    if (!navigator.geolocation) {
      setErr("Геолокация недоступна в браузере.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const from: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          const to: [number, number] = [o.x, o.y];
          const res = await fetch(`${routingBase}/v1/directions/geojson`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from, to, profile: "foot-walking", alternativeCount: 1 }),
          });
          if (!res.ok) throw new Error(await res.text());
          const data = (await res.json()) as OrsGeoJson;
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
          if (map.getSource("route")) {
            (map.getSource("route") as maplibregl.GeoJSONSource).setData(fc);
          }
          map.flyTo({ center: [o.y, o.x], zoom: 15 });
          if (user) {
            const now = new Date().toISOString().split("T")[0];
            await fetch(`${coreBase}/api/routes/AddRoute`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: user.id, mapObjectId: o.id, date: now }),
            });
          }
        } catch (e) {
          setErr(String(e));
        }
      },
      () => setErr("Не удалось получить текущую геопозицию."),
    );
  };

  const toggleFavorite = async () => {
    if (!selected || !user) {
      setErr("Нужна авторизация для избранного.");
      return;
    }
    setErr(null);
    const fd = new FormData();
    fd.append("userID", String(user.id));
    fd.append("mapObjectID", String(selected.id));
    try {
      const res = await fetch(`${coreBase}/api/users/${favorite ? "RemoveFavorite" : "AddFavorite"}`, {
        method: favorite ? "DELETE" : "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setFavorite((v) => !v);
    } catch (e) {
      setErr(String(e));
    }
  };
  const baseRows: RecommendationRow[] =
    mode === "search" ? (hits ?? objects.slice(0, 14)).map((m) => ({ mapObject: m })) : recommendationRows;
  const listRows = useMemo(() => {
    if (!activeCategory) return baseRows;
    return baseRows.filter((r) => categoryByType(r.mapObject.type) === activeCategory);
  }, [baseRows, activeCategory]);
  const list = listRows.map((r) => r.mapObject);
  const displayedOnMap = list.length ? list : mode === "search" ? objects : recommendations;

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("objects")) return;
    (map.getSource("objects") as maplibregl.GeoJSONSource).setData(objectsToGeoJson(displayedOnMap));
  }, [displayedOnMap]);

  const applyFilter = async () => {
    if (mode !== "personal" && mode !== "popular") return;
    const endpoint =
      mode === "personal" ? "/api/recommendation/GetFilteringIntersectedData" : "/api/recommendation/GetFilteringPopularData";
    const params = new URLSearchParams();
    params.append("user", String(user?.id ?? 1));
    filterDisability.forEach((v) => params.append("Categories", v));
    filterAccessibility.forEach((v) => params.append("AccessibilityElements", v));
    try {
      const rows = await fetchJson<RecommendationRow[]>(`${coreBase}${endpoint}?${params.toString()}`);
      setRecommendations(rows.map((r) => r.mapObject));
      setRecommendationRows(rows);
      setShowFilter(false);
    } catch (e) {
      setErr(String(e));
    }
  };

  const sortByDistance = async () => {
    if (!navigator.geolocation || (mode !== "personal" && mode !== "popular")) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const body = {
          Recommendations: recommendations.map((r) => ({ mapObject: r, distance: 0 })),
          UserLatitude: pos.coords.latitude,
          UserLongitude: pos.coords.longitude,
        };
        const res = await fetch(`${coreBase}/api/recommendation/SortRecommendations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const rows = (await res.json()) as RecommendationRow[];
        setRecommendations(rows.map((r) => ({ ...r.mapObject, adress: `${r.mapObject.adress}` })));
        setRecommendationRows(rows);
      } catch (e) {
        setErr(String(e));
      }
    });
  };

  return (
    <div className="map-layout">
      <aside className="side-panel">
        <div className="toolbar-header">
          <button type="button" className="menu-icon-btn" onClick={() => setMenuOpen(true)}>
            ☰
          </button>
        </div>
        <h2>{mode === "search" ? "Объекты и поиск" : "Режим просмотра"}</h2>
        {!user && <p className="hint-banner muted">Вход — в правом верхнем углу.</p>}
        <div className="field-row" style={{ marginBottom: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={() => activateMode("search")}>
            Поиск
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void loadPersonal()}>
            Вам стоит посетить
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void loadPopular()}>
            По мнению общества
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void loadLikes()}>
            Избранное
          </button>
        </div>
        {menuOpen && (
          <div className="slide-menu-open">
            <div className="menu-header">
              <button type="button" className="menu-icon-btn" onClick={() => setMenuOpen(false)}>
                ✖
              </button>
            </div>
            <p className="muted">Меню</p>
            <div className="field">
              <button type="button" className="btn btn-ghost" onClick={() => activateMode("search")}>
                Поиск объекта
              </button>
            </div>
            <div className="field">
              <button type="button" className="btn btn-ghost" onClick={() => { void loadPersonal(); setMenuOpen(false); }}>
                Что Вам стоит посетить?
              </button>
            </div>
            <div className="field">
              <button type="button" className="btn btn-ghost" onClick={() => { void loadPopular(); setMenuOpen(false); }}>
                Что стоит посетить по мнению общества?
              </button>
            </div>
            <div className="field">
              <button type="button" className="btn btn-ghost" onClick={() => { void loadLikes(); setMenuOpen(false); }}>
                Избранное
              </button>
            </div>
          </div>
        )}
        {(mode === "personal" || mode === "popular") && (
          <div className="field-row" style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowFilter((v) => !v)}>
              Отфильтровать
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void sortByDistance()}>
              Отсортировать
            </button>
          </div>
        )}
        {showFilter && (
          <div className="legacy-filter-card">
            <h3>Фильтр</h3>
            <p className="muted">Категории инвалидности</p>
            {["Г", "К", "О", "С", "У"].map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={filterDisability.includes(k)}
                  onChange={() =>
                    setFilterDisability((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
                  }
                />{" "}
                {disabilityLabels[k]}
              </label>
            ))}
            <p className="muted">Элементы среды</p>
            {accOptions.map((a) => (
              <label key={a}>
                <input
                  type="checkbox"
                  checked={filterAccessibility.includes(a)}
                  onChange={() =>
                    setFilterAccessibility((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
                  }
                />{" "}
                {a}
              </label>
            ))}
            <div className="field-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => void applyFilter()}>
                Применить
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setFilterDisability([]);
                  setFilterAccessibility([]);
                }}
              >
                Сброс
              </button>
            </div>
          </div>
        )}
        {mode === "search" && (
          <div className="field">
            <label>Поиск</label>
            <div className="field-row">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Название или адрес" />
              <button type="button" className="btn btn-ghost" onClick={() => void runSearch()}>
                Найти
              </button>
            </div>
          </div>
        )}
        {err && <p className="err">{err}</p>}
        <div className="search-results">
          {listRows.map((row) => {
            const o = row.mapObject;
            return (
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
              {typeof row.distance === "number" && <p className="muted">От Вас: {row.distance.toFixed(2)} км</p>}
              {mode === "search" && (
                <div className="field-row" style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await buildRouteToObject(o);
                    }}
                  >
                    Маршрут до точки
                  </button>
                </div>
              )}
              {mode !== "search" && (
                <div className="field-row" style={{ marginTop: 6 }}>
                  {mode === "likes" && user && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const fd = new FormData();
                          fd.append("userID", String(user.id));
                          fd.append("mapObjectID", String(o.id));
                          const res = await fetch(`${coreBase}/api/users/RemoveFavorite`, { method: "DELETE", body: fd });
                          if (!res.ok) throw new Error(await res.text());
                          void loadLikes();
                        } catch (error) {
                          setErr(String(error));
                        }
                      }}
                    >
                      Удалить
                    </button>
                  )}
                  {mode === "personal" && user && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await fetch(
                            `${coreBase}/api/recommendation/RemoveRecommendation/${o.id}/${user.id}`,
                            { method: "DELETE" },
                          );
                          if (!res.ok) throw new Error(await res.text());
                          void loadPersonal();
                        } catch (error) {
                          setErr(String(error));
                        }
                      }}
                    >
                      Не рекомендовать
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
        {selected && (
          <div className="detail-block">
            <div className="field-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>Выбрано</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
                Закрыть
              </button>
            </div>
            <p>
              <strong>{selected.display_name}</strong>
            </p>
            <p className="muted">{selected.type}</p>
            <p className="muted">{selected.adress}</p>
            <div className="field-row" style={{ marginBottom: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void buildRouteToObject(selected)}>
                Маршрут до точки
              </button>
            </div>
            {user && (
              <div className="field-row" style={{ marginBottom: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void toggleFavorite()}>
                  {favorite ? "Удалить из избранного" : "Добавить в избранное"}
                </button>
              </div>
            )}
            <h3 className="detail-subtitle">Данные онтологии</h3>
            {ontology ? (
              <>
                <p className="muted">
                  Категории:{" "}
                  {(ontology.categories ?? [])
                    .map((v) => v.split("^^")[0])
                    .map((v) => disabilityLabels[v] ?? v)
                    .join(", ") || "нет данных"}
                </p>
                <p className="muted">
                  Элементы среды: {(ontology.accessibilityElements ?? []).join(", ") || "нет данных"}
                </p>
              </>
            ) : (
              <p className="muted">Нет данных онтологии или endpoint недоступен.</p>
            )}
            <div className="field-row" style={{ marginBottom: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowComments((v) => !v)}>
                {showComments ? "Скрыть комментарии" : "Показать комментарии"}
              </button>
            </div>
            {showComments && (
              <>
                <h3 className="detail-subtitle">Комментарии</h3>
                {comments.length === 0 && <p className="muted">Пока нет.</p>}
                {comments.map((c) => (
                  <div key={c.id} className="comment-line">
                    <strong>{c.user?.name ?? "—"}</strong>: {c.text}{" "}
                    <span className="muted">({c.rate})</span>{" "}
                    {c.date && <span className="muted">· {new Date(c.date).toLocaleString("ru-RU")}</span>}
                  </div>
                ))}
              </>
            )}
            <div className="field">
              <label>{editingCommentId ? "Редактировать комментарий" : "Новый комментарий"}</label>
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
              {editingCommentId ? "Обновить" : "Отправить"}
            </button>
          </div>
        )}
      </aside>
      <div className="map-wrap">
        <div ref={mapEl} className="map-canvas" />
        {(mode === "personal" || mode === "popular" || mode === "likes") && (
          <div className="legacy-categories">
            {["Красота", "Культура", "Еда", "Шопинг", "Туризм"].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`categoriesButton ${activeCategory === cat ? "active" : ""}`}
                onClick={() => setActiveCategory((v) => (v === cat ? null : cat))}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
