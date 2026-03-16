import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import type {
  AnimeDetails,
  AssignCategoriesInput,
  AuthBootstrapInput,
  AuthLoginInput,
  AuthResponse,
  Category,
  CreateCategoryInput,
  CreatePlaybackSessionInput,
  EpisodeList,
  HistoryEntry,
  LibraryItemWithCategories,
  PlaybackSession,
  ProviderSummary,
  SearchInput,
  SearchPage,
  UpdateCategoryInput,
  UpdateLibraryItemInput,
  UpdatePlaybackProgressInput,
  UpdateProviderConfigInput,
  UpsertLibraryItemInput,
  UserPreferences,
} from "@relay/contracts";
import { userPreferencesSchema } from "@relay/contracts";
import { createProviderRegistry } from "@relay/providers";
import type { ProviderRegistry, RelayProvider } from "@relay/provider-sdk";
import { db } from "../db/client";
import {
  categories,
  categoryItems,
  catalogAnime,
  catalogEpisode,
  historyEntries,
  importJobs,
  libraryItems,
  playbackSessions,
  providerConfigs,
  providerHealthEvents,
  providers,
  sessions,
  trackerAccounts,
  trackerEntries,
  userPreferences,
  users,
  watchProgress,
} from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/auth";

const DEFAULT_PREFERENCES: UserPreferences = userPreferencesSchema.parse({});

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
};

export class RelayService {
  private registryPromise: Promise<ProviderRegistry>;

  constructor() {
    this.registryPromise = createProviderRegistry();
  }

  private async registry() {
    return this.registryPromise;
  }

  private async getProviderOrThrow(providerId: string): Promise<RelayProvider> {
    const provider = (await this.registry()).get(providerId);
    if (!provider) {
      throw Object.assign(new Error(`Unknown provider: ${providerId}`), { statusCode: 404 });
    }
    return provider;
  }

