"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed. Check your credentials.");
        return;
      }

      // Redirect to the dashboard (or the URL they came from)
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") || "/";
      router.push(redirect);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      {/* Animated background gradient mesh */}
      <div className="login-bg" />

      <div className="login-card">
        {/* Logo / Brand */}
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h1 className="login-title">GEO/AEO Tracker</h1>
          <p className="login-subtitle">Sign in to your dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? (
              <span className="login-spinner" />
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="login-footer">
          Secure dashboard access — configured via environment variables
        </p>
      </div>

      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background: #0a0e1a;
          font-family: var(--font-inter), system-ui, sans-serif;
        }

        /* Animated gradient mesh background */
        .login-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 10% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 90% 80%, rgba(139, 92, 246, 0.12) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 50% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse 70% 50% at 20% 80%, rgba(16, 185, 129, 0.06) 0%, transparent 60%);
          animation: bgShift 12s ease-in-out infinite alternate;
        }

        @keyframes bgShift {
          0% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.1) rotate(2deg); }
          100% { transform: scale(1) rotate(-1deg); }
        }

        /* Glassmorphism card */
        .login-card {
          position: relative;
          width: 100%;
          max-width: 420px;
          padding: 48px 40px 36px;
          background: rgba(15, 20, 40, 0.6);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          z-index: 1;
          transition: box-shadow 0.3s ease;
        }

        .login-card:hover {
          box-shadow:
            0 12px 48px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .login-logo {
          text-align: center;
          margin-bottom: 36px;
        }

        .login-logo-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          color: white;
          margin-bottom: 16px;
          box-shadow: 0 4px 16px rgba(79, 70, 229, 0.3);
        }

        .login-title {
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          margin: 0 0 6px;
          letter-spacing: -0.02em;
        }

        .login-subtitle {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.5);
          margin: 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .login-field label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255, 255, 255, 0.5);
        }

        .login-field input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #fff;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }

        .login-field input::placeholder {
          color: rgba(255, 255, 255, 0.25);
        }

        .login-field input:focus {
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow:
            0 0 0 3px rgba(99, 102, 241, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.06);
        }

        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          color: #f87171;
          font-size: 13px;
        }

        .login-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(79, 70, 229, 0.25);
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(79, 70, 229, 0.35);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-footer {
          margin-top: 28px;
          text-align: center;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.25);
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}
