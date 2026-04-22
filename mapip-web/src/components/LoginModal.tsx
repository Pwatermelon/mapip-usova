import { useState } from "react";
import { useAuth } from "../AuthContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LoginModal({ open, onClose }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const msg = await login(email, password);
      if (msg) {
        setErr(msg);
        return;
      }
      setPassword("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="login-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="login-title">Вход</h2>
        <p className="muted small">Один раз вошли — сессия для карты и комментариев.</p>
        <label className="sr-only" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          className="modal-input"
          type="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="sr-only" htmlFor="login-pass">
          Пароль
        </label>
        <input
          id="login-pass"
          className="modal-input"
          type="password"
          autoComplete="current-password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p className="err">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="btn" onClick={() => void submit()} disabled={busy}>
            {busy ? "…" : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
