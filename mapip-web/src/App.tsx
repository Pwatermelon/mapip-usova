import { useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoginModal } from "./components/LoginModal";
import legacyLogo from "./assets/legacy-logo.png";
import { AboutPage } from "./pages/AboutPage";
import { AddInfoPage } from "./pages/AddInfoPage";
import { EmbedRouterPage } from "./pages/EmbedRouterPage";
import { EditInfoPage } from "./pages/EditInfoPage";
import { ExpertPanelPage } from "./pages/ExpertPanelPage";
import { MapPage } from "./pages/MapPage";
import { StatsPage } from "./pages/StatsPage";

/** Только пользователи с type === 1 (администратор в legacy User.Type). */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="main">
        <p className="muted" style={{ padding: 24 }}>
          Загрузка…
        </p>
      </main>
    );
  }
  if (!user || user.type !== 1) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

type HeaderAuthProps = {
  impairedMode: boolean;
  onToggleImpaired: () => void;
};

function HeaderAuth({ impairedMode, onToggleImpaired }: HeaderAuthProps) {
  const { user, loading, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <div className="header-auth">
        {loading ? (
          <span className="muted">Загрузка…</span>
        ) : user ? (
          <>
            <span className="header-user" title={user.email}>
              {user.name?.trim() || user.email || `Пользователь ${user.id}`}
            </span>
            <button type="button" className="btn btn-sm btn-green" onClick={() => void logout()}>
              Выйти
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-green" onClick={() => setLoginOpen(true)}>
            Войти
          </button>
        )}
        <button type="button" className="btn btn-sm btn-blue-legacy" onClick={onToggleImpaired}>
          {impairedMode ? "Обычная версия" : "Версия для слабовидящих"}
        </button>
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

function AppShell() {
  const { user } = useAuth();
  const isAdmin = user?.type === 1;
  const [impairedMode, setImpairedMode] = useState<boolean>(() => localStorage.getItem("mapip-contrast") === "1");
  const [fontScale, setFontScale] = useState<number>(() => Number(localStorage.getItem("mapip-bvi-font") ?? "1.1"));
  const [lineHeight, setLineHeight] = useState<number>(() => Number(localStorage.getItem("mapip-bvi-line") ?? "1.6"));
  const [hideImages, setHideImages] = useState<boolean>(() => localStorage.getItem("mapip-bvi-images") === "1");
  const [scheme, setScheme] = useState<"wb" | "bw" | "blue">(
    () => (localStorage.getItem("mapip-bvi-scheme") as "wb" | "bw" | "blue" | null) ?? "wb",
  );

  useEffect(() => {
    document.body.classList.toggle("visually-impaired-mode", impairedMode);
    document.body.classList.toggle("bvi-wb", impairedMode && scheme === "wb");
    document.body.classList.toggle("bvi-bw", impairedMode && scheme === "bw");
    document.body.classList.toggle("bvi-blue", impairedMode && scheme === "blue");
    document.body.classList.toggle("bvi-hide-images", impairedMode && hideImages);
    document.documentElement.style.setProperty("--bvi-font-scale", impairedMode ? String(fontScale) : "1");
    document.documentElement.style.setProperty("--bvi-line-height", impairedMode ? String(lineHeight) : "1.35");
    localStorage.setItem("mapip-contrast", impairedMode ? "1" : "0");
    localStorage.setItem("mapip-bvi-font", String(fontScale));
    localStorage.setItem("mapip-bvi-line", String(lineHeight));
    localStorage.setItem("mapip-bvi-images", hideImages ? "1" : "0");
    localStorage.setItem("mapip-bvi-scheme", scheme);
  }, [impairedMode, fontScale, lineHeight, hideImages, scheme]);

  const toggleImpaired = () => setImpairedMode((v) => !v);

  return (
          <div className="app-shell">
            <header className="legacy-hero">
              <img src={legacyLogo} className="legacy-logo-image" alt="Доступная среда — логотип проекта" />
              <h1 className="legacy-title">Сделаем с Вами мир доступнее</h1>
              <HeaderAuth impairedMode={impairedMode} onToggleImpaired={toggleImpaired} />
            </header>
            {impairedMode && (
              <section className="bvi-panel" aria-label="Настройки версии для слабовидящих">
                <label>
                  Размер шрифта
                  <select value={fontScale} onChange={(e) => setFontScale(Number(e.target.value))}>
                    <option value={1}>100%</option>
                    <option value={1.15}>115%</option>
                    <option value={1.3}>130%</option>
                  </select>
                </label>
                <label>
                  Межстрочный интервал
                  <select value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))}>
                    <option value={1.4}>Стандартный</option>
                    <option value={1.6}>Повышенный</option>
                    <option value={1.8}>Максимальный</option>
                  </select>
                </label>
                <label>
                  Цветовая схема
                  <select value={scheme} onChange={(e) => setScheme(e.target.value as "wb" | "bw" | "blue")}>
                    <option value="wb">Черный на белом</option>
                    <option value="bw">Белый на черном</option>
                    <option value="blue">Синий контраст</option>
                  </select>
                </label>
                <label className="bvi-checkbox">
                  <input type="checkbox" checked={hideImages} onChange={(e) => setHideImages(e.target.checked)} />
                  Скрыть изображения
                </label>
              </section>
            )}

            <div className="top-bar">
              <div className="top-bar-left">
                <nav className="nav" aria-label="Разделы">
                  <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
                    Карта доступности
                  </NavLink>
                  <NavLink to="/add" className={({ isActive }) => (isActive ? "active" : "")}>
                    Добавить информацию
                  </NavLink>
                  <NavLink to="/edit" className={({ isActive }) => (isActive ? "active" : "")}>
                    Редактировать информацию
                  </NavLink>
                  {isAdmin && (
                    <>
                      <NavLink to="/expert" className={({ isActive }) => (isActive ? "active" : "")}>
                        Панель эксперта
                      </NavLink>
                      <NavLink to="/stats" className={({ isActive }) => (isActive ? "active" : "")}>
                        Статистика
                      </NavLink>
                    </>
                  )}
                  <NavLink to="/about" className={({ isActive }) => (isActive ? "active" : "")}>
                    О проекте
                  </NavLink>
                </nav>
              </div>
            </div>

            <main className="main">
              <Routes>
                <Route path="/" element={<MapPage />} />
                <Route path="/add" element={<AddInfoPage />} />
                <Route path="/edit" element={<EditInfoPage />} />
                <Route
                  path="/expert"
                  element={
                    <RequireAdmin>
                      <ExpertPanelPage />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/stats"
                  element={
                    <RequireAdmin>
                      <StatsPage />
                    </RequireAdmin>
                  }
                />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/router" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            <footer className="app-footer">
              <span>Контактная информация: 123-456-7890 | email@example.com</span>
            </footer>
          </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/embed/router" element={<EmbedRouterPage />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}
