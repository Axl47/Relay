"use client";

import Link from "next/link";

type Props = {
  title: string;
  description: string;
  loginHref?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function AuthRequiredState({
  title,
  description,
  loginHref = "/login",
  secondaryHref,
  secondaryLabel,
}: Props) {
  return (
    <section className="empty-panel auth-required-state">
      <div className="empty-panel-copy">
        <span className="eyebrow">Sign in required</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="actions">
        <Link className="button" href={loginHref}>
          Open login
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link className="button-secondary" href={secondaryHref}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
