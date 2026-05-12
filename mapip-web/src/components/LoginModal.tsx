import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";

const DISABILITY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Для людей с нарушением слуха" },
  { value: 1, label: "Для инвалидов, передвигающихся на коляске" },
  { value: 2, label: "Для людей с нарушением опорно-двигательного аппарата" },
  { value: 3, label: "Для людей с нарушением зрения" },
  { value: 4, label: "Для людей с нарушением умственного развития" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Какую вкладку показать при открытии (как в legacy: отдельные страницы входа и регистрации). */
  initialTab?: "login" | "register";
};

export function LoginModal({ open, onClose, initialTab = "login" }: Props) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [userType, setUserType] = useState(0);
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setErr(null);
  }, [open, initialTab]);

  if (!open) return null;

  const submitLogin = async () => {
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

  const submitRegister = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr("Укажите имя.");
      return;
    }
    if (password !== password2) {
      setErr("Пароли не совпадают.");
      return;
    }
    if (!password) {
      setErr("Введите пароль.");
      return;
    }
    setBusy(true);
    try {
      const msg = await register(name.trim(), userType, email, password);
      if (msg) {
        setErr(msg);
        return;
      }
      setPassword("");
      setPassword2("");
      setName("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const titleId = tab === "login" ? "login-title" : "register-title";

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
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="login-auth-tabs" role="tablist" aria-label="Вход или регистрация">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`login-auth-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => {
              setTab("login");
              setErr(null);
            }}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            className={`login-auth-tab ${tab === "register" ? "active" : ""}`}
            onClick={() => {
              setTab("register");
              setErr(null);
            }}
          >
            Регистрация
          </button>
        </div>

        {tab === "login" ? (
          <>
            <h2 id="login-title">Вход в аккаунт</h2>
            <p className="login-modal-lead muted small">
              После входа сохраняется сессия для карты, комментариев и избранного.
            </p>
            <form
              className="login-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitLogin();
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
          </>
        ) : (
          <>
            <h2 id="register-title">Регистрация</h2>
            <p className="login-modal-lead muted small">
              После успешной регистрации вы войдёте в аккаунт автоматически.
            </p>
            <form
              className="login-modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitRegister();
              }}
            >
              <div className="login-modal-field">
                <label htmlFor="reg-category">Категория инвалидности</label>
                <select
                  id="reg-category"
                  className="modal-input"
                  value={userType}
                  onChange={(e) => setUserType(Number(e.target.value))}
                  disabled={busy}
                >
                  {DISABILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="login-modal-field">
                <label htmlFor="reg-name">Имя</label>
                <input
                  id="reg-name"
                  className="modal-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Как к вам обращаться"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="login-modal-field">
                <label htmlFor="reg-email">Электронная почта</label>
                <input
                  id="reg-email"
                  className="modal-input"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="login-modal-field">
                <label htmlFor="reg-pass">Пароль</label>
                <input
                  id="reg-pass"
                  className="modal-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Придумайте пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="login-modal-field">
                <label htmlFor="reg-pass2">Пароль ещё раз</label>
                <input
                  id="reg-pass2"
                  className="modal-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Повторите пароль"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
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
                  {busy ? "Регистрация…" : "Зарегистрироваться"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
