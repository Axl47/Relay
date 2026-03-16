"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { AnimeDetails, EpisodeList, UpsertLibraryItemInput } from "@relay/contracts";
import { apiFetch } from "../../../../../lib/api";
import { resolveMediaUrl } from "../../../../../lib/media";

function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AnimeDetailPage() {
  const routeParams = useParams<{ providerId: string; externalAnimeId: string }>();
  const [anime, setAnime] = useState<AnimeDetails | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeList | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const resolvedParams = useMemo(
    () => ({
      providerId: decodeRouteParam(routeParams.providerId),
      externalAnimeId: decodeRouteParam(routeParams.externalAnimeId),
    }),
    [routeParams.externalAnimeId, routeParams.providerId],
  );

  useEffect(() => {
    setAnime(null);
    setEpisodes(null);
    setMessage(null);

    const providerId = encodeURIComponent(resolvedParams.providerId);
    const externalAnimeId = encodeURIComponent(resolvedParams.externalAnimeId);

    Promise.all([
      apiFetch<AnimeDetails>(
        `/catalog/${providerId}/anime?externalAnimeId=${externalAnimeId}`,
      ),
      apiFetch<EpisodeList>(
        `/catalog/${providerId}/episodes?externalAnimeId=${externalAnimeId}`,
      ),
    ])
      .then(([animeResponse, episodeResponse]) => {
        setAnime(animeResponse);
        setEpisodes(episodeResponse);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load anime."));
  }, [resolvedParams]);

  const addPayload = useMemo<UpsertLibraryItemInput | null>(() => {
    if (!anime) return null;
    return {
      providerId: anime.providerId,
      externalAnimeId: anime.externalAnimeId,
      title: anime.title,
      coverImage: anime.coverImage,
      status: "watching",
    };
  }, [anime]);

  async function addToLibrary() {
    if (!addPayload) return;
    try {
      await apiFetch("/library/items", {
        method: "POST",
        body: JSON.stringify(addPayload),
      });
      setMessage("Added to library.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add item.");
    }
  }

  if (!anime) {
    return <div className="message">{message ?? "Loading anime..."}</div>;
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px minmax(0, 1fr)",
            gap: 18,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={anime.title} className="card-image" src={resolveMediaUrl(anime.coverImage)} />
          <div className="page-grid">
            <div className="topbar-title">
              <h1>{anime.title}</h1>
              <p>{anime.synopsis ?? "No synopsis."}</p>
            </div>
            <div className="meta-row">
              <span className="badge">{anime.providerId}</span>
              <span>{anime.status}</span>
              {anime.year ? <span>{anime.year}</span> : null}
            </div>
            <div className="meta-row">
              {anime.tags.map((tag) => (
                <span className="badge" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="actions">
              <button className="button" onClick={addToLibrary} type="button">
                Add To Library
              </button>
            </div>
            {message ? <div className="message">{message}</div> : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Episodes</h2>
        <div className="list">
          {episodes?.episodes.map((episode) => (
            <a
              className="list-item"
              href={`/watch/direct/${encodeURIComponent(episode.externalEpisodeId)}?providerId=${encodeURIComponent(episode.providerId)}&externalAnimeId=${encodeURIComponent(episode.externalAnimeId)}`}
              key={episode.externalEpisodeId}
            >
              <div className="list-item-main">
                <strong>
                  {episode.number}. {episode.title}
                </strong>
                <p>{episode.durationSeconds ? `${Math.round(episode.durationSeconds / 60)} min` : "Duration unknown"}</p>
              </div>
              <span className="badge">Watch</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
