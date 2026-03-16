"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/discover", label: "Discover" },
  { href: "/library", label: "Library" },
  { href: "/history", label: "History" },
  { href: "/updates", label: "Updates" },
  { href: "/settings", label: "Settings" },
  { href: "/settings/providers", label: "Providers" },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Relay</strong>
          <span>Web-first self-hosted library and playback.</span>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <Link
              className={`nav-link${pathname === item.href ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="panel">
          <h2>Notes</h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5 }}>
            Provider health, priorities, and adult-source visibility are managed from Settings and
            Providers.
          </p>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>Relay Web</h1>
            <p>Account-backed catalog, library, watch history, and provider controls.</p>
          </div>
          <div className="actions">
            <Link className="button-secondary" href="/login">
              Login
            </Link>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
