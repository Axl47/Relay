"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionQuery } from "../hooks/use-session-query";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/discover", label: "Discover", shortLabel: "D" },
  { href: "/library", label: "Library", shortLabel: "L" },
  { href: "/history", label: "History", shortLabel: "H" },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", shortLabel: "S" },
  { href: "/settings/providers", label: "Providers", shortLabel: "P" },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/discover", label: "Discover", shortLabel: "D" },
  { href: "/library", label: "Library", shortLabel: "L" },
  { href: "/history", label: "History", shortLabel: "H" },
];

const MOBILE_SIGNED_OUT_NAV_ITEM: NavItem = { href: "/login", label: "Login", shortLabel: "L" };
const MOBILE_SIGNED_IN_NAV_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  shortLabel: "S",
};

function isActivePath(pathname: string, href: string) {
  if (href === "/settings") {
    return pathname === "/settings";
  }

  if (href === "/settings/providers") {
    return pathname === "/settings/providers";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNavItem({
  item,
  pathname,
}: Readonly<{ item: NavItem; pathname: string }>) {
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link${active ? " active" : ""}`}
      href={item.href}
      key={item.href}
      title={item.label}
    >
      <span aria-hidden="true" className="nav-short">
        {item.shortLabel}
      </span>
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const sessionQuery = useSessionQuery();
  const session = sessionQuery.data ?? null;
  const mobileNavItems = [
    ...MOBILE_NAV,
    session ? MOBILE_SIGNED_IN_NAV_ITEM : MOBILE_SIGNED_OUT_NAV_ITEM,
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Link className="brand-wordmark" href="/discover">
            Relay
          </Link>
        </div>

        <nav className="nav-groups">
          <section className="nav-section">
            <p className="nav-section-title">Primary</p>
            <div className="nav-list">
              {PRIMARY_NAV.map((item) => (
                <SidebarNavItem item={item} key={item.href} pathname={pathname} />
              ))}
            </div>
          </section>

          <div className="nav-divider" />

          <section className="nav-section">
            <p className="nav-section-title">System</p>
            <div className="nav-list">
              {SYSTEM_NAV.map((item) => (
                <SidebarNavItem item={item} key={item.href} pathname={pathname} />
              ))}
            </div>
          </section>
        </nav>

        <div className="sidebar-footer">
          {sessionQuery.isLoading ? (
            <div className="user-chip user-chip-loading">Loading...</div>
          ) : session ? (
            <div className="user-chip">
              <span className="user-avatar" aria-hidden="true">
                {session.user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="user-name">{session.user.displayName}</span>
            </div>
          ) : (
            <Link className="user-chip user-login" href="/login">
              Login
            </Link>
          )}
        </div>
      </aside>

      <main className="content">{children}</main>

      <nav aria-label="Primary navigation" className="mobile-nav">
        {mobileNavItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`mobile-nav-link${active ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <span className="mobile-nav-short">{item.shortLabel}</span>
              <span className="mobile-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
