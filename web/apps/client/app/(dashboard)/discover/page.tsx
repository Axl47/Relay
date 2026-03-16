"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { CatalogSearchResponse } from "@relay/contracts";
import { apiFetch } from "../../../lib/api";
import { resolveMediaUrl } from "../../../lib/media";

const FALLBACK_COVER =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="480" height="720"%3E%3Crect width="100%25" height="100%25" fill="%2316202d"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23a4b2c8" font-family="Arial" font-size="36"%3ENo%20Image%3C/text%3E%3C/svg%3E';

export default function DiscoverPage() {
  const [query, setQuery] = useState("relay");
  const [results, setResults] = useState<CatalogSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event?: FormEvent) {
    event?.preventDefault();
    try {
      const response = await apiFetch<CatalogSearchResponse>(
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
        {results?.partial ? (
          <div className="message" style={{ marginTop: 16 }}>
            Partial results returned. Some providers timed out or failed.
          </div>
        ) : null}
      </section>

      {results ? (
        <section className="panel">
          <h2>Provider responses</h2>
          <div className="list">
            {results.providers.map((provider) => (
              <article className="list-item" key={provider.providerId}>
                <div className="list-item-main">
                  <strong>{provider.displayName}</strong>
                  <p>
                    {provider.providerId} · {provider.contentClass} · {provider.status}
                    {provider.latencyMs !== null ? ` · ${provider.latencyMs}ms` : ""}
                  </p>
                  {provider.error ? <p>{provider.error}</p> : null}
                </div>
                <span className="badge">{provider.items.length} results</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid-cards">
        {results?.items.map((item) => (
          <Link
            href={`/anime/${encodeURIComponent(item.providerId)}/${encodeURIComponent(item.externalAnimeId)}`}
            className="card"
            key={`${item.providerId}-${item.externalAnimeId}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={item.title}
              className="card-image"
              src={item.coverImage ? resolveMediaUrl(item.coverImage) : FALLBACK_COVER}
            />
            <div className="card-body">
              <strong>{item.title}</strong>
              <div className="meta-row">
                <span className="badge">{item.providerDisplayName}</span>
                <span className="badge">{item.contentClass}</span>
                {item.year ? <span>{item.year}</span> : null}
              </div>
              <p>{item.synopsis ?? "No synopsis."}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
