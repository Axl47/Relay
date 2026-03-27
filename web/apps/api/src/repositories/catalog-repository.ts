import { and, asc, desc, eq } from "drizzle-orm";
import type { CatalogSearchResponse, EpisodeList } from "@relay/contracts";
import { db } from "../db/client";
import { catalogAnime, catalogEpisode } from "../db/schema";

export class CatalogRepository {
  findAnime(providerId: string, externalAnimeId: string) {
    return db
      .select()
      .from(catalogAnime)
      .where(
        and(
          eq(catalogAnime.providerId, providerId),
          eq(catalogAnime.externalAnimeId, externalAnimeId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async upsertSearchItems(items: CatalogSearchResponse["items"]) {
    await Promise.all(
      items.map((item) =>
        db
          .insert(catalogAnime)
          .values({
            providerId: item.providerId,
            externalAnimeId: item.externalAnimeId,
            title: item.title,
            synopsis: item.synopsis,
            coverImage: item.coverImage,
            bannerImage: item.coverImage,
            status: "unknown",
            year: item.year,
            language: item.language,
            contentClass: item.contentClass,
            requiresAdultGate: item.requiresAdultGate,
            tags: [],
            totalEpisodes: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [catalogAnime.providerId, catalogAnime.externalAnimeId],
            set: {
              title: item.title,
              synopsis: item.synopsis,
              coverImage: item.coverImage,
              bannerImage: item.coverImage,
              year: item.year,
              language: item.language,
              contentClass: item.contentClass,
              requiresAdultGate: item.requiresAdultGate,
              updatedAt: new Date(),
            },
          }),
      ),
    );
  }

  upsertAnime(input: {
    providerId: string;
    externalAnimeId: string;
    title: string;
    synopsis: string | null;
    coverImage: string | null;
    bannerImage: string | null;
    status: string;
    year: number | null;
    language: string;
    contentClass: string;
    requiresAdultGate: boolean;
    tags: string[];
    totalEpisodes: number | null;
  }) {
    return db
      .insert(catalogAnime)
      .values({
        ...input,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [catalogAnime.providerId, catalogAnime.externalAnimeId],
        set: {
          title: input.title,
          synopsis: input.synopsis,
          coverImage: input.coverImage,
          bannerImage: input.bannerImage,
          status: input.status,
          year: input.year,
          language: input.language,
          contentClass: input.contentClass,
          requiresAdultGate: input.requiresAdultGate,
          tags: input.tags,
          totalEpisodes: input.totalEpisodes,
          updatedAt: new Date(),
        },
      });
  }

  listEpisodes(providerId: string, externalAnimeId: string) {
    return db
      .select()
      .from(catalogEpisode)
      .where(
        and(
          eq(catalogEpisode.providerId, providerId),
          eq(catalogEpisode.externalAnimeId, externalAnimeId),
        ),
      )
      .orderBy(asc(catalogEpisode.number), asc(catalogEpisode.externalEpisodeId));
  }

  async upsertEpisodes(payload: EpisodeList) {
    await Promise.all(
      payload.episodes.map((episode) =>
        db
          .insert(catalogEpisode)
          .values({
            providerId: payload.providerId,
            externalAnimeId: payload.externalAnimeId,
            externalEpisodeId: episode.externalEpisodeId,
            number: Math.round(episode.number),
            title: episode.title,
            synopsis: episode.synopsis,
            thumbnail: episode.thumbnail,
            durationSeconds: episode.durationSeconds,
            releasedAt: episode.releasedAt ? new Date(episode.releasedAt) : null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              catalogEpisode.providerId,
              catalogEpisode.externalAnimeId,
              catalogEpisode.externalEpisodeId,
            ],
            set: {
              number: Math.round(episode.number),
              title: episode.title,
              synopsis: episode.synopsis,
              thumbnail: episode.thumbnail,
              durationSeconds: episode.durationSeconds,
              releasedAt: episode.releasedAt ? new Date(episode.releasedAt) : null,
              updatedAt: new Date(),
            },
          }),
      ),
    );
  }

  findEpisode(providerId: string, externalAnimeId: string, externalEpisodeId: string) {
    return db
      .select({ title: catalogEpisode.title, number: catalogEpisode.number })
      .from(catalogEpisode)
      .where(
        and(
          eq(catalogEpisode.providerId, providerId),
          eq(catalogEpisode.externalAnimeId, externalAnimeId),
          eq(catalogEpisode.externalEpisodeId, externalEpisodeId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }
}
