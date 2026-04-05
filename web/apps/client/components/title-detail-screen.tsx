"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnimeDetailView, UpsertLibraryItemInput } from "@relay/contracts";
import { useState } from "react";
import { CoverImage } from "./cover-image";
import { AuthRequiredState } from "./auth-required-state";
import { useRouteAccess } from "../hooks/use-route-access";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { buildOriginalAnimeUrl } from "../lib/provider-links";
import { buildCatalogAnimeViewPath, buildWatchHref } from "../lib/routes";

type Props = {
  externalAnimeId: string;
  providerId: string;
};

function formatDuration(durationSeconds: number | null) {
  if (!durationSeconds) {
    return null;
  }

  const minutes = Math.round(durationSeconds / 60);
  return `${minutes} min`;
}

function formatEpisodeLabel(
  episode: AnimeDetailView["episodes"][number],
  kind: AnimeDetailView["anime"]["kind"],
) {
  if (kind === "movie") {
    return "Movie";
  }

  if (episode.seasonNumber !== null && episode.episodeNumber !== null) {
    return `S${episode.seasonNumber} E${episode.episodeNumber}`;
  }

  return `Episode ${episode.number}`;
}

export function TitleDetailScreen({ externalAnimeId, providerId }: Props) {
  const queryClient = useQueryClient();
  const access = useRouteAccess();
  const [expandedSynopsis, setExpandedSynopsis] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodeSort, setEpisodeSort] = useState<"asc" | "desc">("asc");

  const detailQuery = useQuery({
    queryKey: queryKeys.animeView(providerId, externalAnimeId),
    queryFn: () => apiFetch<AnimeDetailView>(buildCatalogAnimeViewPath(providerId, externalAnimeId)),
    enabled: access.isAuthenticated,
    retry: false,
  });

  const addToLibraryMutation = useMutation({
    mutationFn: (payload: UpsertLibraryItemInput) =>
      apiFetch("/library/items", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.animeView(providerId, externalAnimeId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.libraryDashboard() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.libraryIndex() }),
      ]);
    },
  });

  const removeFromLibraryMutation = useMutation({
    mutationFn: (libraryItemId: string) =>
      apiFetch(`/library/items/${libraryItemId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.animeView(providerId, externalAnimeId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.libraryDashboard() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.libraryIndex() }),
      ]);
    },
  });

  if (access.isLoading) {
    return <div className="message">Loading title…</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to see watch state, add titles to your library, and resume from where you stopped."
        title="Detail pages use your library context"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to load title."}
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return <div className="message">Loading title…</div>;
  }

  if (detailQuery.error || !detailQuery.data?.anime) {
    return (
      <div className="message">
        {detailQuery.error instanceof Error ? detailQuery.error.message : "Unable to load title."}
      </div>
    );
  }

  const detail = detailQuery.data;
  const anime = detail.anime;
  const isMovie = anime.kind === "movie";
  const visibleTags = showAllTags ? anime.tags : anime.tags.slice(0, 5);
  const hiddenTagCount = Math.max(0, anime.tags.length - visibleTags.length);
  const resumeHref =
    detail.resumeEpisodeId
      ? buildWatchHref({
          libraryItemId: detail.libraryItem?.id ?? "direct",
          providerId: detail.anime.providerId,
          externalAnimeId: detail.anime.externalAnimeId,
          externalEpisodeId: detail.resumeEpisodeId,
        })
      : null;
  const originalAnimeUrl = buildOriginalAnimeUrl({
    providerId: anime.providerId,
    externalAnimeId: anime.externalAnimeId,
    firstEpisodeId: detail.episodes[0]?.externalEpisodeId ?? null,
    kind: anime.kind,
  });

  const filteredEpisodes = [...detail.episodes]
    .filter((episode) => {
      if (isMovie) {
        return true;
      }

      const query = episodeSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }

      return (
        episode.title.toLowerCase().includes(query) ||
        String(episode.number).includes(query) ||
        String(episode.episodeNumber ?? "").includes(query) ||
        String(episode.seasonNumber ?? "").includes(query)
      );
    })
    .sort((left, right) => {
      if (episodeSort === "asc") {
        if ((left.seasonNumber ?? 0) !== (right.seasonNumber ?? 0)) {
          return (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
        }
        if ((left.episodeNumber ?? 0) !== (right.episodeNumber ?? 0)) {
          return (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
        }
        return left.number - right.number;
      }

      if ((left.seasonNumber ?? 0) !== (right.seasonNumber ?? 0)) {
        return (right.seasonNumber ?? 0) - (left.seasonNumber ?? 0);
      }
      if ((left.episodeNumber ?? 0) !== (right.episodeNumber ?? 0)) {
        return (right.episodeNumber ?? 0) - (left.episodeNumber ?? 0);
      }
      return right.number - left.number;
    });

  const summaryLabel =
    anime.kind === "movie" ? "Movie detail" : anime.kind === "tv" ? "TV detail" : "Title detail";
  const headingLabel =
    anime.kind === "movie" ? "Movie" : anime.kind === "tv" ? "TV series" : "Title";
  const watchLabel = isMovie ? "Watch movie" : `Watch ${detail.episodes[0] ? "episode 1" : "title"}`;
  const resumeLabel = isMovie ? "Resume movie" : `Resume episode ${detail.resumeEpisodeNumber ?? 1}`;
  const listHeading = isMovie ? "Playback" : "Episodes";
  const listDescription = isMovie
    ? `${filteredEpisodes.length} playback option`
    : `${filteredEpisodes.length} visible episodes`;

  return (
    <div className="page-grid anime-detail-page">
      <section className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">{summaryLabel}</span>
          <h1>{anime.title}</h1>
          <p>
            {[
              headingLabel,
              anime.year,
              !isMovie && anime.totalEpisodes ? `${anime.totalEpisodes} episodes` : null,
              anime.status,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="page-heading-meta">
          <span className="badge">{anime.providerDisplayName}</span>
          <span className="badge">{anime.contentClass}</span>
          <span className="badge">{anime.kind}</span>
        </div>
      </section>

      <div className="detail-layout">
        <section className="surface detail-summary-card">
          <div className="detail-summary-media">
            <CoverImage alt={anime.title} className="anime-cover" src={anime.coverImage} />
          </div>

          <div className="detail-summary-copy">
            <div className="tag-row">
              {visibleTags.map((tag) => (
                <span className="badge" key={tag}>
                  {tag}
                </span>
              ))}
              {hiddenTagCount > 0 ? (
                <button className="ghost-button" onClick={() => setShowAllTags((current) => !current)} type="button">
                  {showAllTags ? "Show less" : `+${hiddenTagCount} more`}
                </button>
              ) : null}
            </div>

            {anime.synopsis ? (
              <div className="copy-block">
                <p className={!expandedSynopsis ? "copy-clamp" : undefined}>{anime.synopsis}</p>
                <button
                  className="ghost-button"
                  onClick={() => setExpandedSynopsis((current) => !current)}
                  type="button"
                >
                  {expandedSynopsis ? "Show less" : "Show more"}
                </button>
              </div>
            ) : null}

            <div className="detail-meta-grid">
              <div className="detail-meta-card">
                <span className="summary-label">Resume</span>
                <strong>
                  {isMovie
                    ? detail.resumeEpisodeId
                      ? "Resume movie"
                      : "Start movie"
                    : detail.resumeEpisodeNumber
                      ? `Episode ${detail.resumeEpisodeNumber}`
                      : "Start at episode 1"}
                </strong>
                <p>
                  {detail.resumeEpisodeTitle ??
                    (isMovie
                      ? "Relay will open the movie player directly."
                      : "Relay will send you to the first available episode.")}
                </p>
              </div>
              <div className="detail-meta-card">
                <span className="summary-label">Current state</span>
                <strong>{detail.inLibrary ? "In library" : "Not in library"}</strong>
                <p>{detail.currentEpisodeTitle ?? (isMovie ? "No active movie progress yet." : "No active episode in progress yet.")}</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="detail-action-column">
          <section className="surface detail-action-card">
            <div className="detail-action-stack">
              {resumeHref ? (
                <Link className="button" href={resumeHref}>
                  {resumeLabel}
                </Link>
              ) : (
                <Link
                  className="button"
                  href={buildWatchHref({
                    libraryItemId: "direct",
                    providerId: anime.providerId,
                    externalAnimeId: anime.externalAnimeId,
                    externalEpisodeId: detail.episodes[0]?.externalEpisodeId ?? "",
                  })}
                >
                  {watchLabel}
                </Link>
              )}

              {detail.inLibrary && detail.libraryItem ? (
                <button
                  className="button-secondary"
                  disabled={removeFromLibraryMutation.isPending}
                  onClick={() =>
                    detail.libraryItem
                      ? removeFromLibraryMutation.mutate(detail.libraryItem.id)
                      : undefined
                  }
                  type="button"
                >
                  {removeFromLibraryMutation.isPending ? "Updating…" : "Remove from library"}
                </button>
              ) : (
                <button
                  className="button-secondary"
                  disabled={addToLibraryMutation.isPending}
                  onClick={() =>
                    addToLibraryMutation.mutate({
                      providerId: anime.providerId,
                      externalAnimeId: anime.externalAnimeId,
                      title: anime.title,
                      coverImage: anime.coverImage,
                      kind: anime.kind,
                      status: "watching",
                    })
                  }
                  type="button"
                >
                  {addToLibraryMutation.isPending ? "Adding…" : "Add to library"}
                </button>
              )}

              {originalAnimeUrl ? (
                <a
                  className="button-secondary"
                  href={originalAnimeUrl}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Open on {anime.providerDisplayName}
                </a>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <section className="surface detail-episodes-card">
        <div className="section-header">
          <div>
            <h2>{listHeading}</h2>
            <p>{listDescription}</p>
          </div>
          {!isMovie ? (
            <div className="toolbar-cluster">
              <input
                className="search-input search-input-inline"
                onChange={(event) => setEpisodeSearch(event.target.value)}
                placeholder="Filter episodes…"
                value={episodeSearch}
              />
              <div className="segmented-control">
                <button
                  aria-pressed={episodeSort === "asc"}
                  className={`segmented-control-button${episodeSort === "asc" ? " active" : ""}`}
                  onClick={() => setEpisodeSort("asc")}
                  type="button"
                >
                  Oldest first
                </button>
                <button
                  aria-pressed={episodeSort === "desc"}
                  className={`segmented-control-button${episodeSort === "desc" ? " active" : ""}`}
                  onClick={() => setEpisodeSort("desc")}
                  type="button"
                >
                  Newest first
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {filteredEpisodes.length > 0 ? (
          <div className="episode-list">
            {filteredEpisodes.map((episode) => {
              const watchHref = buildWatchHref({
                libraryItemId: detail.libraryItem?.id ?? "direct",
                providerId: anime.providerId,
                externalAnimeId: anime.externalAnimeId,
                externalEpisodeId: episode.externalEpisodeId,
              });
              return (
                <Link
                  className={`episode-row${episode.isCurrent ? " current" : ""}`}
                  href={watchHref}
                  key={episode.externalEpisodeId}
                >
                  <span className={`episode-state state-${episode.state}`} />
                  <div className="episode-number">{formatEpisodeLabel(episode, anime.kind)}</div>
                  <div className="episode-main">
                    <strong>{episode.title}</strong>
                    <p>
                      {episode.progress
                        ? episode.state === "watched"
                          ? "Watched"
                          : `${episode.progress.percentComplete}% watched`
                        : isMovie
                          ? "Ready to play"
                          : "Not started"}
                    </p>
                  </div>
                  <div className="episode-meta">
                    {formatDuration(episode.durationSeconds) ? (
                      <span>{formatDuration(episode.durationSeconds)}</span>
                    ) : null}
                    <span className="episode-play">Play</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-inline-state">
            <p>No episodes match the current search filter.</p>
          </div>
        )}
      </section>
    </div>
  );
}
