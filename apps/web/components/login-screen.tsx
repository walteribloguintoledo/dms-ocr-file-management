import { ShieldCheck, LogIn, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type Props = {
  email: string;
  password: string;
  apiUrl: string;
  busy: boolean;
  error: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onApiUrl: (value: string) => void;
  onSubmit: () => void;
};
export function LoginScreen(p: Props) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand">
          <div>Folio360<small>Intelligent Document Management</small></div>
        </div>
        <h1 id="login-title">Sign in to your workspace</h1>
        <p className="muted">Use the account created by your administrator.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setShowPassword(false);
            p.onSubmit();
          }}
        >
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={p.email}
              disabled={p.busy}
              onChange={(e) => p.onEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <span className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={128}
              value={p.password}
              disabled={p.busy}
              onChange={(e) => p.onPassword(e.target.value)}
            />
            <button className="password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={p.busy} onClick={() => setShowPassword(value => !value)}>
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
            </span>
          </label>
          <details>
            <summary>Connection settings</summary>
            <label>
              DMS API URL
              <input
                type="url"
                placeholder="https://your-dms-domain.com/api"
                value={p.apiUrl}
                disabled={p.busy}
                onChange={(e) => p.onApiUrl(e.target.value)}
              />
            </label>
            <small>Use the API address provided by your administrator.</small>
          </details>
          {p.error && (
            <p className="auth-error" role="alert">
              {p.error}
            </p>
          )}
          <button type="submit" className="primary" disabled={p.busy}>
            <LogIn size={18} />
            {p.busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="auth-note">
          <ShieldCheck size={18} />
          <span>
            For security, login is limited to 3 attempts per 15 minutes per IP address.
          </span>
        </div>
      </section>
    </main>
  );
}
