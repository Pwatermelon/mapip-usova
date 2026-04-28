import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoginModal } from "./components/LoginModal";
import { EmbedRouterPage } from "./pages/EmbedRouterPage";
import { InfoPage } from "./pages/InfoPage";
import { MapPage } from "./pages/MapPage";
import { RouterPage } from "./pages/RouterPage";

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
              <div className="legacy-logo" aria-hidden>
                🌍
              </div>
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
                  <NavLink to="/router" className={({ isActive }) => (isActive ? "active" : "")}>
                    Маршрутизатор
                  </NavLink>
                </nav>
              </div>
            </div>

            <main className="main">
              <Routes>
                <Route path="/" element={<MapPage />} />
                <Route
                  path="/add"
                  element={
                    <InfoPage
                      title="Добавить информацию"
                      text="Раздел перенесен в единый React-интерфейс. Следующим шагом подключаем форму добавления из legacy API без перехода на отдельный HTML."
                    />
                  }
                />
                <Route
                  path="/edit"
                  element={
                    <InfoPage
                      title="Редактировать информацию"
                      text="Страница теперь живет в SPA и использует ту же шапку и авторизацию. Можно продолжить перенос формы редактирования в этот раздел."
                    />
                  }
                />
                <Route
                  path="/expert"
                  element={
                    <InfoPage
                      title="Панель эксперта"
                      text="Панель вынесена в общий роутинг приложения, чтобы больше не было отдельных html-страниц с разной логикой кнопок входа."
                    />
                  }
                />
                <Route
                  path="/stats"
                  element={
                    <InfoPage
                      title="Статистика"
                      text="Раздел статистики подключен в единый интерфейс. При необходимости добавим реальные графики и метрики из API."
                    />
                  }
                />
                <Route
                  path="/about"
                  element={
                    <InfoPage
                      title="О проекте"
                      text="Информационная страница теперь в том же приложении и дизайне. Навигация и кнопки авторизации работают единообразно."
                    />
                  }
                />
                <Route path="/router" element={<RouterPage />} />
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
