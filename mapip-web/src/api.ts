/** База core API (данные карты). В Docker через nginx — ''. */
export const coreBase = import.meta.env.VITE_CORE_API ?? "";

/** Сервис маршрутизации (как внешний SDK). В dev Vite проксирует /routing → сервис. */
export const routingBase = import.meta.env.VITE_ROUTING_API ?? "/routing";

function formatApiError(res: Response, text: string): string {
  const trim = text.trim();
  if (trim.startsWith("{") || trim.startsWith("[")) {
    try {
      const j = JSON.parse(trim) as { detail?: unknown };
      if (j.detail !== undefined) {
        if (typeof j.detail === "string") return j.detail;
        if (Array.isArray(j.detail)) {
          return j.detail
            .map((item: unknown) =>
              typeof item === "object" && item !== null && "msg" in item
                ? String((item as { msg?: string }).msg ?? JSON.stringify(item))
                : JSON.stringify(item),
            )
            .join("; ");
        }
        return JSON.stringify(j.detail);
      }
    } catch {
      /* fall through */
    }
  }
  if (trim.startsWith("<")) {
    return `Ошибка ${res.status}: вместо JSON пришла HTML-страница (часто nginx 502 или открыт не тот URL). Откройте приложение с корня сайта (например :8088/), не по старой ссылке на .html или порт API.`;
  }
  return trim.slice(0, 500) || `${res.status} ${res.statusText}`;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: init?.credentials ?? "include" });
  const text = await res.text();
  if (!res.ok) throw new Error(formatApiError(res, text));
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Сервер вернул ответ без корректного JSON.");
  }
}

/** Для ручного fetch (например POST маршрута): та же логика сообщений об ошибке. */
export function errorTextFromResponse(res: Response, text: string): string {
  return formatApiError(res, text);
}
