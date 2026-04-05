import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { UpdateCategoryInput, UpdateLibraryItemInput, UpsertLibraryItemInput } from "@relay/contracts";
import { db } from "../db/client";
import {
  categories,
  categoryItems,
  libraryItems,
  watchProgress,
} from "../db/schema";

export class LibraryRepository {
  listLibraryItems(userId: string, providerIds: string[]) {
    if (providerIds.length === 0) {
      return Promise.resolve([]);
    }

    return db
      .select()
      .from(libraryItems)
      .where(and(eq(libraryItems.userId, userId), inArray(libraryItems.providerId, providerIds)))
      .orderBy(desc(libraryItems.updatedAt));
  }

  listCategoryAssignments(libraryItemIds: string[]) {
    if (libraryItemIds.length === 0) {
      return Promise.resolve([]);
    }

    return db
      .select({
        libraryItemId: categoryItems.libraryItemId,
        categoryId: categories.id,
        name: categories.name,
        position: categories.position,
      })
      .from(categoryItems)
      .innerJoin(categories, eq(categories.id, categoryItems.categoryId))
      .where(inArray(categoryItems.libraryItemId, libraryItemIds));
  }

  createLibraryItem(userId: string, input: UpsertLibraryItemInput) {
    return db
      .insert(libraryItems)
      .values({
        userId,
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        title: input.title,
        coverImage: input.coverImage,
        kind: input.kind,
        status: input.status,
      })
      .returning()
      .then((rows) => rows[0]);
  }

  updateLibraryItem(userId: string, libraryItemId: string, input: UpdateLibraryItemInput) {
    return db
      .update(libraryItems)
      .set({
        title: input.title,
        coverImage: input.coverImage,
        kind: input.kind,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)))
      .returning()
      .then((rows) => rows[0]);
  }

  deleteLibraryItem(userId: string, libraryItemId: string) {
    return db
      .delete(libraryItems)
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)));
  }

  listCategories(userId: string) {
    return db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.position), asc(categories.createdAt));
  }

  getNextCategoryPosition(userId: string) {
    return db
      .select({
        nextPosition: sql<number>`coalesce(max(${categories.position}), -1) + 1`,
      })
      .from(categories)
      .where(eq(categories.userId, userId))
      .then((rows) => Number(rows[0]?.nextPosition ?? 0));
  }

  createCategory(userId: string, name: string, position: number) {
    return db
      .insert(categories)
      .values({
        userId,
        name,
        position,
      })
      .returning()
      .then((rows) => rows[0]);
  }

  updateCategory(userId: string, categoryId: string, input: UpdateCategoryInput) {
    return db
      .update(categories)
      .set({
        name: input.name,
        position: input.position,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
      .returning()
      .then((rows) => rows[0]);
  }

  async replaceCategoryAssignments(userId: string, libraryItemId: string, categoryIds: string[]) {
    await db
      .delete(categoryItems)
      .where(
        and(
          eq(categoryItems.libraryItemId, libraryItemId),
          inArray(
            categoryItems.categoryId,
            db
              .select({ id: categories.id })
              .from(categories)
              .where(eq(categories.userId, userId)),
          ),
        ),
      );

    await Promise.all(
      categoryIds.map((categoryId) =>
        db.insert(categoryItems).values({ categoryId, libraryItemId }).onConflictDoNothing(),
      ),
    );
  }

  findLibraryItemIdByAnime(userId: string, providerId: string, externalAnimeId: string) {
    return db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.userId, userId),
          eq(libraryItems.providerId, providerId),
          eq(libraryItems.externalAnimeId, externalAnimeId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  listWatchProgress(userId: string, providerIds: string[]) {
    if (providerIds.length === 0) {
      return Promise.resolve([]);
    }

    return db
      .select()
      .from(watchProgress)
      .where(and(eq(watchProgress.userId, userId), inArray(watchProgress.providerId, providerIds)))
      .orderBy(desc(watchProgress.updatedAt));
  }

  listAnimeWatchProgress(userId: string, providerId: string, externalAnimeId: string) {
    return db
      .select()
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.providerId, providerId),
          eq(watchProgress.externalAnimeId, externalAnimeId),
        ),
      )
      .orderBy(desc(watchProgress.updatedAt));
  }

  findWatchProgress(
    userId: string,
    providerId: string,
    externalAnimeId: string,
    externalEpisodeId: string,
  ) {
    return db
      .select({
        id: watchProgress.id,
        completed: watchProgress.completed,
      })
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.providerId, providerId),
          eq(watchProgress.externalAnimeId, externalAnimeId),
          eq(watchProgress.externalEpisodeId, externalEpisodeId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  updateWatchProgress(
    progressId: string,
    input: {
      positionSeconds: number;
      durationSeconds: number | null;
      percentComplete: number;
      completed: boolean;
      updatedAt: Date;
    },
  ) {
    return db.update(watchProgress).set(input).where(eq(watchProgress.id, progressId));
  }

  createWatchProgress(input: {
    userId: string;
    libraryItemId: string | null;
    providerId: string;
    externalAnimeId: string;
    externalEpisodeId: string;
    positionSeconds: number;
    durationSeconds: number | null;
    percentComplete: number;
    completed: boolean;
    updatedAt: Date;
  }) {
    return db.insert(watchProgress).values(input);
  }

  updateLibraryItemResume(
    userId: string,
    libraryItemId: string,
    input: {
      lastEpisodeNumber: number | null;
      watchedAt: Date;
    },
  ) {
    return db
      .update(libraryItems)
      .set({
        lastEpisodeNumber: input.lastEpisodeNumber,
        lastWatchedAt: input.watchedAt,
        updatedAt: input.watchedAt,
      })
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)));
  }
}
