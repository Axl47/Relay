---
created_at: 2026-02-22T04:42
updated_at: 2026-02-22T04:42
---
# TRACKER_MAP

## Tracker implementations

Base tracker package root:
- `app/src/main/java/eu/kanade/tachiyomi/data/track`

Core registry/types:
- `app/src/main/java/eu/kanade/tachiyomi/data/track/TrackerManager.kt`
- `app/src/main/java/eu/kanade/tachiyomi/data/track/TrackStatus.kt`
- `app/src/main/java/eu/kanade/tachiyomi/data/track/Tracker.kt`
- `app/src/main/java/eu/kanade/tachiyomi/data/track/BaseTracker.kt`
- `app/src/main/java/eu/kanade/tachiyomi/data/track/AnimeTracker.kt`
- `app/src/main/java/eu/kanade/tachiyomi/data/track/EnhancedTracker.kt`
- `app/src/main/java/eu/kanade/tachiyomi/data/track/DeletableTracker.kt`

Per-service implementation directories/files:
- AniList: `app/src/main/java/eu/kanade/tachiyomi/data/track/anilist/*`
- MyAnimeList: `app/src/main/java/eu/kanade/tachiyomi/data/track/myanimelist/*`
- Kitsu: `app/src/main/java/eu/kanade/tachiyomi/data/track/kitsu/*`
- Shikimori: `app/src/main/java/eu/kanade/tachiyomi/data/track/shikimori/*`
- Bangumi: `app/src/main/java/eu/kanade/tachiyomi/data/track/bangumi/*`
- Simkl: `app/src/main/java/eu/kanade/tachiyomi/data/track/simkl/*`
- Jellyfin: `app/src/main/java/eu/kanade/tachiyomi/data/track/jellyfin/*`

## Tracker registration and lifecycle wiring

Primary registration:
- `TrackerManager` instantiates and exposes all trackers in `trackers` list:
  - `myAnimeList` (id `1L`)
  - `aniList` (id `2L`)
  - `kitsu` (id `3L`)
  - `shikimori` (id `4L`)
  - `bangumi` (id `5L`)
  - `simkl` (id `101L`)
  - `jellyfin` (id `102L`)

Status mapping logic:
- `TrackStatus.parseTrackerStatus(...)` has explicit branches for MAL/AniList/Kitsu/Shikimori/Bangumi/Simkl.

DB mapping to anime:
- `anime_sync` table (`data/src/main/sqldelight/tachiyomi/data/anime_sync.sq`) stores:
  - `anime_id` (local anime)
  - `sync_id` (tracker id)
  - `remote_id` (tracker-side anime id)
  - watch/status/score/date fields.
- Repository layer: `data/src/main/java/tachiyomi/data/track/TrackRepositoryImpl.kt`.

## Tracker UI surfaces

Tracking settings screen:
- `app/src/main/java/eu/kanade/presentation/more/settings/screen/SettingsTrackingScreen.kt`
- Explicit login/logout entries currently shown for:
  - MAL, AniList, Kitsu, Shikimori, Simkl, Bangumi.
- Enhanced tracker section is derived from `trackerManager.trackers.filter { it is EnhancedTracker }`.

OAuth callback handling:
- `app/src/main/java/eu/kanade/tachiyomi/ui/setting/track/TrackLoginActivity.kt`
- Hosts handled: `anilist-auth`, `bangumi-auth`, `myanimelist-auth`, `shikimori-auth`, `simkl-auth`.
- Manifest deeplinks:
  - `app/src/main/AndroidManifest.xml` in `.ui.setting.track.TrackLoginActivity` intent filter.

Anime detail tracking sheet/dialog:
- `app/src/main/java/eu/kanade/tachiyomi/ui/anime/track/TrackInfoDialog.kt`
- Includes tracker search/register/remove/status/score/date update flows.

Library filtering/sorting by tracker state:
- `app/src/main/java/eu/kanade/tachiyomi/ui/library/LibrarySettingsScreenModel.kt`
- `app/src/main/java/eu/kanade/tachiyomi/ui/library/LibraryScreenModel.kt`
- `domain/src/main/java/tachiyomi/domain/library/service/LibraryPreferences.kt` (`filterTracking(id)`).

Player integration touchpoints:
- `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerViewModel.kt`
  - auto-update tracker progress when episodes are marked seen.
  - AniSkip MAL-ID resolution path uses MAL directly or AniList->MAL conversion.

## Keep vs remove for Relay Pass 1

Keep:
- AniList (`anilist/*`)
- MyAnimeList (`myanimelist/*`)

Remove (per Relay spec):
- Kitsu (`kitsu/*`)
- Shikimori (`shikimori/*`)
- Bangumi (`bangumi/*`)
- Simkl (`simkl/*`)
- Jellyfin (`jellyfin/*`) to reach “AniList + MAL only” tracker scope.

Additional cleanup required during removal:
- `TrackerManager` list and constants
- `TrackStatus` mapping branches
- `SettingsTrackingScreen` service entries
- `TrackLoginActivity` handlers + manifest hosts
- Any tracker-specific resource strings/icons/changelog entries and backup-restore assumptions
