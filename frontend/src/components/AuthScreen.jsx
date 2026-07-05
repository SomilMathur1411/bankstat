import React, { useMemo, useState } from "react";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3 5 6v5.4c0 4.2 2.6 7.9 7 9.6 4.4-1.7 7-5.4 7-9.6V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m9.5 12 1.8 1.8 3.2-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="m12 3 1.6 4.3 4.3 1.6-4.3 1.6L12 15l-1.6-4.5L6 8.9l4.4-1.6L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m18.5 16 0.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ show }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 12s3.1-6 9.5-6 9.5 6 9.5 6-3.1 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {!show && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

export default function AuthScreen({ onSubmit }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const title = useMemo(() => (mode === "login" ? "Welcome back" : "Create your account"), [mode]);
  const subtitle = useMemo(
    () =>
      mode === "login"
        ? "Sign in to unlock your financial command center, saved cards, and AI insights."
        : "Join thousands of users who keep their statements, cards, and money habits in one elegant workspace.",
    [mode],
  );

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const result = onSubmit({ ...form, mode });
    if (result) {
      setError(result);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-visual-panel">
        <div className="auth-visual-glow" />
        <div className="auth-visual-card">
          <div className="auth-badge auth-badge-hero">
            <ShieldIcon /> Private analytics workspace
          </div>
          <h1>Turn statements into sharper decisions.</h1>
          <p>
            Secure your profile, review spending patterns, and keep every card and insight neatly organized in a premium experience.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-pill">
              <SparkIcon /> AI insights
            </div>
            <div className="auth-feature-pill">
              <SparkIcon /> Saved cards
            </div>
            <div className="auth-feature-pill">
              <SparkIcon /> Smart trends
            </div>
          </div>

          <div className="auth-metrics">
            <div>
              <strong>24/7</strong>
              <span>assistant access</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>private workspace</span>
            </div>
            <div>
              <strong>4.9/5</strong>
              <span>user delight</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-badge">Bank Statement Analyzer</div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="auth-toggle">
          <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>
            Login
          </button>
          <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="auth-field">
              <span>Full name</span>
              <input name="name" value={form.name} onChange={handleChange} placeholder="Aarav Sharma" required />
            </label>
          )}

          <label className="auth-field">
            <span>Email address</span>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div className="password-shell">
              <input type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange} placeholder="At least 6 characters" required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((prev) => !prev)}>
                <EyeIcon show={showPassword} />
              </button>
            </div>
          </label>

          {mode === "signup" && (
            <label className="auth-field">
              <span>Confirm password</span>
              <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Repeat password" required />
            </label>
          )}

          <div className="auth-hint">
            {mode === "signup" ? "Strong security • local-first profile storage • instant access" : "Secure access • saved cards • financial insights"}
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary auth-submit" type="submit">
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
