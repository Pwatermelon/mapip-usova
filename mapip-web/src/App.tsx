import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoginModal } from "./components/LoginModal";
import legacyLogo from "./assets/legacy-logo.svg";
import { AboutPage } from "./pages/AboutPage";
import { AddInfoPage } from "./pages/AddInfoPage";
import { EmbedRouterPage } from "./pages/EmbedRouterPage";
import { EditInfoPage } from "./pages/EditInfoPage";
import { ExpertPanelPage } from "./pages/ExpertPanelPage";
import { MapPage } from "./pages/MapPage";
import { StatsPage } from "./pages/StatsPage";

type HeaderAuthProps = {
  highContrast: boolean;
  onToggleContrast: () => void;
};

function HeaderAuth({ highContrast, onToggleContrast }: HeaderAuthProps) {
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
        <button type="button" className="btn btn-sm btn-blue-legacy" onClick={onToggleContrast}>
          {highContrast ? "Обычная версия" : "Версия для слабовидящих"}
        </button>
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

export default function App() {
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    return localStorage.getItem("mapip-contrast") === "1";
  });

  useEffect(() => {
    document.body.classList.toggle("visually-impaired-mode", highContrast);
    localStorage.setItem("mapip-contrast", highContrast ? "1" : "0");
  }, [highContrast]);

  const toggleContrast = () => setHighContrast((v) => !v);

  return (
    <Routes>
      <Route path="/embed/router" element={<EmbedRouterPage />} />
      <Route
        path="*"
        element={
          <div className="app-shell">
            <header className="legacy-hero">
              <img src={legacyLogo} className="legacy-logo-image" alt="Логотип MAPIP" />
              <h1 className="legacy-title">Сделаем с Вами мир доступнее</h1>
              <HeaderAuth highContrast={highContrast} onToggleContrast={toggleContrast} />
            </header>

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
                  <NavLink to="/expert" className={({ isActive }) => (isActive ? "active" : "")}>
                    Панель эксперта
                  </NavLink>
                  <NavLink to="/stats" className={({ isActive }) => (isActive ? "active" : "")}>
                    Статистика
                  </NavLink>
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
                <Route path="/expert" element={<ExpertPanelPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/router" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            <footer className="app-footer">
              <span>Контактная информация: 123-456-7890 | email@example.com</span>
            </footer>
          </div>
        }
      />
    </Routes>
  );
}
