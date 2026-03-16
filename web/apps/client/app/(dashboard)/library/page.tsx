"use client";

import { useEffect, useState } from "react";
import type { Category, LibraryItemWithCategories } from "@relay/contracts";
import { apiFetch } from "../../../lib/api";

type LibraryResponse = {
  items: LibraryItemWithCategories[];
  categories: Category[];
};

export default function LibraryPage() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LibraryResponse>("/library")
      .then(setData)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Unable to load library."),
      );
  }, []);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="topbar-title">
          <h1>Library</h1>
          <p>Titles already pinned to your account-backed Relay library.</p>
        </div>
      </section>

      {error ? <div className="message">{error}</div> : null}

      <section className="grid-cards">
        {data?.items.map((item) => (
          <article className="card" key={item.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={item.title} className="card-image" src={item.coverImage ?? ""} />
            <div className="card-body">
              <strong>{item.title}</strong>
              <div className="meta-row">
                <span className="badge">{item.providerId}</span>
                <span>{item.status}</span>
              </div>
              <div className="meta-row">
                {item.categories.map((category) => (
                  <span className="badge" key={category.id}>
                    {category.name}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
