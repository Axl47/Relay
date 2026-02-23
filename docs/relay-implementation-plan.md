---
created_at: 2026-02-22T04:35
updated_at: 2026-02-22T04:37
---
# Relay — Claude Code Implementation Plan
## Anikku Fork: Cut → Rebrand → Build

This plan is designed to be executed by Claude Code using sub-agents for parallel work.
Each pass builds cleanly on the last. Every pass ends with a compilable, runnable app.

---

## Prerequisites

```bash
# Clone Anikku
git clone https://github.com/komikku-app/anikku.git relay
cd relay
git checkout -b relay/main

# Verify baseline build
./gradlew assembleDebug
```

**Target**: Android 16 (API 36). minSdk will be raised to 29 (Android 10).

---

## Pass 0 — Repository Audit & Map
**Goal**: Before changing anything, build a complete map of the codebase.
**Agent**: Single agent, sequential. This pass produces the reference map all other passes use.

### Tasks

1. **Map the module graph**
   ```
   Output: A file at docs/MODULE_MAP.md listing:
   - Every module in settings.gradle.kts
   - What each module contains (1-2 sentence summary)
   - Inter-module dependencies (which modules import which)
   ```

2. **Map tracker implementations**
   ```
   Find all tracker service implementations. Expected locations:
   - app/src/main/java/eu/kanade/tachiyomi/data/track/
   - Each tracker (anilist/, myanimelist/, kitsu/, shikimori/, bangumi/, simkl/) 
     is likely its own subdirectory or file set.
   Output: docs/TRACKER_MAP.md listing:
   - Every tracker class/file
   - Where each tracker is registered (likely a TrackManager or similar registry)
   - Where tracker UI appears (settings screen, anime detail screen, library filters)
   - Which trackers to KEEP (anilist, myanimelist) vs REMOVE (kitsu, shikimori, bangumi, simkl)
   ```

3. **Map features to code locations**
   ```
   Find code locations for every feature being cut. Output: docs/CUT_MAP.md
   Features to locate:
   - SyncYomi sync (likely in data/sync/ or similar)
   - Google Drive sync/backup
   - Discord Rich Presence (likely a service + SDK dependency)
   - Android TV / Fire TV / Leanback (manifest entries, leanback library, TV-specific layouts)
   - Feed tab (presentation layer + domain/data for saved searches)
   - NSFW/Lewd filter (library filter logic + settings)
   - Panorama/wide cover display
   - Manual anime info editing (the "fill from Kitsu/Shikimori/Bangumi/Simkl" specifically)
   - Custom theme color palettes (settings + theme engine)
   - Firebase/telemetry module
   - Onboarding/getting started flow
   - Localization modules (i18n-ank, i18n-kmk, i18n-sy, i18n, flagkit)
   - macrobenchmark module
   - Preview/benchmark build variants
   - Auto-update system (KEEP but note location for retargeting)
   ```

4. **Map the player system**
   ```
   Output: docs/PLAYER_MAP.md
   - mpvKt integration points (Activity, ViewModel, mpv configuration)
   - How video sources are resolved and passed to the player
   - How playback progress is tracked and synced to trackers
   - How subtitle/audio track selection works
   - How episode navigation (next/prev) works during playback
   - FFmpeg Kit integration points (already bundled — where and how it's used)
   - Where player settings are stored (preferences/DB)
   ```

5. **Map the database schema**
   ```
   Output: docs/SCHEMA_MAP.md
   - All SQLDelight .sq files and their locations
   - All tables, their columns, and relationships
   - Migration files and their numbering scheme
   - How the anime ↔ tracker ID mapping works (critical for API features)
   ```

6. **Map the build configuration**
   ```
   Output: docs/BUILD_MAP.md
   - All product flavors and build types in app/build.gradle.kts
   - All dependencies in gradle/libs.versions.toml (flag which are removable)
   - Firebase/Google Services plugin configuration
   - Signing configuration
   - ProGuard/R8 rules relevant to removed features
   ```