  async ensureProvidersSeeded() {
    const registry = await this.registry();
    const values = registry.list().map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      supportsSearch: provider.supportsSearch,
    }));

    for (const value of values) {
      await db
        .insert(providers)
        .values(value)
        .onConflictDoUpdate({
          target: providers.id,
          set: {
            displayName: value.displayName,
            supportsSearch: value.supportsSearch,
          },
        });
    }
  }

  async bootstrap(input: AuthBootstrapInput): Promise<AuthResponse> {
    const existingUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
    if (Number(existingUsers[0]?.count ?? 0) > 0) {
      throw Object.assign(new Error("Bootstrap has already been completed"), { statusCode: 409 });
    }

    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        isAdmin: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
      });

    await db.insert(userPreferences).values({
      userId: user.id,
      value: DEFAULT_PREFERENCES,
    });

    await this.ensureProvidersSeeded();

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: sessions.id });

    return {
      user,
      sessionId: session.id,
    };
  }

  async login(input: AuthLoginInput): Promise<AuthResponse> {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
    }

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: sessions.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      },
      sessionId: session.id,
    };
  }

  async logout(sessionId: string) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async getSessionUser(sessionId?: string | null): Promise<SessionUser | null> {
    if (!sessionId) return null;

    const [result] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!result || result.expiresAt < new Date()) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      displayName: result.displayName,
      isAdmin: result.isAdmin,
    };
  }

  async getPreferences(userId: string) {
    const [row] = await db
      .select({ value: userPreferences.value })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return userPreferencesSchema.parse(row?.value ?? DEFAULT_PREFERENCES);
  }

  async listProviders(userId: string): Promise<ProviderSummary[]> {
    await this.ensureProvidersSeeded();

    const registry = await this.registry();
    const providerRows = await db.select().from(providers).orderBy(asc(providers.id));
    const configRows = await db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.userId, userId));
    const configByProvider = new Map(configRows.map((row) => [row.providerId, row]));

    return providerRows.map((provider) => {
      const config = configByProvider.get(provider.id);
      const runtime = registry.get(provider.id);
      return {
        id: provider.id,
        displayName: provider.displayName,
        enabled: config?.enabled ?? true,
        priority: config?.priority ?? 0,
        supportsSearch: runtime?.supportsSearch ?? provider.supportsSearch,
        health: (config?.health as ProviderSummary["health"]) ?? "healthy",
        lastCheckedAt: config?.lastCheckedAt?.toISOString() ?? null,
      };
    });
  }

  async updateProviderConfig(
    userId: string,
    providerId: string,
    input: UpdateProviderConfigInput,
  ) {
    await this.ensureProvidersSeeded();
    const [row] = await db
      .insert(providerConfigs)
      .values({
        userId,
        providerId,
        enabled: input.enabled ?? true,
        priority: input.priority ?? 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [providerConfigs.userId, providerConfigs.providerId],
        set: {
          enabled: input.enabled ?? sql`${providerConfigs.enabled}`,
          priority: input.priority ?? sql`${providerConfigs.priority}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  }

  async search(userId: string, input: SearchInput): Promise<SearchPage[]> {
    const availableProviders = await this.listProviders(userId);
    const registry = await this.registry();
    const enabled = availableProviders
      .filter((provider) => provider.enabled)
      .sort((left, right) => left.priority - right.priority);

    const results: SearchPage[] = [];
    for (const provider of enabled) {
      const instance = registry.get(provider.id);
      if (!instance || !instance.supportsSearch) continue;
      results.push(await instance.search(input));
    }
    return results;
  }

  async getAnime(providerId: string, externalAnimeId: string): Promise<AnimeDetails> {
    const provider = await this.getProviderOrThrow(providerId);
    const anime = await provider.getAnime({ providerId, externalAnimeId });
    await db
      .insert(catalogAnime)
      .values({
        providerId,
        externalAnimeId,
        title: anime.title,
        synopsis: anime.synopsis,
        coverImage: anime.coverImage,
        bannerImage: anime.bannerImage,
        status: anime.status,
        year: anime.year,
        language: anime.language,
        tags: anime.tags,
        totalEpisodes: anime.totalEpisodes,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [catalogAnime.providerId, catalogAnime.externalAnimeId],
        set: {
          title: anime.title,
          synopsis: anime.synopsis,
          coverImage: anime.coverImage,
          bannerImage: anime.bannerImage,
          status: anime.status,
          year: anime.year,
          language: anime.language,
          tags: anime.tags,
          totalEpisodes: anime.totalEpisodes,
          updatedAt: new Date(),
        },
      });

    return anime;
  }

  async getEpisodes(providerId: string, externalAnimeId: string): Promise<EpisodeList> {
    const provider = await this.getProviderOrThrow(providerId);
    const payload = await provider.getEpisodes({ providerId, externalAnimeId });

    for (const episode of payload.episodes) {
      await db
        .insert(catalogEpisode)
        .values({
          providerId,
          externalAnimeId,
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
        });
    }

    return payload;
  }

  async listLibrary(userId: string): Promise<LibraryItemWithCategories[]> {
    const items = await db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.userId, userId))
      .orderBy(desc(libraryItems.updatedAt));

    const ids = items.map((item) => item.id);
    if (ids.length === 0) return [];

    const assignments = await db
      .select({
        libraryItemId: categoryItems.libraryItemId,
        categoryId: categories.id,
        name: categories.name,
        position: categories.position,
      })
      .from(categoryItems)
      .innerJoin(categories, eq(categories.id, categoryItems.categoryId))
      .where(inArray(categoryItems.libraryItemId, ids));

    const categoriesByItem = new Map<string, Array<{ id: string; name: string; position: number }>>();
    for (const assignment of assignments) {
      const current = categoriesByItem.get(assignment.libraryItemId) ?? [];
      current.push({
        id: assignment.categoryId,
        name: assignment.name,
        position: assignment.position,
      });
      categoriesByItem.set(assignment.libraryItemId, current);
    }

    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      providerId: item.providerId,
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      coverImage: item.coverImage,
      status: item.status as LibraryItemWithCategories["status"],
      addedAt: item.addedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      lastEpisodeNumber: item.lastEpisodeNumber,
      lastWatchedAt: item.lastWatchedAt?.toISOString() ?? null,
      categories: categoriesByItem.get(item.id) ?? [],
    }));
  }

  async addLibraryItem(userId: string, input: UpsertLibraryItemInput) {
    const [item] = await db
      .insert(libraryItems)
      .values({
        userId,
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        title: input.title,
        coverImage: input.coverImage,
        status: input.status,
      })
      .returning();
    return item;
  }

  async updateLibraryItem(userId: string, libraryItemId: string, input: UpdateLibraryItemInput) {
    const [item] = await db
      .update(libraryItems)
      .set({
        title: input.title,
        coverImage: input.coverImage,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)))
      .returning();
    return item;
  }

  async deleteLibraryItem(userId: string, libraryItemId: string) {
    await db
      .delete(libraryItems)
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)));
  }

  async listCategories(userId: string): Promise<Category[]> {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.position), asc(categories.createdAt));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createCategory(userId: string, input: CreateCategoryInput): Promise<Category> {
    const [{ nextPosition }] = await db
      .select({
        nextPosition: sql<number>`coalesce(max(${categories.position}), -1) + 1`,
      })
      .from(categories)
      .where(eq(categories.userId, userId));

    const [category] = await db
      .insert(categories)
      .values({
        userId,
        name: input.name,
        position: Number(nextPosition ?? 0),
      })
      .returning();

    return {
      id: category.id,
      userId: category.userId,
      name: category.name,
      position: category.position,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  async updateCategory(userId: string, categoryId: string, input: UpdateCategoryInput) {
    const [category] = await db
      .update(categories)
      .set({
        name: input.name,
        position: input.position,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
      .returning();
    return category;
  }

  async assignCategories(userId: string, libraryItemId: string, input: AssignCategoriesInput) {
    await db
      .delete(categoryItems)
      .where(
        inArray(
          categoryItems.categoryId,
          db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.userId, userId)),
        ),
      );

    for (const categoryId of input.categoryIds) {
      await db.insert(categoryItems).values({ categoryId, libraryItemId }).onConflictDoNothing();
    }
  }

  async createPlaybackSession(
    userId: string,
    input: CreatePlaybackSessionInput,
  ): Promise<PlaybackSession> {
    const provider = await this.getProviderOrThrow(input.providerId);
    const resolution = await provider.resolvePlayback(input);
    const stream = resolution.streams.find((item) => item.isDefault) ?? resolution.streams[0]!;

    const [session] = await db
      .insert(playbackSessions)
      .values({
        userId,
        libraryItemId: input.libraryItemId,
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streamUrl: stream.url,
        mimeType: stream.mimeType,
        headers: stream.headers,
        subtitles: resolution.subtitles,
        expiresAt: new Date(resolution.expiresAt),
      })
      .returning();

    return {
      id: session.id,
      userId: session.userId,
      providerId: session.providerId,
      externalAnimeId: session.externalAnimeId,
      externalEpisodeId: session.externalEpisodeId,
      streamUrl: session.streamUrl,
      mimeType: session.mimeType,
      subtitles: session.subtitles as PlaybackSession["subtitles"],
      headers: session.headers as PlaybackSession["headers"],
      expiresAt: session.expiresAt.toISOString(),
      positionSeconds: session.positionSeconds,
    };
  }

  async getPlaybackSession(userId: string, playbackSessionId: string): Promise<PlaybackSession | null> {
    const [session] = await db
      .select()
      .from(playbackSessions)
      .where(and(eq(playbackSessions.id, playbackSessionId), eq(playbackSessions.userId, userId)))
      .limit(1);

    if (!session) return null;
    return {
      id: session.id,
      userId: session.userId,
      providerId: session.providerId,
      externalAnimeId: session.externalAnimeId,
      externalEpisodeId: session.externalEpisodeId,
      streamUrl: session.streamUrl,
      mimeType: session.mimeType,
      subtitles: session.subtitles as PlaybackSession["subtitles"],
      headers: session.headers as PlaybackSession["headers"],
      expiresAt: session.expiresAt.toISOString(),
      positionSeconds: session.positionSeconds,
    };
  }

  async updatePlaybackProgress(
    userId: string,
    playbackSessionId: string,
    input: UpdatePlaybackProgressInput,
  ) {
    const session = await this.getPlaybackSession(userId, playbackSessionId);
    if (!session) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const threshold = (await this.getPreferences(userId)).watchedThresholdPercent;
    const duration = input.durationSeconds ?? null;
    const percentComplete =
      duration && duration > 0 ? Math.min(100, Math.round((input.positionSeconds / duration) * 100)) : 0;
    const completed = percentComplete >= threshold;

    const [existingProgress] = await db
      .select({ id: watchProgress.id })
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.providerId, session.providerId),
          eq(watchProgress.externalAnimeId, session.externalAnimeId),
          eq(watchProgress.externalEpisodeId, session.externalEpisodeId),
        ),
      )
      .limit(1);

    if (existingProgress) {
      await db
        .update(watchProgress)
        .set({
          positionSeconds: input.positionSeconds,
          durationSeconds: duration,
          percentComplete,
          completed,
          updatedAt: new Date(),
        })
        .where(eq(watchProgress.id, existingProgress.id));
    } else {
      await db.insert(watchProgress).values({
        userId,
        libraryItemId: null,
        providerId: session.providerId,
        externalAnimeId: session.externalAnimeId,
        externalEpisodeId: session.externalEpisodeId,
        positionSeconds: input.positionSeconds,
        durationSeconds: duration,
        percentComplete,
        completed,
      });
    }

    const [anime] = await db
      .select({
        title: catalogAnime.title,
        coverImage: catalogAnime.coverImage,
      })
      .from(catalogAnime)
      .where(
        and(
          eq(catalogAnime.providerId, session.providerId),
          eq(catalogAnime.externalAnimeId, session.externalAnimeId),
        ),
      )
      .limit(1);

    const [episode] = await db
      .select({ title: catalogEpisode.title, number: catalogEpisode.number })
      .from(catalogEpisode)
      .where(
        and(
          eq(catalogEpisode.providerId, session.providerId),
          eq(catalogEpisode.externalAnimeId, session.externalAnimeId),
          eq(catalogEpisode.externalEpisodeId, session.externalEpisodeId),
        ),
      )
      .limit(1);

    await db.insert(historyEntries).values({
      userId,
      libraryItemId: null,
      providerId: session.providerId,
      externalAnimeId: session.externalAnimeId,
      externalEpisodeId: session.externalEpisodeId,
      animeTitle: anime?.title ?? "Unknown anime",
      episodeTitle: episode?.title ?? "Episode",
      coverImage: anime?.coverImage ?? null,
      watchedAt: new Date(),
      positionSeconds: input.positionSeconds,
      durationSeconds: duration,
      completed,
    });

    await db
      .update(playbackSessions)
      .set({ positionSeconds: input.positionSeconds })
      .where(eq(playbackSessions.id, playbackSessionId));

    return { completed, percentComplete };
  }

  async getHistory(userId: string): Promise<HistoryEntry[]> {
    const rows = await db
      .select()
      .from(historyEntries)
      .where(eq(historyEntries.userId, userId))
      .orderBy(desc(historyEntries.watchedAt))
      .limit(100);

    return rows.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      libraryItemId: entry.libraryItemId,
      providerId: entry.providerId,
      externalAnimeId: entry.externalAnimeId,
      externalEpisodeId: entry.externalEpisodeId,
      animeTitle: entry.animeTitle,
      episodeTitle: entry.episodeTitle,
      coverImage: entry.coverImage,
      watchedAt: entry.watchedAt.toISOString(),
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      completed: entry.completed,
    }));
  }

  async getUpdates(userId: string) {
    return db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.userId, userId))
      .orderBy(desc(libraryItems.updatedAt))
      .limit(30);
  }

  async createImportJob(userId: string) {
    const [job] = await db
      .insert(importJobs)
      .values({
        userId,
        status: "pending",
        source: "android-backup",
        summary: {
          status: "scaffolded",
          message: "Worker-side Android backup parsing is not implemented yet.",
        },
      })
      .returning();
    return job;
  }

  async getImportJob(userId: string, jobId: string) {
    const [job] = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId)))
      .limit(1);
    return job;
  }

  async getTrackerEntries(userId: string) {
    const accounts = await db
      .select()
      .from(trackerAccounts)
      .where(eq(trackerAccounts.userId, userId))
      .orderBy(desc(trackerAccounts.createdAt));

    const entries = await db
      .select()
      .from(trackerEntries)
      .where(
        inArray(
          trackerEntries.trackerAccountId,
          accounts.map((account) => account.id),
        ),
      );

    return {
      accounts,
      entries,
      supported: ["anilist", "mal"],
    };
  }

  async createTrackerConnection(userId: string, trackerId: "anilist" | "mal") {
    const [account] = await db
      .insert(trackerAccounts)
      .values({
        userId,
        trackerId,
        status: "pending",
      })
      .returning();
    return {
      ...account,
      note: "OAuth flow is scaffolded but not implemented in this pass.",
    };
  }

  async deleteTrackerConnection(userId: string, trackerId: string) {
    await db
      .delete(trackerAccounts)
      .where(and(eq(trackerAccounts.userId, userId), eq(trackerAccounts.trackerId, trackerId)));
  }

  async recordProviderHealth(providerId: string, status: string, message?: string) {
    await db.insert(providerHealthEvents).values({ providerId, status, message });
  }
}
