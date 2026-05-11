import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { coreBase, fetchJson, routingBase } from "../api";

type MapObject = {
  id: number;
  display_name: string;
  adress: string;
  description?: string;
  workingHours?: string;
  type: string;
  iri?: string;
};

export function EditInfoPage() {
  const { user } = useAuth();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MapObject[]>([]);
  const [selected, setSelected] = useState<MapObject | null>(null);
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<{ lat: number; lon: number; display_name: string }[]>(
    [],
  );
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    map.on("click", (e) => {
      const next = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      setCoords(next);
      setAddress(`${next.lat.toFixed(6)}, ${next.lon.toFixed(6)}`);
      setAddressSuggestions([]);
    });
    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: "#ef4444" })
      .setLngLat([coords.lon, coords.lat])
      .addTo(map);
    map.flyTo({ center: [coords.lon, coords.lat], zoom: 15 });
  }, [coords]);

  const runSearch = async () => {
    setErr(null);
    try {
      const q = encodeURIComponent(query.trim());
      const data = await fetchJson<MapObject[]>(`${coreBase}/api/SocialMapObject/SearchBy/?search=${q}`);
      setHits(data);
    } catch (e) {
      setErr(String(e));
    }
  };

  const choose = (obj: MapObject) => {
    setSelected(obj);
    setAddress(obj.adress ?? "");
    setDescription(obj.description ?? "");
    setWorkingHours(obj.workingHours ?? "");
    setExcluded(false);
    setCoords(null);
  };

  const lookupAddress = async (q: string) => {
    if (q.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    try {
      const data = await fetchJson<{ lat: number; lon: number; display_name: string }[]>(
        `${routingBase}/v1/geocode/search?q=${encodeURIComponent(q.trim())}&limit=5`,
      );
      setAddressSuggestions(data);
    } catch {
      setAddressSuggestions([]);
    }
  };

  const submit = async () => {
    if (!selected) {
      setErr("Сначала выберите объект из поиска.");
      return;
    }
    const fd = new FormData();
    fd.append("editExisting", "true");
    fd.append("mapObjectId", String(selected.id));
    fd.append("name", selected.display_name);
    fd.append("address", address);
    fd.append("description", description);
    fd.append("workingHours", workingHours);
    fd.append("type", selected.type);
    fd.append("excluded", String(excluded));
    if (coords) {
      fd.append("latitude", String(coords.lat));
      fd.append("longitude", String(coords.lon));
    }
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${coreBase}/client/AddMapObject`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Изменения отправлены.");
    } catch (e) {
      setErr(`Не удалось отправить: ${String(e)}. Проверьте endpoint /client/AddMapObject.`);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });
        setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
        setAddressSuggestions([]);
      },
      () => setErr("Не удалось получить геолокацию."),
    );
  };

  return (
    <section className="info-page">
      <h2>Редактировать информацию</h2>
      <p className="score-badge">Накоплено очков: {user?.score ?? 0}</p>
      <div className="field-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск объекта" />
        <button type="button" className="btn btn-ghost" onClick={() => void runSearch()}>
          Найти
        </button>
      </div>
      <div className="search-results">
        {hits.map((obj) => (
          <div key={obj.id} className="search-hit" onClick={() => choose(obj)} role="button" tabIndex={0}>
            <h3>{obj.display_name}</h3>
            <p>{obj.adress}</p>
          </div>
        ))}
      </div>
      {selected && (
        <>
          <div className="field">
            <label>Адрес</label>
            <div className="field-row">
              <input
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  void lookupAddress(e.target.value);
                }}
              />
              <button type="button" className="btn btn-ghost" onClick={useCurrentLocation}>
                Мое местоположение
              </button>
            </div>
            {addressSuggestions.length > 0 && (
              <div className="search-results">
                {addressSuggestions.map((s, idx) => (
                  <div
                    key={`${s.lat}-${s.lon}-${idx}`}
                    className="search-hit"
                    onClick={() => {
                      setAddress(s.display_name);
                      setCoords({ lat: s.lat, lon: s.lon });
                      setAddressSuggestions([]);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <p>{s.display_name}</p>
                  </div>
                ))}
              </div>
            )}
            <div ref={mapEl} className="inline-map" />
            <p className="muted small">Можно кликнуть по карте, чтобы выбрать точку для адреса.</p>
          </div>
          <div className="field">
            <label>Описание</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>График работы</label>
            <input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          </div>
          <label>
            <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} /> Исключить объект из карты
          </label>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => void submit()}>
              Сохранить
            </button>
          </div>
        </>
      )}
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
    </section>
  );
}
