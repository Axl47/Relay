"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { SearchPage } from "@relay/contracts";
import { apiFetch } from "../../../lib/api";

export default function DiscoverPage() {
  const [query, setQuery] = useState("relay");
  const [results, setResults] = useState<SearchPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event?: FormEvent) {
    event?.preventDefault();
    try {
      const response = await apiFetch<SearchPage[]>(
        `/catalog/search?query=${encodeURIComponent(query)}&page=1&limit=12`,
      );
      setResults(response);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to search.");
    }
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="topbar-title" style={{ marginBottom: 16 }}>
          <h1>Discover</h1>
          <p>Search enabled providers and move titles straight into your library.</p>
        </div>

        <form className="field-row" onSubmit={onSearch}>
          <div className="field">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search anime"
            />
          </div>
          <div className="actions" style={{ alignItems: "end" }}>
            <button className="button" type="submit">
              Search
            </button>
          </div>
        </form>

        {error ? <div className="message" style={{ marginTop: 16 }}>{error}</div> : null}
      </section>

      <section className="grid-cards">
        {results.flatMap((page) =>
          page.items.map((item) => (
            <Link
              href={`/anime/${item.providerId}/${item.externalAnimeId}`}
              className="card"
              key={`${item.providerId}-${item.externalAnimeId}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={item.title} className="card-image" src={item.coverImage ?? ""} />
              <div className="card-body">
                <strong>{item.title}</strong>
                <div className="meta-row">
                  <span className="badge">{page.providerId}</span>
                  {item.year ? <span>{item.year}</span> : null}
                </div>
                <p>{item.synopsis ?? "No synopsis."}</p>
              </div>
            </Link>
          )),
        )}
      </section>
    </div>
  );
}