**Completion criteria**: All 6 docs created, reviewed for accuracy against actual file paths.

---

## Pass 1 — Strip & Rebrand
**Goal**: Remove all cut features, rebrand to Relay, raise minSdk, verify build.
**Agents**: 4 parallel sub-agents after initial coordination.

### Pre-split: Coordinator Agent
- Read all docs from Pass 0
- Create a branch `relay/strip`
- Assign work to sub-agents with explicit file paths from the maps

### Sub-Agent A: Module & Build Cleanup
**Scope**: Gradle modules, build config, dependencies

1. **Remove modules from settings.gradle.kts**:
   - `i18n-ank`, `i18n-kmk`, `i18n-sy`, `i18n` (all 4 localization modules)
   - `flagkit`
   - `telemetry`
   - `macrobenchmark`

2. **Delete the module directories** for all removed modules

3. **Fix all references** to removed modules:
   - `build.gradle.kts` in `app/` and root — remove `implementation(project(":i18n-ank"))` etc.
   - Replace localized string references with hardcoded English strings or a single flat strings.xml
   - Remove `flagkit` drawable/resource references throughout the codebase

4. **Simplify build variants**:
   - Remove `preview` and `benchmark` build types from `app/build.gradle.kts`
   - Collapse `standard`/`dev` product flavors into a single default (keep the `standard` behavior, remove `dev`)
   - Remove related ProGuard/R8 rules for removed flavors

5. **Remove Firebase/Google Services**:
   - Remove `google-services` plugin from `app/build.gradle.kts`
   - Remove `google-services.json` if present
   - Remove Firebase dependencies from `gradle/libs.versions.toml`
   - Remove any Firebase initialization in `App.kt`

6. **Remove Discord SDK dependency** from `gradle/libs.versions.toml` and `app/build.gradle.kts`

7. **Remove Leanback/TV dependencies** from `gradle/libs.versions.toml` and `app/build.gradle.kts`

