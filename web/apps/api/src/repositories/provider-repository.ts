import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { providerConfigs, providerHealthEvents, providers } from "../db/schema";

export class ProviderRepository {
  upsertProvider(input: {
    id: string;
    displayName: string;
    baseUrl: string;
    contentClass: string;
    executionMode: string;
    requiresAdultGate: boolean;
    supportsSearch: boolean;
    supportsTrackerSync: boolean;
    defaultEnabled: boolean;
  }) {
    return db
      .insert(providers)
      .values(input)
      .onConflictDoUpdate({
        target: providers.id,
        set: {
          displayName: input.displayName,
          baseUrl: input.baseUrl,
          contentClass: input.contentClass,
          executionMode: input.executionMode,
          requiresAdultGate: input.requiresAdultGate,
          supportsSearch: input.supportsSearch,
          supportsTrackerSync: input.supportsTrackerSync,
          defaultEnabled: input.defaultEnabled,
        },
      });
  }

  listProviders() {
    return db.select().from(providers).orderBy(asc(providers.id));
  }

  listProviderConfigs(userId: string) {
    return db.select().from(providerConfigs).where(eq(providerConfigs.userId, userId));
  }

  findProviderConfig(userId: string, providerId: string) {
    return db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.providerId, providerId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  insertProviderConfigIfMissing(input: {
    userId: string;
    providerId: string;
    enabled: boolean;
    priority: number;
  }) {
    return db.insert(providerConfigs).values(input).onConflictDoNothing();
  }

  upsertProviderConfig(input: {
    userId: string;
    providerId: string;
    enabled?: boolean;
    priority?: number;
  }) {
    return db
      .insert(providerConfigs)
      .values({
        userId: input.userId,
        providerId: input.providerId,
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
      .returning()
      .then((rows) => rows[0]);
  }

  listHealthEvents() {
    return db
      .select()
      .from(providerHealthEvents)
      .orderBy(asc(providerHealthEvents.providerId), desc(providerHealthEvents.createdAt));
  }

  insertHealthEvent(input: {
    providerId: string;
    status: string;
    reason: string;
    message?: string;
  }) {
    return db.insert(providerHealthEvents).values(input);
  }
}
