"use client";

import { FormEvent, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload =
      mode === "bootstrap"
        ? {
            email: String(form.get("email")),
            password: String(form.get("password")),
            displayName: String(form.get("displayName")),
          }
        : {
            email: String(form.get("email")),
            password: String(form.get("password")),
          };

    try {
      await apiFetch(mode === "bootstrap" ? "/auth/bootstrap" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.location.href = "/discover";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to authenticate.");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div className="panel" style={{ width: "min(420px, 100%)" }}>
        <div className="topbar-title" style={{ marginBottom: 18 }}>
          <h1>Relay Web</h1>
          <p>Use bootstrap once on first run, then log in normally.</p>
        </div>

        <div className="actions" style={{ marginBottom: 16 }}>
          <button
            className={mode === "login" ? "button" : "button-secondary"}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={mode === "bootstrap" ? "button" : "button-secondary"}
            onClick={() => setMode("bootstrap")}
            type="button"
          >
            Bootstrap
          </button>
        </div>

        <form className="page-grid" onSubmit={onSubmit}>
          {mode === "bootstrap" ? (
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" required />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "bootstrap" ? 10 : 1}
            />
          </div>

          {mode === "bootstrap" ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}>
              Password must be at least 10 characters.
            </p>
          ) : null}

          {message ? <div className="message">{message}</div> : null}

          <div className="actions">
            <button className="button" type="submit">
              {mode === "bootstrap" ? "Create Admin" : "Login"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
