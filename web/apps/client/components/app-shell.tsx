"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionQuery } from "../hooks/use-session-query";

type NavItem = {
  href: string;
  label: string;
  icon: "discover" | "library" | "activity" | "sources" | "account";
  mobile?: boolean;
};

const DESKTOP_NAV: NavItem[] = [
  { href: "/discover", label: "Discover", icon: "discover", mobile: true },
  { href: "/library", label: "Library", icon: "library", mobile: true },
  { href: "/history", label: "Activity", icon: "activity", mobile: true },
  { href: "/settings/providers", label: "Sources", icon: "sources" },
  { href: "/settings", label: "Account", icon: "account", mobile: true },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/settings") {
    return pathname === "/settings";
  }

  if (href === "/settings/providers") {
    return pathname === "/settings/providers";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ icon }: Readonly<{ icon: NavItem["icon"] }>) {
  if (icon === "discover") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M4 10 10 4l6 6-6 6-6-6Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (icon === "library") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path
          d="M5 4.5h10v11H5zm-2 2h2m10 0h2M3 10h2m10 0h2m-14 3.5h14"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (icon === "activity") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path
          d="M4 10h2.2l1.7-3.3L10.8 14l1.9-4H16"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (icon === "sources") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path
          d="M10 3.8 4.7 6.5v7L10 16.2l5.3-2.7v-7L10 3.8Zm0 0v12.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M10 4.8a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6ZM4.8 15.2a5.7 5.7 0 0 1 10.4 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function DesktopNavItem({
  item,
  pathname,
}: Readonly<{ item: NavItem; pathname: string }>) {
  const active = isActivePath(pathname, item.href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`rail-link${active ? " active" : ""}`}
      href={item.href}
    >
      <span className="rail-link-icon">
        <NavIcon icon={item.icon} />
      </span>
      <span className="rail-link-label">{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const sessionQuery = useSessionQuery();
  const session = sessionQuery.data ?? null;
  const mobileAccountHref = session ? "/settings" : "/login";

  return (
    <div className="app-shell">
      <aside className="app-rail">
        <div className="rail-brand">
          <Link className="brand-mark" href="/discover">
            <span aria-hidden="true" className="brand-mark-dot" />
            <span className="brand-mark-word">Relay</span>
          </Link>
          <p className="rail-note">Search, track progress, and keep playback moving.</p>
        </div>

        <nav aria-label="Primary" className="rail-nav">
          {DESKTOP_NAV.map((item) => (
            <DesktopNavItem item={item} key={item.href} pathname={pathname} />
          ))}
        </nav>

        <div className="rail-footer">
          {sessionQuery.isLoading ? (
            <div className="account-chip account-chip-loading">Loading account</div>
          ) : session ? (
            <Link className="account-chip" href="/settings">
              <span className="account-chip-avatar" aria-hidden="true">
                {session.user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="account-chip-copy">
                <strong>{session.user.displayName}</strong>
                <span>{session.user.isAdmin ? "Admin" : "Member"}</span>
              </span>
            </Link>
          ) : (
            <Link className="account-chip" href="/login">
              <span className="account-chip-avatar" aria-hidden="true">
                ?
              </span>
              <span className="account-chip-copy">
                <strong>Account</strong>
                <span>Sign in to sync library and playback.</span>
              </span>
            </Link>
          )}
        </div>
      </aside>

      <main className="content-shell">
        <div className="content">{children}</div>
      </main>

      <nav aria-label="Primary navigation" className="mobile-nav">
        {DESKTOP_NAV.filter((item) => item.mobile).map((item) => {
          const href = item.icon === "account" ? mobileAccountHref : item.href;
          const active =
            item.icon === "account"
              ? pathname === "/settings" || pathname.startsWith("/settings/")
              : isActivePath(pathname, href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`mobile-nav-link${active ? " active" : ""}`}
              href={href}
              key={item.icon}
            >
              <span className="mobile-nav-icon">
                <NavIcon icon={item.icon} />
              </span>
              <span className="mobile-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
