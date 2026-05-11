import { useState } from "react";
import { fetchJson } from "../api";

type CommentRow = { id: number; text: string; rate: number; user?: { name: string }; date?: string };
type UserRow = { id: number; name?: string; email: string; type?: number; password?: string };

type PendingRow = {
  id: number;
  displayName: string;
  address: string;
  x?: number | null;
  y?: number | null;
  type: string;
  description?: string | null;
  disabilityCategory?: string | null;
  workingHours?: string | null;
  status?: string;
  dateAdded?: string | null;
};

export function ExpertPanelPage() {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [editPending, setEditPending] = useState<Record<number, PendingRow>>({});
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentSearch, setCommentSearch] = useState("");
  const [usersEmail, setUsersEmail] = useState("");
  const [user, setUser] = useState<UserRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const loadPending = async () => {
    setErr(null);
    setOk(null);
    try {
      const data = await fetchJson<PendingRow[]>("/api/Expert/pending");
      setPending(data);
      const m: Record<number, PendingRow> = {};
      for (const p of data) m[p.id] = { ...p };
      setEditPending(m);
    } catch (e) {
      setErr(`Очередь объектов: ${String(e)}`);
      setPending([]);
    }
  };

  const approvePending = async (id: number) => {
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/Expert/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setOk("Объект одобрен и добавлен на карту.");
      await loadPending();
    } catch (e) {
      setErr(String(e));
    }
  };

  const rejectPending = async (id: number) => {
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/Expert/${id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setOk("Заявка отклонена.");
      await loadPending();
    } catch (e) {
      setErr(String(e));
    }
  };

  const savePendingEdit = async (id: number) => {
    const row = editPending[id];
    if (!row) return;
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/Expert/${id}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: row.displayName,
          address: row.address,
          description: row.description ?? "",
          disabilityCategory: row.disabilityCategory ?? "",
          workingHours: row.workingHours ?? "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOk("Черновик заявки обновлён.");
      await loadPending();
    } catch (e) {
      setErr(String(e));
    }
  };

  const loadComments = async (path: string) => {
    setErr(null);
    setOk(null);
    try {
      const data = await fetchJson<CommentRow[]>(path);
      setComments(data);
    } catch (e) {
      setErr(`Комментарии не загрузились: ${String(e)} (legacy endpoint).`);
    }
  };

  const findUser = async () => {
    setErr(null);
    setOk(null);
    try {
      const u = await fetchJson<UserRow>(`/api/users/GetUser/${encodeURIComponent(usersEmail.trim())}`);
      setUser(u);
    } catch (e) {
      setErr(`Пользователь не найден: ${String(e)}`);
      setUser(null);
    }
  };

  const saveComment = async (row: CommentRow) => {
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/comment/EditComment/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newText: row.text, newRate: row.rate }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOk("Комментарий сохранен.");
    } catch (e) {
      setErr(String(e));
    }
  };

  const deleteComment = async (id: number) => {
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/comment/DeleteComment/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setComments((prev) => prev.filter((c) => c.id !== id));
      setOk("Комментарий удален.");
    } catch (e) {
      setErr(String(e));
    }
  };

  const saveUser = async () => {
    if (!user) return;
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/users/EditUser/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, category: user.type ?? 0, password: user.password ?? "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOk("Пользователь обновлен.");
    } catch (e) {
      setErr(String(e));
    }
  };

  const deleteUser = async () => {
    if (!user) return;
    setErr(null);
    setOk(null);
    try {
      const res = await fetch(`/api/users/DeleteUser/${user.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setUser(null);
      setOk("Пользователь удален.");
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <section className="info-page">
      <h2>Панель эксперта</h2>
      <h3>Модерация новых объектов (legacy ExpertController)</h3>
      <p className="muted" style={{ marginBottom: 8 }}>
        Заявки со статусом Pending: одобрение создаёт запись в `MapObject`, отклонение помечает заявку как Rejected.
      </p>
      <div className="field-row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => void loadPending()}>
          Загрузить очередь
        </button>
      </div>
      {pending.map((p) => {
        const row = editPending[p.id] ?? p;
        return (
          <div key={p.id} className="search-hit" style={{ marginBottom: 12 }}>
            <p className="muted">
              Тип: {row.type} · #{p.id}
              {row.dateAdded ? ` · ${row.dateAdded}` : ""}
            </p>
            <div className="field">
              <label>Название</label>
              <input
                value={row.displayName}
                onChange={(e) =>
                  setEditPending((prev) => ({
                    ...prev,
                    [p.id]: { ...row, displayName: e.target.value },
                  }))
                }
              />
            </div>
            <div className="field">
              <label>Адрес</label>
              <input
                value={row.address}
                onChange={(e) =>
                  setEditPending((prev) => ({
                    ...prev,
                    [p.id]: { ...row, address: e.target.value },
                  }))
                }
              />
            </div>
            <div className="field">
              <label>Описание</label>
              <textarea
                value={row.description ?? ""}
                onChange={(e) =>
                  setEditPending((prev) => ({
                    ...prev,
                    [p.id]: { ...row, description: e.target.value },
                  }))
                }
              />
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>Категория МГН (строка)</label>
                <input
                  value={row.disabilityCategory ?? ""}
                  onChange={(e) =>
                    setEditPending((prev) => ({
                      ...prev,
                      [p.id]: { ...row, disabilityCategory: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Часы работы</label>
                <input
                  value={row.workingHours ?? ""}
                  onChange={(e) =>
                    setEditPending((prev) => ({
                      ...prev,
                      [p.id]: { ...row, workingHours: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <div className="field-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-sm" onClick={() => void savePendingEdit(p.id)}>
                Сохранить правки
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void approvePending(p.id)}>
                Одобрить
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void rejectPending(p.id)}>
                Отклонить
              </button>
            </div>
          </div>
        );
      })}
      <hr />
      <h3>Комментарии и пользователи</h3>
      <div className="field-row" style={{ marginBottom: 8 }}>
        <button type="button" className="btn" onClick={() => void loadComments("/api/comment/GetLastComments")}>
          Загрузить последние комментарии
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void loadComments("/api/comment/GetOffensiveComments")}>
          Загрузить оскорбительные
        </button>
      </div>
      <div className="field-row" style={{ marginBottom: 8 }}>
        <input value={commentSearch} onChange={(e) => setCommentSearch(e.target.value)} placeholder="ID или название объекта" />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void loadComments(`/api/comment/GetCommentsByMapObject/${encodeURIComponent(commentSearch.trim())}`)}
        >
          Поиск комментариев
        </button>
      </div>
      {comments.map((c) => (
        <div key={c.id} className="search-hit" style={{ marginBottom: 8 }}>
          <p>
            <strong>{c.user?.name ?? "—"}</strong>
          </p>
          <textarea
            value={c.text}
            onChange={(e) => setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))}
          />
          <div className="field-row" style={{ marginTop: 6 }}>
            <input
              type="number"
              min={1}
              max={5}
              value={c.rate}
              onChange={(e) => setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, rate: Number(e.target.value) } : x)))}
            />
            <button type="button" className="btn btn-sm" onClick={() => void saveComment(c)}>
              Сохранить
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void deleteComment(c.id)}>
              Удалить
            </button>
          </div>
          <span className="muted">({c.rate})</span>
        </div>
      ))}
      <hr />
      <h3>Управление пользователем</h3>
      <div className="field-row">
        <input value={usersEmail} onChange={(e) => setUsersEmail(e.target.value)} placeholder="email пользователя" />
        <button type="button" className="btn btn-ghost" onClick={() => void findUser()}>
          Найти
        </button>
      </div>
      {user && (
        <div className="search-hit">
          <p className="muted">{user.name ?? "Без имени"}</p>
          <div className="field">
            <label>Email</label>
            <input value={user.email} onChange={(e) => setUser((u) => (u ? { ...u, email: e.target.value } : u))} />
          </div>
          <div className="field">
            <label>Категория</label>
            <select value={user.type ?? 0} onChange={(e) => setUser((u) => (u ? { ...u, type: Number(e.target.value) } : u))}>
              <option value={0}>Для людей с нарушением слуха</option>
              <option value={1}>Для инвалидов, передвигающихся на коляске</option>
              <option value={2}>Для людей с нарушением опорно-двигательного аппарата</option>
              <option value={3}>Для людей с нарушением зрения</option>
              <option value={4}>Для людей с нарушением умственного развития</option>
            </select>
          </div>
          <div className="field">
            <label>Пароль</label>
            <input
              type="password"
              value={user.password ?? ""}
              onChange={(e) => setUser((u) => (u ? { ...u, password: e.target.value } : u))}
            />
          </div>
          <div className="field-row">
            <button type="button" className="btn btn-sm" onClick={() => void saveUser()}>
              Сохранить
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void deleteUser()}>
              Удалить
            </button>
          </div>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {ok && <p className="ok">{ok}</p>}
    </section>
  );
}
