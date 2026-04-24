import { useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoginModal } from "./components/LoginModal";
import { MapPage } from "./pages/MapPage";
import { RouterPage } from "./pages/RouterPage";

function HeaderAuth() {
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
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void logout()}>
              Выйти
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => setLoginOpen(true)}>
            Войти
          </button>
        )}
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <div className="brand">
            <span className="brand-mark" aria-hidden />
            <span>MAPIP</span>
          </div>
          <nav className="nav" aria-label="Разделы">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Карта
            </NavLink>
            <NavLink to="/router" className={({ isActive }) => (isActive ? "active" : "")}>
              Маршрутизатор
            </NavLink>
          </nav>
        </div>
        <HeaderAuth />
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/router" element={<RouterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <span>MAPIP — доступная карта и маршруты</span>
        <span className="footer-meta">Карта © OpenStreetMap · маршруты OpenRouteService</span>
      </footer>
    </div>
  );
}
