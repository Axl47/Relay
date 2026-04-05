"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useRouteAccess } from "../../hooks/use-route-access";

export default function LoginPage() {
  const router = useRouter();
  const access = useRouteAccess();
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (access.isAuthenticated) {
      router.replace("/discover");
    }
  }, [access.isAuthenticated, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
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
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="entry-shell">
      <section className="login-stage">
        <div className="login-stage-copy">
          <span className="eyebrow">Relay Web</span>
          <h1>Sign in to continue watching</h1>
          <p>
            Relay keeps your library, playback progress, sources, and integrations in one place.
            Use bootstrap only when creating the first admin account for a new install.
          </p>

          <div className="login-stage-notes">
            <article className="login-note">
              <strong>Normal use</strong>
              <p>Sign in with your existing account and return to Discover, Library, and Watch.</p>
            </article>
            <article className="login-note">
              <strong>First run only</strong>
              <p>Bootstrap creates the initial admin account and should not be used after setup.</p>
            </article>
          </div>
        </div>

        <div className="login-stage-card">
          <div className="login-card-head">
            <div>
              <span className="eyebrow">Account access</span>
              <h2>{mode === "bootstrap" ? "Create the first admin account" : "Sign in"}</h2>
            </div>
            <div className="segmented-control">
              <button
                aria-pressed={mode === "login"}
                className={`segmented-control-button${mode === "login" ? " active" : ""}`}
                onClick={() => setMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                aria-pressed={mode === "bootstrap"}
                className={`segmented-control-button${mode === "bootstrap" ? " active" : ""}`}
                onClick={() => setMode("bootstrap")}
                type="button"
              >
                Bootstrap
              </button>
            </div>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            {mode === "bootstrap" ? (
              <label className="field">
                <span>Display name</span>
                <input autoComplete="nickname" name="displayName" required />
              </label>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input autoComplete="email" name="email" type="email" required />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
                minLength={mode === "bootstrap" ? 10 : 1}
                name="password"
                type="password"
                required
              />
            </label>

            <p className="support-copy">
              {mode === "bootstrap"
                ? "Bootstrap passwords must be at least 10 characters so the first admin account starts with a stronger default."
                : "Use the account credentials created during bootstrap or by your Relay administrator."}
            </p>

            {message ? <div className="message">{message}</div> : null}

            <div className="actions">
              <button className="button" disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? mode === "bootstrap"
                    ? "Creating account..."
                    : "Signing in..."
                  : mode === "bootstrap"
                    ? "Create admin account"
                    : "Sign in"}
              </button>
              <Link className="button-secondary" href="/">
                Back
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
