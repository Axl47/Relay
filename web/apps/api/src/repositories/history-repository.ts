import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { historyEntries } from "../db/schema";

export class HistoryRepository {
  listHistory(userId: string, providerIds: string[]) {
    if (providerIds.length === 0) {
      return Promise.resolve([]);
    }

    return db
      .select()
      .from(historyEntries)
      .where(and(eq(historyEntries.userId, userId), inArray(historyEntries.providerId, providerIds)))
      .orderBy(desc(historyEntries.watchedAt))
      .limit(100);
  }

  createHistoryEntry(input: typeof historyEntries.$inferInsert) {
    return db.insert(historyEntries).values(input);
  }
}
