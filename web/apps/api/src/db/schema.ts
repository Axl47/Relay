import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIndex: uniqueIndex("users_email_unique").on(table.email),
  }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providers = pgTable("providers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  baseUrl: text("base_url").notNull(),
  contentClass: varchar("content_class", { length: 16 }).notNull().default("anime"),
  executionMode: varchar("execution_mode", { length: 16 }).notNull().default("http"),
  requiresAdultGate: boolean("requires_adult_gate").notNull().default(false),
  supportsSearch: boolean("supports_search").notNull().default(true),
  supportsTrackerSync: boolean("supports_tracker_sync").notNull().default(false),
  defaultEnabled: boolean("default_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerConfigs = pgTable(
  "provider_configs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.providerId] }),
  }),
);

export const catalogAnime = pgTable(
  "catalog_anime",
  {
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    externalAnimeId: varchar("external_anime_id", { length: 255 }).notNull(),
    title: text("title").notNull(),
    synopsis: text("synopsis"),
    coverImage: text("cover_image"),
    bannerImage: text("banner_image"),
    status: varchar("status", { length: 32 }).notNull().default("unknown"),
    year: integer("year"),
    language: varchar("language", { length: 16 }).notNull().default("en"),
    contentClass: varchar("content_class", { length: 16 }).notNull().default("anime"),
    requiresAdultGate: boolean("requires_adult_gate").notNull().default(false),
    tags: jsonb("tags").notNull().default([]),
    totalEpisodes: integer("total_episodes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.providerId, table.externalAnimeId] }),
  }),
);

export const catalogEpisode = pgTable(
  "catalog_episode",
  {
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    externalAnimeId: varchar("external_anime_id", { length: 255 }).notNull(),
    externalEpisodeId: varchar("external_episode_id", { length: 255 }).notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    synopsis: text("synopsis"),
    thumbnail: text("thumbnail"),
    durationSeconds: integer("duration_seconds"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.providerId, table.externalAnimeId, table.externalEpisodeId],
    }),
  }),
);

export const libraryItems = pgTable("library_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: varchar("provider_id", { length: 64 })
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  externalAnimeId: varchar("external_anime_id", { length: 255 }).notNull(),
  title: text("title").notNull(),
  coverImage: text("cover_image"),
  status: varchar("status", { length: 32 }).notNull().default("watching"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastEpisodeNumber: integer("last_episode_number"),
  lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categoryItems = pgTable(
  "category_items",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.categoryId, table.libraryItemId] }),
  }),
);

export const watchProgress = pgTable("watch_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: uuid("library_item_id").references(() => libraryItems.id, {
    onDelete: "set null",
  }),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  externalAnimeId: varchar("external_anime_id", { length: 255 }).notNull(),
  externalEpisodeId: varchar("external_episode_id", { length: 255 }).notNull(),
  positionSeconds: integer("position_seconds").notNull().default(0),
  durationSeconds: integer("duration_seconds"),
  percentComplete: integer("percent_complete").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const historyEntries = pgTable("history_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: uuid("library_item_id").references(() => libraryItems.id, {
    onDelete: "set null",
  }),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  externalAnimeId: varchar("external_anime_id", { length: 255 }).notNull(),
  externalEpisodeId: varchar("external_episode_id", { length: 255 }).notNull(),
  animeTitle: text("anime_title").notNull(),
  episodeTitle: text("episode_title").notNull(),
  coverImage: text("cover_image"),
  watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
  positionSeconds: integer("position_seconds").notNull().default(0),
  durationSeconds: integer("duration_seconds"),
  completed: boolean("completed").notNull().default(false),
});

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playbackSessions = pgTable("playback_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: uuid("library_item_id").references(() => libraryItems.id, {
    onDelete: "set null",
  }),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  externalAnimeId: varchar("external_anime_id", { length: 255 }).notNull(),
  externalEpisodeId: varchar("external_episode_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("resolving"),
  proxyMode: varchar("proxy_mode", { length: 16 }).notNull().default("proxy"),
  upstreamUrl: text("upstream_url"),
  mimeType: varchar("mime_type", { length: 128 }),
  headers: jsonb("headers").notNull().default({}),
  cookies: jsonb("cookies").notNull().default({}),
  subtitles: jsonb("subtitles").notNull().default([]),
  error: text("error"),
  positionSeconds: integer("position_seconds").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trackerAccounts = pgTable("tracker_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trackerId: varchar("tracker_id", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trackerEntries = pgTable("tracker_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  trackerAccountId: uuid("tracker_account_id")
    .notNull()
    .references(() => trackerAccounts.id, { onDelete: "cascade" }),
  libraryItemId: uuid("library_item_id")
    .notNull()
    .references(() => libraryItems.id, { onDelete: "cascade" }),
  progress: integer("progress").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("watching"),
  score: integer("score"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  source: varchar("source", { length: 32 }).notNull().default("android-backup"),
  summary: jsonb("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerHealthEvents = pgTable("provider_health_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerId: varchar("provider_id", { length: 64 })
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull(),
  reason: varchar("reason", { length: 32 }).notNull().default("ok"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
