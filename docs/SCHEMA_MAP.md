---
created_at: 2026-02-22T04:46
updated_at: 2026-02-22T04:47
---
# SCHEMA_MAP

## SQLDelight file inventory

### Base schema files
- `data/src/main/sqldelight/tachiyomi/data/anime_sync.sq`
- `data/src/main/sqldelight/tachiyomi/data/animes.sq`
- `data/src/main/sqldelight/tachiyomi/data/animes_categories.sq`
- `data/src/main/sqldelight/tachiyomi/data/categories.sq`
- `data/src/main/sqldelight/tachiyomi/data/custom_buttons.sq`
- `data/src/main/sqldelight/tachiyomi/data/eh.sq`
- `data/src/main/sqldelight/tachiyomi/data/episodes.sq`
- `data/src/main/sqldelight/tachiyomi/data/excluded_scanlators.sq`
- `data/src/main/sqldelight/tachiyomi/data/extension_repos.sq`
- `data/src/main/sqldelight/tachiyomi/data/feed_saved_search.sq`
- `data/src/main/sqldelight/tachiyomi/data/history.sq`
- `data/src/main/sqldelight/tachiyomi/data/libraryUpdateError.sq`
- `data/src/main/sqldelight/tachiyomi/data/libraryUpdateErrorMessage.sq`
- `data/src/main/sqldelight/tachiyomi/data/merged.sq`
- `data/src/main/sqldelight/tachiyomi/data/saved_search.sq`
- `data/src/main/sqldelight/tachiyomi/data/sources.sq`

### SQLDelight view files
- `data/src/main/sqldelight/tachiyomi/view/historyView.sq`
- `data/src/main/sqldelight/tachiyomi/view/libraryUpdateErrorView.sq`
- `data/src/main/sqldelight/tachiyomi/view/libraryView.sq`
- `data/src/main/sqldelight/tachiyomi/view/updatesView.sq`

### SQLDelight migration files
- `data/src/main/sqldelightanime/migrations/129.sqm`

## Tables, columns, and relationships

### `animes`
- PK: `_id`
- Core fields: `source`, `url`, `title`, `status`, `thumbnail_url`, `favorite`, `initialized`, `viewer`, `episode_flags`, `date_added`
- Sync/versioning fields: `last_modified_at`, `favorite_modified_at`, `version`, `is_syncing`
- Other metadata: author/artist/description/genre, update scheduling fields
- Indexes: favorite partial index, URL index
- Triggers:
  - updates `favorite_modified_at`
  - updates `last_modified_at`
  - increments `version` on relevant changes

### `episodes`
- PK: `_id`
- FK: `anime_id -> animes(_id)` (`ON DELETE CASCADE`)
- Playback/progress fields: `seen`, `bookmark`, `last_second_seen`, `total_seconds`
- Episode identity/order fields: `url`, `name`, `scanlator`, `episode_number`, `source_order`
- Relay-relevant custom field already present: `fillermark`
- Sync/versioning fields: `last_modified_at`, `version`, `is_syncing`
- Indexes on anime linkage and unseen episodes
- Triggers:
  - updates `last_modified_at`
  - increments episode/anime version on progress state changes

### `anime_sync`
- PK: `_id`
- Unique: `(anime_id, sync_id)` (`ON CONFLICT REPLACE`)
- FK: `anime_id -> animes(_id)` (`ON DELETE CASCADE`)
- Tracker mapping fields:
  - local links: `anime_id`, `sync_id`
  - remote links: `remote_id`, `library_id`, `remote_url`
  - progress/state: `last_episode_seen`, `total_episodes`, `status`, `score`, `start_date`, `finish_date`

### `animes_categories`
- PK: `_id`
- FK: `anime_id -> animes(_id)` (`ON DELETE CASCADE`)
- FK: `category_id -> categories(_id)` (`ON DELETE CASCADE`)
- Trigger increments `animes.version` on inserts

