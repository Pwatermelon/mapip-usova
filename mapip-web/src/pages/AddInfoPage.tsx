import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { fetchJson, routingBase } from "../api";

type InfraDict = Record<string, string[]>;

export function AddInfoPage() {
  const { user } = useAuth();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [baseType, setBaseType] = useState("Социальная инфраструктура");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<{ lat: number; lon: number; display_name: string }[]>(
    [],
  );
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [images, setImages] = useState<FileList | null>(null);
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [selectedAccessibility, setSelectedAccessibility] = useState<string[]>([]);
  const [disability, setDisability] = useState<string[]>([]);
  const [infrastructure, setInfrastructure] = useState<InfraDict>({});
  const [selectedInfra, setSelectedInfra] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const accRes = await fetch("/api/SocialMapObject/get/accessibility");
        if (accRes.ok) setAccessibility((await accRes.json()) as string[]);
      } catch {
        setAccessibility([]);
      }
      try {
        const infRes = await fetch("/api/admin/get/infrastructure");
        if (infRes.ok) setInfrastructure((await infRes.json()) as InfraDict);
      } catch {
        setInfrastructure({});
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

  useEffect(() => {
    if (baseType !== "Социальная инфраструктура") {
      setSelectedInfra("");
      setSelectedAccessibility([]);
      setDisability([]);
      setDescription("");
      setWorkingHours("");
    }
  }, [baseType]);

  const infraOptions = useMemo(() => Object.values(infrastructure).flat(), [infrastructure]);

  const toggle = (arr: string[], value: string, setter: (next: string[]) => void) => {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const submit = async () => {
    setErr(null);
    setMsg(null);
    if (!name.trim() || !address.trim()) {
      setErr("Заполните название и адрес.");
      return;
    }
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("address", address.trim());
    fd.append("type", baseType === "Социальная инфраструктура" ? selectedInfra || baseType : baseType);
    if (coords) {
      fd.append("latitude", String(coords.lat));
      fd.append("longitude", String(coords.lon));
    }
    fd.append("description", description);
    fd.append("workingHours", workingHours);
    selectedAccessibility.forEach((v) => fd.append("accessibility", v));
    disability.forEach((v) => fd.append("disabilityCategory", v));
    if (images) Array.from(images).forEach((f) => fd.append("images", f));
    if (user?.id) {
      fd.append("userId", String(user.id));
      fd.append("mapObjectId", "0");
      fd.append("excluded", "false");
    }
    try {
      const res = await fetch("/client/AddMapObject", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Объект отправлен.");
    } catch (e) {
      setErr(`Не удалось отправить: ${String(e)}. Проверьте доступность legacy endpoint /client/AddMapObject.`);
    }
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

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
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
      <h2>Добавить информацию</h2>
      <p className="score-badge">Накоплено очков: {user?.score ?? 0}</p>
      <div className="field">
        <label>Тип объекта</label>
        <select value={baseType} onChange={(e) => setBaseType(e.target.value)}>
          <option value="Транспортная инфраструктура">Транспортная инфраструктура</option>
          <option value="Дорожная инфраструктура">Дорожная инфраструктура</option>
          <option value="Социальная инфраструктура">Социальная инфраструктура</option>
        </select>
      </div>
      {baseType === "Социальная инфраструктура" && (
        <div className="field">
          <label>Категория социальной инфраструктуры</label>
          <select value={selectedInfra} onChange={(e) => setSelectedInfra(e.target.value)}>
            <option value="">Выберите категорию</option>
            {infraOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label>Название</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
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
        <p className="muted small">Можно кликнуть по карте, чтобы выбрать адресную точку.</p>
      </div>
      {baseType === "Социальная инфраструктура" && (
        <>
          <div className="field">
            <label>Описание</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>График работы</label>
            <input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          </div>
          <div className="field">
            <label>Элементы доступной среды</label>
            <div className="check-grid">
              {accessibility.map((v) => (
                <label key={v}>
                  <input
                    type="checkbox"
                    checked={selectedAccessibility.includes(v)}
                    onChange={() => toggle(selectedAccessibility, v, setSelectedAccessibility)}
                  />{" "}
                  {v}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Категории инвалидности</label>
            <div className="check-grid">
              {["Г", "К", "О", "С", "У"].map((v) => (
                <label key={v}>
                  <input
                    type="checkbox"
                    checked={disability.includes(v)}
                    onChange={() => toggle(disability, v, setDisability)}
                  />{" "}
                  {v}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="field">
        <label>Изображения</label>
        <input type="file" multiple onChange={(e) => setImages(e.target.files)} />
      </div>
      <button type="button" className="btn" onClick={() => void submit()}>
        Отправить
      </button>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
    </section>
  );
}
