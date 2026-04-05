import { desc, eq, inArray, and } from "drizzle-orm";
import { db } from "../db/client";
import { trackerAccounts, trackerEntries } from "../db/schema";

export class TrackerRepository {
  listAccounts(userId: string) {
    return db
      .select()
      .from(trackerAccounts)
      .where(eq(trackerAccounts.userId, userId))
      .orderBy(desc(trackerAccounts.createdAt));
  }

  listEntries(trackerAccountIds: string[]) {
    if (trackerAccountIds.length === 0) {
      return Promise.resolve([]);
    }

    return db
      .select()
      .from(trackerEntries)
      .where(inArray(trackerEntries.trackerAccountId, trackerAccountIds));
  }

  createAccount(userId: string, trackerId: "anilist" | "mal") {
    return db
      .insert(trackerAccounts)
      .values({
        userId,
        trackerId,
        status: "pending",
      })
      .returning()
      .then((rows) => rows[0]);
  }

  deleteAccount(userId: string, trackerId: string) {
    return db
      .delete(trackerAccounts)
      .where(and(eq(trackerAccounts.userId, userId), eq(trackerAccounts.trackerId, trackerId)));
  }
}
