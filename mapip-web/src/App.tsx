import { NavLink, Route, Routes } from "react-router-dom";
import { MapPage } from "./pages/MapPage";
import { RouterPage } from "./pages/RouterPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>MAPIP</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Карта
          </NavLink>
          <NavLink to="/router" className={({ isActive }) => (isActive ? "active" : "")}>
            Маршрутизатор
          </NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/router" element={<RouterPage />} />
        </Routes>
      </main>
    </div>
  );
}
