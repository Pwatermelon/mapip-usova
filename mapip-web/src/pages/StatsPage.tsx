import { useEffect, useState } from "react";
import { fetchJson } from "../api";

type SettingsDto = {
  rnValue?: number;
  cronExpression?: string;
  excludedCategories?: string[];
};

type InfraDto = Record<string, string[]>;

export function StatsPage() {
  const [rnValue, setRnValue] = useState(4);
  const [cronExpression, setCronExpression] = useState("0 0 * * *");
  const [infra, setInfra] = useState<InfraDto>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchJson<SettingsDto>("/api/admin/GetSettings");
        setRnValue(s.rnValue ?? 4);
        setCronExpression(s.cronExpression ?? "0 0 * * *");
        setExcluded(s.excludedCategories ?? []);
      } catch {
        // keep defaults
      }
      try {
        const i = await fetchJson<InfraDto>("/api/admin/get/infrastructure");
        setInfra(i);
      } catch {
        setInfra({});
      }
    })();
  }, []);

  const toggleExcluded = (v: string) => {
    setExcluded((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const save = async () => {
    setErr(null);
    setMsg(null);
    try {
      await fetch("/api/admin/settings/UpdateRnValue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ RnValue: rnValue }),
      });
      await fetch("/api/admin/settings/UpdateCronExpression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ CronExpression: cronExpression }),
      });
      await fetch("/api/admin/settings/UpdateExcludedCategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ExcludedCategories: excluded }),
      });
      setMsg("Настройки обновлены.");
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <section className="info-page">
      <h2>Статистика и настройки</h2>
      <div className="field">
        <label>RnValue</label>
        <input type="number" value={rnValue} onChange={(e) => setRnValue(Number(e.target.value))} />
      </div>
      <div className="field">
        <label>Cron выражение</label>
        <input value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} />
      </div>
      <div className="field">
        <label>Исключенные категории</label>
        <div className="check-grid">
          {Object.values(infra)
            .flat()
            .map((cat) => (
              <label key={cat}>
                <input type="checkbox" checked={excluded.includes(cat)} onChange={() => toggleExcluded(cat)} /> {cat}
              </label>
            ))}
        </div>
      </div>
      <button type="button" className="btn" onClick={() => void save()}>
        Сохранить
      </button>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}
    </section>
  );
}
