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
      className="modal-backdrop login-modal"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="modal-card login-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="login-title">Вход в аккаунт</h2>
        <p className="login-modal-lead muted small">
          После входа сохраняется сессия для карты, комментариев и избранного.
        </p>
        <form
          className="login-modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="login-modal-field">
            <label htmlFor="login-email">Электронная почта</label>
            <input
              id="login-email"
              className="modal-input"
              type="email"
              autoComplete="username"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="login-modal-field">
            <label htmlFor="login-pass">Пароль</label>
            <input
              id="login-pass"
              className="modal-input"
              type="password"
              autoComplete="current-password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>
          {err && (
            <p className="login-modal-err err" role="alert">
              {err}
            </p>
          )}
          <div className="modal-actions login-modal-actions">
            <button type="button" className="btn btn-ghost login-modal-cancel" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="btn btn-green login-modal-submit" disabled={busy}>
              {busy ? "Вход…" : "Войти"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