### `categories`
- PK: `_id`
- Fields: `name`, `sort`, `flags`, `hidden`
- Includes system category insert guard + delete protection trigger

### `excluded_scanlators`
- Composite-style rows of `anime_id + scanlator`
- FK: `anime_id -> animes(_id)` (`ON DELETE CASCADE`)
- Index on `anime_id`

### `history`
- PK: `_id`
- Unique: `episode_id`
- FK: `episode_id -> episodes(_id)` (`ON DELETE CASCADE`)
- Fields: `last_seen`, `time_watch`

### `merged`
- PK: `_id`
- FK: `anime_id -> animes(_id)` (`ON DELETE SET NULL`)
- FK: `merge_id -> animes(_id)` (`ON DELETE CASCADE`)
- Fields control multi-source merge behavior and source metadata

### `saved_search`
- PK: `_id`
- Fields: `source`, `name`, `query`, `filters_json`

### `feed_saved_search`
- PK: `_id`
- FK: `saved_search -> saved_search(_id)` (`ON DELETE CASCADE`)
- Fields: `source`, `global`, `feed_order`

### `sources`
- PK: `_id`
- Fields: `lang`, `name`

### `extension_repos`
- PK: `base_url`
- Unique: `signing_key_fingerprint`
- Fields: `name`, `short_name`, `website`

### `libraryUpdateError`
- PK: `_id` (`AUTOINCREMENT`)
- Unique: `anime_id`
- Fields: `message_id`

### `libraryUpdateErrorMessage`
- PK: `_id` (`AUTOINCREMENT`)
- Unique: `message`

### `custom_buttons`
- PK: `_id`
- Fields: `name`, `isFavorite`, `sortIndex`, `content`, `longPressContent`, `onStartup`
- Created in base schema and also migration `129.sqm`

## Views

### `historyView`
- Joins `animes`, `episodes`, `history`
- Exposes latest-watch oriented history rows per anime

### `libraryUpdateErrorView`
- Joins `animes` + `libraryUpdateError`
- Filters to favorite anime

### `libraryView`
- Aggregates `animes` with episode/history/category stats
- Has separate union branches for normal vs merged source (`source = 6969`)

### `updatesView`
- Joins `animes` + `episodes` and filters recent fetched episodes
- Also handles merged-source rows via union branch

## Migration scheme

- File pattern is numeric `.sqm` under `data/src/main/sqldelightanime/migrations/`.
- Current observed migration: `129.sqm`.
- Existing app-level migration orchestration exists in:
  - `app/src/main/java/mihon/core/migration/migrations/Migrations.kt`
  - `app/src/main/java/mihon/core/migration/migrations/*`
- SQLDelight migrations and app runtime migrations are separate systems:
  - `.sqm` updates DB schema
  - Kotlin migration jobs set up runtime/app behavior

## Anime ↔ tracker ID mapping (critical path)

### Storage model
- `anime_sync.anime_id` links tracking records to a local anime row.
- `anime_sync.sync_id` is the tracker identity key.
- Domain mapping is handled in:
  - `data/src/main/java/tachiyomi/data/track/TrackMapper.kt`
  - `data/src/main/java/tachiyomi/data/track/TrackRepositoryImpl.kt`

### Tracker ID registry source
- IDs are defined/instantiated in `app/src/main/java/eu/kanade/tachiyomi/data/track/TrackerManager.kt`:
  - MAL: `1L`
  - AniList: `2L`
  - Kitsu: `3L`
  - Shikimori: `4L`
  - Bangumi: `5L`
  - Simkl: `101L`
  - Jellyfin: `102L`

### Relay implication
- For "AniList + MAL only", `anime_sync` rows for `sync_id` values not in `{1, 2}` should be treated as removable/legacy during tracker cleanup.
- Keep schema table `anime_sync`; reduce active service set and UI exposure, then clean stale rows for removed trackers.

