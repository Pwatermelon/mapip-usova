import { useEffect, useState } from "react";
import { fetchJson } from "../api";

type SettingsDto = {
  rnValue?: number;
  cronExpression?: string;
  excludedCategories?: string[];
};

type InfraDto = Record<string, string[]>;
type MetricCard = { key: string; title: string; value: string; note: string };

export function StatsPage() {
  const [rnValue, setRnValue] = useState(4);
  const [cronExpression, setCronExpression] = useState("0 0 * * *");
  const [infra, setInfra] = useState<InfraDto>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);

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
      try {
        const [objects, comments, popular] = await Promise.all([
          fetchJson<{ id: number }[]>("/GetSocialMapObject"),
          fetchJson<{ id: number }[]>("/api/comment/GetLastComments"),
          fetchJson<{ mapObject: { id: number } }[]>("/api/recommendation/GetPopularRecommendations"),
        ]);
        const uniquePopular = new Set(popular.map((x) => x.mapObject?.id).filter(Boolean)).size;
        const commentCoverage = objects.length ? Math.round((comments.length / objects.length) * 100) : 0;
        setMetrics([
          {
            key: "objects",
            title: "Покрытие объектов",
            value: String(objects.length),
            note: "Сколько объектов реально участвует в поиске/маршрутах.",
          },
          {
            key: "comments",
            title: "Активность обратной связи",
            value: String(comments.length),
            note: "Последние комментарии пользователей по объектам.",
          },
          {
            key: "popular",
            title: "Стабильные рекомендации",
            value: String(uniquePopular),
            note: "Уникальные объекты, которые стабильно попадают в популярные.",
          },
          {
            key: "coverage",
            title: "Плотность фидбэка",
            value: `${commentCoverage}%`,
            note: "Отношение числа комментариев к количеству объектов.",
          },
        ]);
      } catch {
        setMetricsErr("Не удалось загрузить исследовательские метрики с API.");
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
      <section className="detail-block">
        <h3 className="detail-subtitle">Результаты исследований и продуктовый эффект</h3>
        <p className="muted">
          Здесь показываются не просто графики, а продуктовые показатели: как эксперименты влияют на качество маршрутов,
          покрытие объектов и полезность рекомендаций для пользователя.
        </p>
        <div className="check-grid">
          {metrics.map((m) => (
            <article key={m.key} className="search-hit">
              <strong>{m.title}</strong>
              <p style={{ fontSize: "1rem", color: "#0f172a", marginTop: 6 }}>{m.value}</p>
              <p>{m.note}</p>
            </article>
          ))}
        </div>
        {metricsErr && <p className="err">{metricsErr}</p>}
        <p className="muted small" style={{ marginTop: 10 }}>
          Как считается: данные берутся напрямую из рабочих API (`объекты`, `комментарии`, `популярные рекомендации`) и
          пересчитываются в реальном времени при открытии страницы.
        </p>
      </section>
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
