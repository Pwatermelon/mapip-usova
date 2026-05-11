import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { coreBase, fetchJson } from "./api";

export type AuthUser = {
  id: number;
  name?: string;
  email?: string;
  score?: number;
  /** 1 — администратор / эксперт (панель эксперта, статистика). Остальные — обычные пользователи. */
  type?: number;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await fetchJson<AuthUser>(`${coreBase}/api/users/current-user`);
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${coreBase}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { detail?: { message?: string } | string };
        const d = j.detail;
        return typeof d === "object" && d && "message" in d ? String(d.message) : "Ошибка входа";
      }
      await refresh();
      return null;
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetch(`${coreBase}/api/users/logout`, { credentials: "include" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, login, logout }),
    [user, loading, refresh, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}
