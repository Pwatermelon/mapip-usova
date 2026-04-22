/** База core API (данные карты). В Docker через nginx — ''. */
export const coreBase = import.meta.env.VITE_CORE_API ?? "";

/** Сервис маршрутизации (как внешний SDK). В dev Vite проксирует /routing → сервис. */
export const routingBase = import.meta.env.VITE_ROUTING_API ?? "/routing";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<T>;
}
