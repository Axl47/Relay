---
created_at: 2026-02-22T04:43
updated_at: 2026-02-22T04:47
---
# PLAYER_MAP

## Core player architecture

### Entry points and activity flow

- `app/src/main/java/eu/kanade/tachiyomi/ui/main/MainActivity.kt`
  - Launches internal player via `PlayerActivity.newIntent(...)` in `startPlayerActivity(...)`.
  - Launches external player via `ExternalIntents.newIntent(...)` when external playback is enabled.
- `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerActivity.kt`
  - Main in-app playback activity.
  - Handles initialization, MPV setup, media loading, episode switching, PiP, cast, and player UI composition.

### ViewModel and state orchestration

- `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerViewModel.kt`
  - Owns episode list, hoster list/states, selected video quality, current video, tracker sync hooks, and skip-intro/AniSkip state.
  - Key methods:
    - `init(...)` to resolve anime/source/episode and initial hoster list.
    - `loadHosters(...)` to resolve and evaluate hoster video lists.
    - `loadEpisode(...)` and adjacent episode navigation helpers.
    - per-second progress update path -> mark seen/update trackers/download-ahead/delete-after-seen.

## mpvKt integration points

### MPV view and property wiring

- `app/src/main/java/eu/kanade/tachiyomi/ui/player/AniyomiMPVView.kt`
  - Wraps `BaseMPVView` from mpvKt.
  - Initializes MPV options (`initOptions`), including decoder, cache, TLS, subtitle/audio options.
  - Observes MPV runtime properties (`track-list`, `time-pos`, `duration`, `sid`, `aid`, etc.).
  - Applies subtitle/audio preferences directly via MPV options.

### MPV setup in activity

- `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerActivity.kt`
  - `setupPlayerMPV()`:
    - writes `mpv.conf` and `input.conf` from preferences,
    - copies scripts/assets/fonts,
    - initializes player and registers MPV observers.
  - `setVideo(...)`:
    - resolves URL and start position,
    - issues MPV `loadfile` command (or torrent indirection).
  - `setupTracks()`:
    - dynamically adds subtitle/audio tracks via MPV commands (`sub-add`, `audio-add`).

## Episode/source resolution pipeline

### Hoster and video retrieval

- `app/src/main/java/eu/kanade/tachiyomi/ui/player/loader/EpisodeLoader.kt`
  - `getHosters(...)` chooses path by source type:
    - downloaded episode,
    - online HTTP source,
    - local source.
  - `loadHosterVideos(...)` builds `HosterState.Ready/Error` for each hoster.

- `app/src/main/java/eu/kanade/tachiyomi/ui/player/loader/HosterLoader.kt`
  - `selectBestVideo(...)` chooses preferred/first viable stream from current hoster states.
  - `getResolvedVideo(...)` resolves source-provided video links (for uninitialized HTTP videos).
  - `getBestVideo(...)` concurrently probes hosters and early-returns best resolved video.

### ViewModel integration

- `PlayerViewModel.loadHosters(...)`:
  - seeds hoster state,
  - resolves hosters in parallel,
  - picks initial preferred/best playable video,
  - falls back across hosters/videos if a selected stream fails to resolve.

Current behavior note:
- There is hoster/video fallback inside a selected source’s hoster set, but no cross-source fallback chain manager yet.

## Progress persistence and tracker sync

### Internal player progress path

- `PlayerViewModel`:
  - saves progress/history,
  - marks seen based on progress threshold,
  - calls `updateTrackEpisodeSeen(...)` when appropriate,
  - supports delayed tracker sync when offline.

### External player progress path

- `app/src/main/java/eu/kanade/tachiyomi/ui/player/ExternalIntents.kt`
  - Builds external playback intents with headers/subtitles/position.
  - On return, persists progress/history and triggers tracker update logic similarly.

### Tracker dependencies used by player

- `PlayerViewModel` and `ExternalIntents` rely on track records from `anime_sync` via `GetTracks` and `TrackRepositoryImpl`.
- Tracker manager integration point:
  - `app/src/main/java/eu/kanade/tachiyomi/data/track/TrackerManager.kt`.

## Subtitle and audio track selection

- Preferred track selection logic:
  - `app/src/main/java/eu/kanade/tachiyomi/ui/player/utils/TrackSelect.kt`.
- Preference storage:
  - `app/src/main/java/eu/kanade/tachiyomi/ui/player/settings/SubtitlePreferences.kt`
  - `app/src/main/java/eu/kanade/tachiyomi/ui/player/settings/AudioPreferences.kt`
  - `app/src/main/java/eu/kanade/tachiyomi/ui/player/settings/PlayerPreferences.kt`
  - `app/src/main/java/eu/kanade/tachiyomi/ui/player/settings/AdvancedPlayerPreferences.kt`
- MPV option application:
  - `AniyomiMPVView.setupSubtitlesOptions()` and `setupAudioOptions()`.

## Episode navigation during playback

- `PlayerActivity.changeEpisode(...)` handles transition between episodes.
- `PlayerViewModel` computes adjacent episode id/index and loads next/prev episode state.
- Auto-advance hook in `PlayerActivity.endFile(...)` uses autoplay preference.

## AniSkip and chapter integration

- API client:
  - `app/src/main/java/eu/kanade/tachiyomi/ui/player/utils/AniSkipApi.kt`
  - Calls `https://api.aniskip.com/v2/skip-times/{malId}/{episode}`.
- ViewModel integration:
  - `PlayerViewModel.aniSkipResponse(...)` resolves MAL id from tracker data.
- Activity integration:
  - `PlayerActivity.fileLoaded()` merges AniSkip timestamps into chapter list when enabled.

## FFmpeg integration points

- FFmpeg dependency is present and wired in Gradle:
  - `app/build.gradle.kts` (`aniyomilibs.ffmpeg.kit`)
  - `core/common/build.gradle.kts`
  - `source-local/build.gradle.kts`
- Current player capture path found is MPV screenshot-based (not FFmpeg clip generation yet).

## Summary for Relay feature implementation

Pass 2 (source fallback chain) integration targets:
- `PlayerViewModel.loadHosters(...)`
- `EpisodeLoader` / `HosterLoader`
- new source-health/source-priority persistence layer in `data` + `domain`.

Pass 3 (AniSkip) starts from existing implementation:
- Existing AniSkip API + chapter merge is already present,
- Needs cache/persistence/policy/UX expansion per Relay spec.

Pass 4 (audio normalization + profiles):
- MPV option pipeline already centralized in `AniyomiMPVView`; ideal insertion point for normalization filter toggles.