8. **Raise minSdk to 29** (Android 10) in `app/build.gradle.kts`:
   - Set `minSdk = 29`
   - Set `targetSdk = 36` (Android 16)
   - Remove any `Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q` checks (they're now always true)

9. **Verify**: `./gradlew assembleDebug` compiles with only dependency/import errors (expected — other agents are doing code cleanup in parallel)

### Sub-Agent B: Tracker Cleanup
**Scope**: Remove Kitsu, Shikimori, Bangumi, Simkl tracker implementations

1. **Delete tracker implementation directories/files** for:
   - Kitsu
   - Shikimori
   - Bangumi
   - Simkl

2. **Update the tracker registry** (likely `TrackManager.kt` or similar):
   - Remove registration of deleted trackers
   - Keep only AniList and MAL

3. **Update tracker settings UI**:
   - Remove login/logout entries for deleted trackers
   - Remove tracker-specific preference keys

4. **Update anime detail screen**:
   - Remove deleted trackers from the tracking sheet/dialog
   - Remove "fill data from Kitsu/Shikimori/Bangumi/Simkl" options from manual edit UI

5. **Update library filter**:
   - Remove filter options for deleted trackers
   - Keep generic "tracked/untracked" filter

6. **Clean up any tracker-specific DB migrations or schema references**

7. **Search entire codebase** for remaining references to removed tracker names (grep for `kitsu`, `shikimori`, `bangumi`, `simkl` case-insensitively) and clean up

### Sub-Agent C: Feature Removal
**Scope**: Remove SyncYomi, GDrive, Discord, TV, Feed tab, NSFW filter, and other cut features

1. **SyncYomi sync**:
   - Delete sync service/manager classes
   - Remove sync-related settings UI
   - Remove sync notification channels
   - Remove WorkManager jobs for sync
   - Remove any SyncYomi-specific dependencies

2. **Google Drive sync/backup**:
   - Delete Google Drive backup/restore classes
   - Remove Google Drive OAuth flow
   - Remove Google Drive settings UI entries
   - Keep local backup/restore functionality intact

3. **Discord Rich Presence**:
   - Delete Discord RPC service class
   - Remove Discord service registration from AndroidManifest.xml
   - Remove Discord-related settings
   - Remove Discord SDK initialization from App.kt

4. **Android TV / Fire TV**:
   - Remove leanback-related Activity declarations from AndroidManifest.xml
   - Remove `android.software.leanback` and `android.hardware.touchscreen` feature declarations
   - Remove TV-specific layout files and resources
   - Remove any D-pad navigation handling code specific to TV
   - Remove banner/TV icon resources

5. **Feed tab**:
   - Remove Feed tab from bottom navigation / tab bar
   - Delete Feed screen composables and ViewModels
   - Delete Feed-related domain use cases and data repositories
   - Remove saved search persistence if it's only used by Feed
   - Keep saved searches if they're used elsewhere (e.g., Browse)

6. **NSFW / Lewd filter**:
   - Remove lewd filter toggle from library settings
   - Remove NSFW filtering logic from library queries
   - Remove incognito-mode-related UI if it's solely tied to NSFW

7. **Panorama / wide cover display**: 
   - Remove panorama cover composable/view
   - Simplify cover display to standard aspect ratio

8. **Custom color palette picker**:
   - Remove palette picker settings screen
   - Keep dynamic cover-based theming (the automatic one)
   - Remove palette-related preferences and theme builder code

9. **Onboarding / getting started**:
   - Remove onboarding Activity/Fragment/Screen
   - Remove first-launch check and redirect
   - Make app go directly to main screen on fresh install

### Sub-Agent D: Rebrand
**Scope**: Rename everything from Anikku to Relay

1. **Application identity**:
   - Update `app/build.gradle.kts`: change `applicationId` to your chosen package (e.g., `dev.relay.app` or `com.asier.relay`)
   - Update `app_name` string to "Relay"
   - Update `AndroidManifest.xml`: app label, authorities, provider names

2. **Update auto-update system**:
   - Find the update checker URL (likely points to `github.com/komikku-app/anikku/releases` or an API endpoint)
   - Change it to point to your fork's release URL (e.g., `github.com/YOUR_USER/relay/releases`)
   - Keep the auto-install mechanism intact
   - Simplify changelog to a single "whats_new" field from release body

3. **App icon**: 
   - Replace launcher icons in `app/src/main/res/mipmap-*` with a Relay icon
   - If no custom icon yet, use a placeholder distinct from Anikku's icon
   - Update adaptive icon configuration

4. **Splash screen / branding**:
   - Update any splash screen branding
   - Update About screen to say "Relay" with appropriate credits (Apache 2.0 requires attribution)

5. **Remove community/contribution references**:
   - Replace README.md with a simple Relay README
   - Delete CODE_OF_CONDUCT.md, CONTRIBUTING.md
   - Delete `.github/ISSUE_TEMPLATE/` directory
   - Delete `.github/FUNDING.yml`
   - Simplify `.github/` to just what you need (maybe a release workflow)

6. **Package naming**: 
   - Note: Full package rename (`eu.kanade.tachiyomi` → `dev.relay`) is a massive refactor.
   - **Recommendation**: Don't do this in Pass 1. Keep the internal package names as-is.
   - Only change user-visible branding and the applicationId.

### Post-merge: Integration & Build Fix
After all 4 sub-agents complete:

1. **Merge all changes** (sub-agents worked on separate file scopes, minimal conflicts expected)
2. **Fix compilation errors**: 
   - Missing imports from removed modules
   - String resource references to removed i18n modules
   - Dangling references to removed features
3. **Verify build**: `./gradlew assembleDebug` must succeed
4. **Smoke test**: Install on device, verify:
   - App launches with "Relay" branding
   - Library loads
   - Extension installation works
   - AniList/MAL tracking works
   - Player plays video
   - Downloads work
   - Local backup/restore works
   - Update checker points to your fork
5. **Commit and tag**: `relay-v0.0.1-stripped`

---

## Pass 2 — Source Fallback Chain
**Goal**: When a source fails, automatically try the next one.
**Agents**: 2 parallel sub-agents.

### Sub-Agent A: Source Health & Fallback Logic (Domain/Data Layer)

1. **Add SQLDelight schema** for source health tracking:
   ```sql
   -- New migration file (follow existing numbering)
   CREATE TABLE source_health (
     source_id TEXT NOT NULL PRIMARY KEY,
     last_check INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'unknown',
     avg_response_ms INTEGER NOT NULL DEFAULT 0,
     failure_count INTEGER NOT NULL DEFAULT 0,
     last_failure INTEGER NOT NULL DEFAULT 0
   );
   ```

2. **Create domain models**:
   - `relay.domain.source.model.SourceHealth` data class
   - `relay.domain.source.model.SourcePriority` data class (source_id + priority rank per anime)

3. **Create SourceHealthRepository** (data layer):
   - `recordSuccess(sourceId, responseTimeMs)`
   - `recordFailure(sourceId)`
   - `getHealth(sourceId): SourceHealth`
   - `getOrderedSources(animeId): List<Source>` — returns sources ordered by: user priority > health score > default

4. **Create SourceFallbackManager** (domain layer):
   - Takes a list of available sources for an episode
   - Tries them in priority order
   - On failure (timeout after configurable seconds, HTTP error, empty video list): 
     - Record failure in health DB
     - Advance to next source
     - Carry over current playback timestamp
   - Emits state: `Loading`, `Playing(source)`, `Falling back(nextSource)`, `AllFailed`

5. **Create per-anime source priority table**:
   ```sql
   CREATE TABLE anime_source_priority (
     anime_id INTEGER NOT NULL,
     source_id TEXT NOT NULL,
     priority INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (anime_id, source_id)
   );
   ```

### Sub-Agent B: Player Integration (Presentation Layer)

1. **Modify the player ViewModel** (likely `PlayerViewModel.kt` or similar):
   - Instead of receiving a single video URL, receive the `SourceFallbackManager`
   - On playback error or source timeout, trigger fallback
   - Preserve current timestamp across source switches
   - Show brief toast/snackbar: "Source failed, trying [next source name]..."

2. **Add fallback UI indicator**:
   - Small chip/badge in player showing current source name
   - Animate transition when falling back
   - On all-sources-failed: show error screen with "Retry" and "Change Source" options

3. **Add source priority UI** to anime detail screen:
   - In episode list or anime settings: "Source Priority" option
   - Drag-to-reorder list of available sources for this anime
   - Saves to `anime_source_priority` table

4. **Modify episode loading flow**:
   - Currently: user taps episode → fetch video list from current source → play
   - New: user taps episode → SourceFallbackManager gets ordered sources → tries first → plays or falls back

### Integration
- Wire Sub-Agent A's domain/data layer into Sub-Agent B's presentation layer
- Test: Install an extension, start playing, simulate source failure (e.g., toggle airplane mode briefly), verify fallback triggers
- **Commit and tag**: `relay-v0.1.0-fallback`

---

## Pass 3 — AniSkip Integration
**Goal**: Skip intros/outros/recaps using crowd-sourced timestamps.
**Agents**: 2 parallel sub-agents.

### Sub-Agent A: AniSkip API Client & Cache (Data Layer)

1. **Create AniSkip API client**:
   ```kotlin
   // data/aniskip/AniSkipApi.kt
   // Endpoint: https://api.aniskip.com/v2/skip-times/{malId}/{episodeNumber}
   // Query params: types[]=op&types[]=ed&types[]=recap&types[]=mixed-op&types[]=mixed-ed
   // Returns: { results: [{ interval: { startTime, endTime }, skipType, ... }] }
   ```
   - Uses existing OkHttp client
   - Parse response into domain models
   - No auth required

2. **Create SQLDelight cache table**:
   ```sql
   CREATE TABLE aniskip_cache (
     mal_id INTEGER NOT NULL,
     episode_number INTEGER NOT NULL,
     skip_type TEXT NOT NULL,
     start_time_ms INTEGER NOT NULL,
     end_time_ms INTEGER NOT NULL,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY (mal_id, episode_number, skip_type)
   );
   ```

3. **Create AniSkipRepository**:
   - `getSkipTimes(malId, episodeNumber): List<SkipSegment>` — cache-first, fetch if stale (>7 days)
   - `SkipSegment` data class: `type` (OP/ED/RECAP/MIXED), `startMs`, `endMs`

4. **Create per-show skip preference storage**:
   - Add to playback profiles table (created in Pass 4, but define the field now):
   - `skip_preference TEXT DEFAULT 'button'` — values: `auto`, `button`, `off`

### Sub-Agent B: Player UI for Skip Controls (Presentation Layer)

1. **Add skip button overlay to player**:
   - "Skip Intro" / "Skip Outro" / "Skip Recap" button
   - Appears when playback position enters a skip segment's time range
   - Auto-hides after segment ends or after 5 seconds of no interaction
   - Button positioned bottom-right (non-intrusive, Netflix-style)

2. **Implement auto-skip mode**:
   - When preference is `auto`: automatically seek past the segment when entering it
   - Show brief toast: "Skipped intro" (so user knows what happened)
   - First episode of a session: always show button (don't auto-skip OP on episode 1)

3. **Implement post-credits hold**:
   - If AniSkip data includes a segment after the ED, mark it as post-credits
   - When auto-advancing to next episode: if post-credits exists, pause auto-advance
   - Show: "Post-credits scene" indicator with "Skip" and "Watch" options

4. **Add skip preference toggle**:
   - In player settings (gear icon during playback): "Skip Behavior" → Auto / Button / Off
   - Per-show override in anime detail screen settings

### Integration
- Wire API client → repository → player ViewModel → UI
- AniSkip requires MAL ID — use the existing tracker mapping (anime → MAL tracker entry → MAL ID)
- If no MAL tracker is linked, AniSkip features are silently unavailable (no error, just no skip buttons)
- **Commit and tag**: `relay-v0.1.1-aniskip`

---

## Pass 4 — Audio Normalization & Playback Profiles
**Goal**: Per-show settings and audio compression.
**Agents**: 2 parallel sub-agents.

### Sub-Agent A: Playback Profiles (Domain/Data/Settings)

1. **Create SQLDelight table**:
   ```sql
   CREATE TABLE playback_profile (
     anime_id INTEGER NOT NULL PRIMARY KEY,
     preferred_source TEXT,
     audio_track TEXT,
     subtitle_track TEXT,
     subtitle_style TEXT,       -- JSON: {font, size, color, outline, opacity}
     playback_speed REAL NOT NULL DEFAULT 1.0,
     skip_preference TEXT NOT NULL DEFAULT 'button',
     audio_normalize INTEGER NOT NULL DEFAULT 0,
     normalize_strength REAL NOT NULL DEFAULT 0.5,
     brightness_offset REAL NOT NULL DEFAULT 0.0,
     updated_at INTEGER NOT NULL DEFAULT 0
   );
   ```

2. **Create domain model & repository**:
   - `PlaybackProfile` data class
   - `PlaybackProfileRepository`: get, upsert, delete
   - `GetPlaybackProfileUseCase(animeId)`: returns profile or defaults

3. **Auto-populate on first watch**:
   - After user selects audio/subtitle track for the first time, save to profile
   - On subsequent plays of same anime, apply profile settings before playback starts

4. **Integrate with source fallback**:
   - `preferred_source` in profile feeds into `SourceFallbackManager` ordering

### Sub-Agent B: Audio Normalization (Player/mpv Integration)

1. **Add mpv audio filter commands**:
   - Normalization via: `mpv.command("af", "set", "dynaudnorm=f=250:g=31:p=0.95")`
   - Compression via: `mpv.command("af", "set", "acompressor=ratio=${ratio}:attack=20:release=250")`
   - Off: `mpv.command("af", "set", "")`
   - Map "Normalize Strength" slider (0.0–1.0) to compressor ratio (1:1 to 8:1)

2. **Add player UI toggle**:
   - Audio normalization icon/button in player controls
   - Tap to cycle: Off → Light → Strong (or a slider in settings panel)
   - Visual indicator when active

3. **Night mode composite toggle**:
   - New "Night Mode" button in player (moon icon)
   - When activated:
     - Audio normalization → Strong preset
     - Brightness → Reduced below system minimum (overlay dimming)
     - Optional: warm color shift via mpv video filter `vf=eq=gamma=0.9`
   - All states saved to current anime's playback profile

4. **Persist settings**:
   - On any change, write to playback profile via repository
   - On player launch, read profile and apply all mpv commands before playback starts

### Integration
- Test with a show known for extreme dynamic range (e.g., any action anime)
- Verify normalization persists across episodes of the same show
- Verify different shows have independent profiles
- **Commit and tag**: `relay-v0.2.0-profiles`

---

## Pass 5 — Filler Marking & Smart Completion
**Goal**: Mark filler episodes, improve completion detection.
**Agents**: 2 parallel sub-agents.

### Sub-Agent A: Filler Marking (Data + UI)

1. **Create Jikan API client**:
   ```kotlin
   // Endpoint: https://api.jikan.moe/v4/anime/{malId}/episodes?page={page}
   // Returns: { data: [{ mal_id, title, filler, recap, ... }] }
   // Note: 3 req/sec rate limit — implement rate limiter
   ```

2. **Create cache table**:
   ```sql
   CREATE TABLE filler_cache (
     mal_id INTEGER NOT NULL,
     episode_number INTEGER NOT NULL,
     episode_type TEXT NOT NULL DEFAULT 'canon',  -- canon, filler, mixed, recap
     title TEXT,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY (mal_id, episode_number)
   );
   ```

3. **Create FillerRepository**: cache-first, paginated fetch

4. **Add filler indicators to episode list UI**:
   - Color-coded dot or badge: green (canon), orange (mixed), red (filler), gray (recap)
   - Optional: "Hide Filler" toggle in episode list header
   - When hidden, filler episodes collapse with a "X filler episodes hidden" indicator

5. **Auto-skip filler option**:
   - On episode completion, if next episode is filler and user has "skip filler" enabled:
     - Skip to next canon episode automatically
     - Show toast: "Skipped X filler episodes"

### Sub-Agent B: Smart Episode Completion

1. **Modify episode completion logic** (find existing threshold check):
   - Current: "if watched >= X%, mark complete"
   - New priority chain:
     1. If AniSkip ED data exists AND position >= ED start → mark complete
     2. If position >= (duration - 90 seconds) → mark complete
     3. Fallback: existing percentage threshold

2. **Post-credits awareness**:
   - If AniSkip indicates post-credits content after ED:
     - Don't auto-advance when ED starts
     - Show subtle indicator: "Post-credits scene ahead"
     - Auto-advance only after post-credits segment ends (or user skips)

3. **Next episode transition card**:
   - On episode completion, show brief card (2-3 seconds):
     - Next episode number + title
     - Filler/canon indicator
     - Countdown to auto-play (configurable: 3s, 5s, 10s, disabled)
     - "Play Now" / "Stop" buttons
   - If next episode is filler and "skip filler" is off, show filler badge prominently

### Integration
- Test with a long-running show (One Piece, Naruto) to verify filler marking
- Verify smart completion triggers at the right moments
- **Commit and tag**: `relay-v0.2.1-filler`

---

## Pass 6 — Bookmarks, Clips & Screenshots
**Goal**: Capture moments during playback with subtitle control.
**Agents**: 2 parallel sub-agents.

### Sub-Agent A: Capture Engine (Data + FFmpeg)

1. **Screenshot capture via mpv**:
   ```kotlin
   // With subtitles (composited frame):
   mpv.command("screenshot", "subtitles")
   // Without subtitles (raw video frame):
   mpv.command("screenshot", "video") 
   // Output path configured via: mpv.setOption("screenshot-directory", path)
   // Format: mpv.setOption("screenshot-format", "png")
   ```

2. **Clip extraction via FFmpeg Kit**:
   ```kotlin
   // Fast copy (no re-encode, no subtitle control):
   "-ss ${startSec} -to ${endSec} -i ${sourcePath} -c copy ${outputPath}"
   
   // Without subtitles (re-encode, strip sub streams):
   "-ss ${startSec} -to ${endSec} -i ${sourcePath} -sn -c:v libx264 -preset fast -c:a aac ${outputPath}"
   
   // Burn-in subtitles (re-encode with subtitle overlay):
   "-ss ${startSec} -to ${endSec} -i ${sourcePath} -vf subtitles=${subPath} -c:v libx264 -preset fast -c:a aac ${outputPath}"
   ```

3. **Create bookmark/capture DB table**:
   ```sql
   CREATE TABLE session_bookmark (
     id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
     anime_id INTEGER NOT NULL,
     episode_number INTEGER NOT NULL,
     timestamp_ms INTEGER NOT NULL,
     note TEXT,
     type TEXT NOT NULL DEFAULT 'bookmark',  -- bookmark, screenshot, clip
     media_path TEXT,
     include_subtitles INTEGER NOT NULL DEFAULT 1,
     clip_start_ms INTEGER,
     clip_end_ms INTEGER,
     created_at INTEGER NOT NULL,
     FOREIGN KEY (anime_id) REFERENCES animes(_id)
   );
   ```

4. **Create BookmarkRepository**: CRUD + queries by anime, by type
5. **Share integration**: Use Android's ShareSheet to share screenshots/clips

### Sub-Agent B: Capture UI (Player Integration)

1. **Screenshot button in player**:
   - Add camera icon to player controls bar
   - Tap: immediate screenshot (with subs by default)
   - Long-press: show option "With Subtitles" / "Without Subtitles"
   - Brief flash animation on capture
   - Toast: "Screenshot saved" with thumbnail preview

2. **Clip marking mode**:
   - Activate via player menu or long-press on timeline
   - "Mark In" button sets clip start time (shown as marker on progress bar)
   - "Mark Out" button sets clip end time
   - On both set: show dialog:
     - Preview of clip duration
     - Subtitle options: Include / Exclude / Burn-in
     - Quality: Fast (copy) / High (re-encode)
     - Note field (optional)
     - "Save Clip" / "Cancel"
   - Processing happens in background (notification with progress for re-encode)

3. **Bookmarks list in anime detail screen**:
   - New tab or section: "Bookmarks"
   - Grid/list of screenshots, clips, and timestamp bookmarks
   - Tap screenshot: full-screen view with share button
   - Tap clip: play in mini-player with share button
   - Tap bookmark: jump to that episode at that timestamp
   - Swipe to delete

4. **Quick bookmark** (timestamp only):
   - Double-tap bookmark button (or dedicated gesture): save timestamp + auto-note with episode info
   - No media capture, just a marker to return to

### Integration
- Test screenshot with/without subtitles — verify mpv `screenshot` command variants work on Android
- Test clip extraction — verify FFmpeg Kit can access the video source (may need to work with cached/downloaded files vs streaming URLs)
- For streaming sources: clips may only work with downloaded episodes (document this limitation)
- **Commit and tag**: `relay-v0.3.0-captures`

---

## Pass 7 — Binge Mode & Gesture Customization
**Goal**: Final quality-of-life features.
**Agents**: 2 parallel sub-agents.

### Sub-Agent A: Binge Session Mode

1. **BingeSessionManager** (domain):
   - State: active/inactive, episode count, elapsed time, break reminders
   - On activate: set flags for auto-skip, short transitions, wake lock, DND
   - On deactivate (explicit or app background): restore all settings

2. **Auto-skip integration with AniSkip**:
   - In binge mode: override skip preference to `auto` for OP (after first episode)
   - Keep ED behavior as-is (user might want to hear the ending)

3. **Session timer**:
   - Track elapsed watch time (exclude pauses)
   - Configurable reminder interval (default: every 2 hours)
   - Gentle non-intrusive notification: "You've been watching for 2 hours. Take a stretch break?"
   - "Dismiss" / "Remind in 30 min" / "End Session"

4. **UI toggle**:
   - Binge mode icon in player controls (flame/infinity icon)
   - Tap to activate with brief explainer on first use
   - Active indicator (subtle persistent icon in player)

### Sub-Agent B: Gesture Customization

1. **Create gesture configuration** (data/preferences):
   ```kotlin
   data class GestureConfig(
     val doubleTapLeftAction: GestureAction = GestureAction.SeekBack(10_000),
     val doubleTapRightAction: GestureAction = GestureAction.SeekForward(10_000),
     val swipeLeftVertical: GestureAction = GestureAction.Brightness,
     val swipeRightVertical: GestureAction = GestureAction.Volume,
     val longPressAction: GestureAction = GestureAction.SpeedBoost(2.0f),
     val leftHandedMode: Boolean = false,
   )
   
   sealed class GestureAction {
     data class SeekForward(val ms: Long) : GestureAction()
     data class SeekBack(val ms: Long) : GestureAction()
     object Brightness : GestureAction()
     object Volume : GestureAction()
     data class SpeedBoost(val speed: Float) : GestureAction()
     object Screenshot : GestureAction()
     object Bookmark : GestureAction()
   }
   ```

2. **Replace hardcoded gesture handling in player**:
   - Find existing gesture handling (likely in player Activity or a GestureDetector)
   - Replace hardcoded seek/brightness/volume with configurable dispatch
   - Left-handed mode: mirror all left/right zones

3. **Gesture settings UI**:
   - In player settings: "Gestures" section
   - For each gesture zone: dropdown of available actions
   - Double-tap seek duration: slider (5s / 10s / 15s / 30s)
   - Long-press behavior: dropdown (speed boost / screenshot / bookmark)
   - Left-handed mode toggle

### Integration
- Test binge mode across multiple episodes — verify auto-skip triggers correctly, timer works
- Test gesture customization — verify all combinations work
- **Commit and tag**: `relay-v0.3.1-final`

---

## Execution Notes for Agents

### Sub-Agent Coordination Rules

1. **File scope isolation**: Each sub-agent within a pass should touch different files. The coordinator assigns explicit file paths based on Pass 0 maps. If two agents need the same file, one agent does the edit and the other declares a dependency.

2. **Shared interface contracts**: When agents in the same pass need to integrate (e.g., data layer ↔ presentation), the coordinator defines Kotlin interface signatures before agents start. Each agent codes to the interface.

3. **Compilation checkpoints**: After each pass, run `./gradlew assembleDebug`. Fix all errors before proceeding. This is a hard gate.

4. **When stuck on a file path**: If a file referenced in the Pass 0 maps doesn't exist at the expected location, search for it by class name or feature keyword. The Anikku codebase inherits naming from Tachiyomi/Aniyomi/Komikku, so things may be in unexpected places.

### Testing Checklist Per Pass

```
[ ] App compiles: ./gradlew assembleDebug
[ ] App installs on Android 16 device
[ ] App launches without crash
[ ] Library loads existing data (if upgrading from Anikku backup)
[ ] Extension install works
[ ] Video playback works (at least one source)
[ ] AniList login + sync works
[ ] MAL login + sync works  
[ ] Downloads work
[ ] Local backup works
[ ] Auto-update checker works (after Pass 1)
[ ] [Pass-specific features work]
```
