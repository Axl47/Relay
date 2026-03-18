"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnimeDetailView, UpsertLibraryItemInput } from "@relay/contracts";
import { apiFetch } from "../../../../../lib/api";
import { FALLBACK_COVER } from "../../../../../lib/fallback-cover";
import { resolveMediaUrl } from "../../../../../lib/media";

function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatDuration(durationSeconds: number | null) {
  if (!durationSeconds) {
    return null;
  }

  const minutes = Math.round(durationSeconds / 60);
  return `${minutes} min`;
}

export default function AnimeDetailPage() {
  const routeParams = useParams<{ providerId: string; externalAnimeId: string }>();
  const queryClient = useQueryClient();
  const [expandedSynopsis, setExpandedSynopsis] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  const resolvedParams = useMemo(
    () => ({
      providerId: decodeRouteParam(routeParams.providerId),
      externalAnimeId: decodeRouteParam(routeParams.externalAnimeId),
    }),
    [routeParams.externalAnimeId, routeParams.providerId],
  );

  const detailQuery = useQuery({
    queryKey: ["anime-view", resolvedParams.providerId, resolvedParams.externalAnimeId],
    queryFn: () =>
      apiFetch<AnimeDetailView>(
        `/catalog/${encodeURIComponent(resolvedParams.providerId)}/anime/${encodeURIComponent(resolvedParams.externalAnimeId)}/view`,
      ),
  });

  const addToLibraryMutation = useMutation({
    mutationFn: (payload: UpsertLibraryItemInput) =>
      apiFetch("/library/items", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["anime-view"] }),
        queryClient.invalidateQueries({ queryKey: ["library-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["library-index"] }),
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
        queryClient.invalidateQueries({ queryKey: ["anime-view"] }),
        queryClient.invalidateQueries({ queryKey: ["library-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["library-index"] }),
      ]);
    },
  });

  const detail = detailQuery.data;
  const anime = detail?.anime ?? null;
  const visibleTags = showAllTags ? anime?.tags ?? [] : anime?.tags.slice(0, 4) ?? [];
  const hiddenTagCount = Math.max(0, (anime?.tags.length ?? 0) - visibleTags.length);
  const resumeHref =
    detail && detail.resumeEpisodeId
      ? `/watch/${encodeURIComponent(detail.libraryItem?.id ?? "direct")}/${encodeURIComponent(detail.resumeEpisodeId)}?providerId=${encodeURIComponent(detail.anime.providerId)}&externalAnimeId=${encodeURIComponent(detail.anime.externalAnimeId)}`
      : null;

  if (detailQuery.isLoading) {
    return <div className="message">Loading anime...</div>;
  }

  if (detailQuery.error || !detail || !anime) {
    return (
      <div className="message">
        {detailQuery.error instanceof Error ? detailQuery.error.message : "Unable to load anime."}
      </div>
    );
  }

  return (
    <div className="page-grid anime-detail-page">
      <section className="anime-hero">
        <div className="anime-hero-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={anime.title}
            className="anime-cover"
            src={anime.coverImage ? resolveMediaUrl(anime.coverImage) : FALLBACK_COVER}
          />
        </div>

        <div className="anime-hero-copy">
          <div className="anime-hero-topline">
            <div className="page-heading">
              <h1>{anime.title}</h1>
              <p>
                {[anime.year, anime.totalEpisodes ? `${anime.totalEpisodes} episodes` : null, anime.status]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            <div className="anime-hero-actions">
              {resumeHref ? (
                <Link className="button" href={resumeHref}>
                  Resume Ep {detail.resumeEpisodeNumber ?? 1}
                </Link>
              ) : (
                <Link
                  className="button"
                  href={`/watch/direct/${encodeURIComponent(detail.episodes[0]?.externalEpisodeId ?? "")}?providerId=${encodeURIComponent(anime.providerId)}&externalAnimeId=${encodeURIComponent(anime.externalAnimeId)}`}
                >
                  Watch Ep 1
                </Link>
              )}

              {detail.inLibrary && detail.libraryItem ? (
                <button
                  className="button-secondary"
                  disabled={removeFromLibraryMutation.isPending}
                  onClick={() => removeFromLibraryMutation.mutate(detail.libraryItem!.id)}
                  type="button"
                >
                  {removeFromLibraryMutation.isPending ? "Updating..." : "In Library"}
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
                      status: "watching",
                    })
                  }
                  type="button"
                >
                  {addToLibraryMutation.isPending ? "Adding..." : "Add to Library"}
                </button>
              )}
            </div>
          </div>

          <div className="meta-row">
            <span className="badge">{anime.providerDisplayName}</span>
            <span className="badge">{anime.contentClass}</span>
          </div>

          <div className="tag-row">
            {visibleTags.map((tag) => (
              <span className="badge" key={tag}>
                {tag}
              </span>
            ))}
            {hiddenTagCount > 0 ? (
              <button
                className="ghost-button"
                onClick={() => setShowAllTags((current) => !current)}
                type="button"
              >
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
        </div>
      </section>

      <section className="surface">
        <div className="section-header">
          <div>
            <h2>Episodes</h2>
            <p>{detail.episodes.length} available</p>
          </div>
        </div>

        <div className="episode-list">
          {detail.episodes.map((episode) => {
            const watchHref = `/watch/${encodeURIComponent(detail.libraryItem?.id ?? "direct")}/${encodeURIComponent(episode.externalEpisodeId)}?providerId=${encodeURIComponent(anime.providerId)}&externalAnimeId=${encodeURIComponent(anime.externalAnimeId)}`;
            return (
              <Link
                className={`episode-row${episode.isCurrent ? " current" : ""}`}
                href={watchHref}
                key={episode.externalEpisodeId}
              >
                <span className={`episode-state state-${episode.state}`} />
                <div className="episode-number">{episode.number}</div>
                <div className="episode-main">
                  <strong>{episode.title}</strong>
                  <p>
                    {episode.progress
                      ? episode.state === "watched"
                        ? "Watched"
                        : `${episode.progress.percentComplete}% watched`
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
      </section>
    </div>
  );
}
