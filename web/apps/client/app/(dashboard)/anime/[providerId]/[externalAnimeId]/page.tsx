"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnimeDetails, EpisodeList, UpsertLibraryItemInput } from "@relay/contracts";
import { apiFetch } from "../../../../../lib/api";

type Props = {
  params: Promise<{
    providerId: string;
    externalAnimeId: string;
  }>;
};

export default function AnimeDetailPage({ params }: Props) {
  const [resolvedParams, setResolvedParams] = useState<Awaited<Props["params"]> | null>(null);
  const [anime, setAnime] = useState<AnimeDetails | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeList | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams) return;

    Promise.all([
      apiFetch<AnimeDetails>(
        `/catalog/${resolvedParams.providerId}/anime/${resolvedParams.externalAnimeId}`,
      ),
      apiFetch<EpisodeList>(
        `/catalog/${resolvedParams.providerId}/anime/${resolvedParams.externalAnimeId}/episodes`,
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
          <img alt={anime.title} className="card-image" src={anime.coverImage ?? ""} />
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
              href={`/watch/library-demo/${episode.externalEpisodeId}?providerId=${episode.providerId}&externalAnimeId=${episode.externalAnimeId}`}
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
