import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { playbackSessions } from "../db/schema";

export type PlaybackSessionRow = typeof playbackSessions.$inferSelect;

export class PlaybackRepository {
  findLatestSession(
    userId: string,
    providerId: string,
    externalAnimeId: string,
    externalEpisodeId: string,
  ) {
    return db
      .select()
      .from(playbackSessions)
      .where(
        and(
          eq(playbackSessions.userId, userId),
          eq(playbackSessions.providerId, providerId),
          eq(playbackSessions.externalAnimeId, externalAnimeId),
          eq(playbackSessions.externalEpisodeId, externalEpisodeId),
        ),
      )
      .orderBy(desc(playbackSessions.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  createSession(input: typeof playbackSessions.$inferInsert) {
    return db
      .insert(playbackSessions)
      .values(input)
      .returning()
      .then((rows) => rows[0]);
  }

  getSession(userId: string, playbackSessionId: string) {
    return db
      .select()
      .from(playbackSessions)
      .where(and(eq(playbackSessions.id, playbackSessionId), eq(playbackSessions.userId, userId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  getSessionById(playbackSessionId: string) {
    return db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.id, playbackSessionId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  updateSession(playbackSessionId: string, input: Partial<typeof playbackSessions.$inferInsert>) {
    return db
      .update(playbackSessions)
      .set(input)
      .where(eq(playbackSessions.id, playbackSessionId))
      .returning()
      .then((rows) => rows[0] ?? null);
  }
}
