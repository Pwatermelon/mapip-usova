import { useEffect, useState } from "react";
import { fetchJson } from "../api";

type SettingsDto = {
  rnValue?: number;
  RnValue?: number;
  cronExpression?: string;
  CronExpression?: string;
  excludedCategories?: string[];
  ExcludedCategories?: string[];
};

type InfraDto = Record<string, string[]>;
type MetricCard = { key: string; title: string; value: string; note: string };

type StatisticsDto = {
  pending: number;
  added: number;
  deleted: number;
  history: { date: string; added: number; deleted: number; pending: number }[];
};

export function StatsPage() {
  const [rnValue, setRnValue] = useState(4);
  const [cronExpression, setCronExpression] = useState("0 0 * * *");
  const [infra, setInfra] = useState<InfraDto>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [stats, setStats] = useState<StatisticsDto | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchJson<SettingsDto>("/api/admin/GetSettings");
        const rn = s.rnValue ?? s.RnValue ?? 4;
        setRnValue(rn);
        setCronExpression(s.cronExpression ?? s.CronExpression ?? "0 0 * * *");
        setExcluded(s.excludedCategories ?? s.ExcludedCategories ?? []);
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
        const st = await fetchJson<StatisticsDto>("/api/Statistics");
        setStats(st);
        setStatsErr(null);
      } catch {
        setStats(null);
        setStatsErr("Не удалось загрузить статистику модерации (таблицы pending / объекты).");
      }
      try {
        const [objects, comments, popular] = await Promise.all([
          fetchJson<{ id: number }[]>("/GetSocialMapObject"),
          fetchJson<{ id: number }[]>("/api/comment/GetLastComments"),
          fetchJson<{ mapObject: { id: number } }[] | { id: number }[]>("/api/recommendation/GetPopularRecommendations"),
        ]);
        const popularRows =
          Array.isArray(popular) && popular.length > 0 && typeof popular[0] === "object" && popular[0] !== null && "mapObject" in popular[0]
            ? (popular as { mapObject: { id: number } }[])
            : [];
        const uniquePopular = new Set(popularRows.map((x) => x.mapObject?.id).filter(Boolean)).size;
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
        <h3 className="detail-subtitle">Статистика модерации (как в legacy StatisticsController)</h3>
        <p className="muted">
          Очередь на публикацию, объекты за последние 30 дней, отклонённые заявки и помесячная история по дням из базы.
        </p>
        {statsErr && <p className="err">{statsErr}</p>}
        {stats && (
          <>
            <div className="check-grid" style={{ marginTop: 12 }}>
              <article className="search-hit">
                <strong>В очереди (Pending)</strong>
                <p style={{ fontSize: "1.1rem", marginTop: 6 }}>{stats.pending}</p>
              </article>
              <article className="search-hit">
                <strong>Добавлено на карту за 30 дней</strong>
                <p style={{ fontSize: "1.1rem", marginTop: 6 }}>{stats.added}</p>
              </article>
              <article className="search-hit">
                <strong>Отклонено (всего)</strong>
                <p style={{ fontSize: "1.1rem", marginTop: 6 }}>{stats.deleted}</p>
              </article>
            </div>
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table className="muted" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "6px 8px" }}>Дата</th>
                    <th style={{ padding: "6px 8px" }}>Добавлено</th>
                    <th style={{ padding: "6px 8px" }}>Отклонено</th>
                    <th style={{ padding: "6px 8px" }}>В очереди (за день)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.history.map((h) => (
                    <tr key={h.date} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px" }}>{h.date}</td>
                      <td style={{ padding: "6px 8px" }}>{h.added}</td>
                      <td style={{ padding: "6px 8px" }}>{h.deleted}</td>
                      <td style={{ padding: "6px 8px" }}>{h.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
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
      <section className="detail-block">
        <h3 className="detail-subtitle">Панель администратора — параметры рекомендаций</h3>
        <p className="muted">
          RnValue, cron и исключённые категории хранятся в PostgreSQL (`AdminSettings`), категории для чекбоксов
          подгружаются из онтологии (`/api/admin/get/infrastructure`).
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
