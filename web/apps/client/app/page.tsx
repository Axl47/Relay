"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRouteAccess } from "../hooks/use-route-access";

export default function HomePage() {
  const router = useRouter();
  const access = useRouteAccess();

  useEffect(() => {
    if (access.isLoading) {
      return;
    }

    if (access.isAuthenticated) {
      router.replace("/discover");
      return;
    }

    if (access.isUnauthenticated) {
      router.replace("/login");
    }
  }, [access.isAuthenticated, access.isLoading, access.isUnauthenticated, router]);

  return (
    <main className="entry-shell">
      <section className="login-stage-card resolver-card">
        <span className="eyebrow">Relay Web</span>
        <h1>{access.error ? "Unable to reach Relay" : "Checking your session"}</h1>
        <p>
          {access.error
            ? access.error.message
            : "Relay routes you to the right starting point before loading the app shell."}
        </p>
      </section>
    </main>
  );
}
