---
created_at: 2026-02-22T04:35
updated_at: 2026-02-22T04:37
---
# Relay — Anikku Fork Spec
### A lean, two-person anime watching app

---

## Identity

**Name**: Relay  
**Base**: Anikku (komikku-app/anikku)  
**Users**: You + one friend  
**Philosophy**: Content relayed through whatever path works. Reliable playback, zero friction, no community overhead.

---

## What Gets Cut

### Removed

| Module / Feature | Notes |
|-----------------|-------|
| **i18n-ank, i18n-kmk, i18n-sy, i18n** | All four localization modules. English only. |
| **`.weblate` config** | Translation infrastructure gone with i18n. |
| **`flagkit`** | Language flag icons. No longer needed. |
| **Trackers: Kitsu, Shikimori, Bangumi, Simkl** | Keep AniList + MAL only. These two feed all API-driven features. |
| **`telemetry/` module** | Firebase analytics / crash reporting. Remove Google Services dependency. |
| **NSFW / Lewd filter** | Two users, full trust, no filtering needed. |
| **Onboarding / getting started** | You know how the app works. |
| **`macrobenchmark/` module** | CI performance benchmarking harness. |
| **`preview` + `benchmark` build variants** | Keep `debug` + `release` only. Collapse `standard`/`dev` flavors into one. |
| **Community files** | CODE_OF_CONDUCT.md, CONTRIBUTING.md, issue templates → replace with simple README. |
| **SyncYomi integration** | No sync server to run. |
| **Google Drive sync** | Replaced by simple local backup/restore. |
| **Discord Rich Presence** | Removes background service + Discord SDK dependency. |
| **Android TV / Fire TV support** | Removes leanback library, D-pad navigation paths, separate input handling. |
| **Feed tab** | Discovery-oriented. Not the focus. |
| **Panorama / wide cover display** | Niche visual feature. |
| **Edit Anime Info manually** | Tracker sync handles metadata. |
| **Custom theme color palettes** | Cosmetic settings surface. Keep the default theming, lose the palette picker. |

### Kept (was on the fence)

| Feature | Why it stays |
|---------|-------------|
| **Auto-update system** | Your friend shouldn't have to go to GitHub. Push releases, they auto-install. Modify to point at your fork's release repo. |
| **Dynamic cover-based theming** | Looks nice, low maintenance burden, doesn't touch critical paths. |
| **Torrent support** | Good fallback when streaming sources fail. |

### Untouched Core

- Extension system (entire content pipeline)
- mpvKt player (core watching experience — improved, not replaced)
- AniList + MAL trackers (API keys for everything)
- Download system (improved, see below)
- Source migration
- Merge anime
- Library categories / organization

---

## What Gets Built

### Tier 1 — Reliable Playback (v0.1)

#### Source Fallback Chain
When a source fails, the user shouldn't have to manually hunt for another one.

- Priority-ordered source list per show (configurable, stored locally)
- Global default source priority as fallback
- On failure (timeout, no videos, mid-stream death): automatically try next source at same timestamp
- Lightweight health probes on sources (cached, background refresh)
- Dead sources deprioritized automatically
- UI indicator showing which source is active + fallback status
- All local logic, no external dependencies

#### AniSkip Integration
Crowd-sourced timestamps for intros, outros, recaps, post-credits scenes.

- Query `api.aniskip.com` by MAL ID + episode number (already have MAL ID from tracker sync)
- Player overlay: "Skip Intro" / "Skip Outro" button at correct timestamps
- Per-show skip preference: Always Skip / Never Skip / Button Only (stored in playback profile)
- Post-credits detection: hold before auto-advancing, show indicator
- Recap segment marking (for long-running shows)
- Local timestamp cache after first fetch per episode
- Graceful fallback when AniSkip has no data (no UI clutter, just normal playback)

#### Audio Normalization
Anime has notoriously extreme dynamic range — whisper dialogue into explosion effects.

- Toggle in player UI: "Normalize Audio" 
- Implementation via mpv's audio filter pipeline:
  - `af=dynaudnorm` for dynamic range normalization (smooths volume across the episode)
  - Alternative: `af=acompressor` for more aggressive compression (better for night listening)
- Expose a simple slider: "Compression Strength" (maps to compressor ratio)
- Per-show preference in playback profile (some shows need it more than others)
- Night mode preset activates this automatically with aggressive settings

### Tier 2 — Smart Watching (v0.2)

#### Per-Show Playback Profiles
One new DB table keyed on anime ID. Stores:

| Field | Purpose |
|-------|---------|
| `preferred_source` | Try this source first (feeds fallback chain) |
| `audio_track` | Sub vs dub preference |
| `subtitle_track` | Which subtitle stream to select |
| `subtitle_style` | Font, size, color, outline, opacity overrides |
| `playback_speed` | Per-show speed (some people watch SoL at 1.25x) |
| `skip_preference` | AniSkip behavior: auto/button/off |
| `audio_normalization` | On/off + compression level |
| `brightness_offset` | For dark shows vs bright shows |

Auto-populated on first watch, user can override. Switching between shows = zero manual adjustment.

#### Filler Episode Marking
Jikan API (`api.jikan.moe`) exposes filler flags on MAL episode data.

- Query by MAL ID → get episode list with canon/filler/mixed flags
- Color-coded indicators in episode list (e.g., subtle badge or background tint)
- Option to collapse filler arcs in the episode list
- Option to auto-skip to next canon episode on completion
- Cache filler data locally per show (changes rarely)
- Most valuable for long-running shows (One Piece, Naruto, Bleach, Black Clover)

#### Smart Episode Completion
Replace the simple "watched X% = complete" threshold:

- If current position is within AniSkip's ED timestamp range → mark complete
- If within 90 seconds of end (fallback when no AniSkip data) → mark complete  
- If post-credits scene detected → delay auto-advance, show "Post-credits scene" indicator
- Configurable threshold as fallback
- Next episode auto-queued with brief transition card (title + thumbnail)

#### Night / Bed Mode
Single toggle combining:

- Overlay dimming (brightness below system minimum via screen overlay)
- Warm color temperature shift (mpv `vf=eq` or color matrix adjustment)
- Audio normalization cranked to aggressive preset
- Reduced UI brightness / contrast
- Ideal state: one tap, immediately comfortable for 2 AM headphone watching

### Tier 3 — Capture & Polish (v0.3)

#### Session Bookmarks with Clips & Screenshots
This is where bookmarks become genuinely useful rather than just "save a timestamp."

**Screenshot capture:**
- Tap to capture current frame at full resolution
- Option to capture with or without subtitle overlay
  - "Without subs": capture the raw video frame from mpv's video output before subtitle rendering
  - "With subs": capture the composited frame including subtitle overlay
- Saved to app storage with metadata (show, episode, timestamp, optional note)
- Share sheet integration for sending to friend / social media

**Clip capture:**
- Mark in-point and out-point in the player (gesture or button)
- Generate short video clip from the segment
  - Implementation: `ffmpeg` (already bundled as FFmpeg Kit dependency in Anikku) 
  - Extract segment: `ffmpeg -ss [start] -to [end] -i [source] -c copy clip.mp4`
  - For subtitle removal: re-encode without subtitle stream
  - For subtitle burn-in: use ffmpeg's subtitle filter to bake them in
- Option: include subtitles / exclude subtitles / burn-in subtitles
- Configurable output quality (quick/low vs slow/high)
- Share sheet integration
- Saved clips browsable from a "Clips" section in the anime's detail page

**Technical approach:**
- mpv exposes the current video frame via `screenshot` command (raw or with subs via `screenshot-format` and `sub-visibility`)
- For clips, use FFmpeg Kit which is already a dependency:
  - Subtitle-free: `-sn` flag strips subtitle streams
  - Subtitle burn-in: `-vf subtitles=` filter
  - Copy mode (`-c copy`) for fast extraction when no re-encode needed
- Store metadata in SQLDelight alongside anime entries
- Gallery view for all bookmarks/clips per show

#### Binge Session Mode
Composite toggle:

- Auto-skip intros after first episode (via AniSkip)
- Reduced inter-episode transition (shorter countdown or immediate advance)
- Notification suppression (DND mode)
- Screen wake lock
- Optional session timer with gentle break nudges ("2 hours — stretch?")
- Exits cleanly when toggled off or on app backgrounding

#### Subtitle Rendering Controls
mpv has excellent subtitle support; surface it better in the UI:

- In-player controls for: font, size, color, outline thickness, background opacity, vertical position
- Per-show style memory (part of playback profile)
- ASS/SSA styling preservation toggle (for fansubs with positioned/styled subs)
- Quick presets: "Default", "Large + High Contrast", "Minimal"

#### Gesture Customization
- Configurable double-tap skip duration (5s, 10s, 30s per side)
- Remappable swipe zones (brightness, volume, seek)
- Left-handed mode (mirror all gesture zones)
- Long-press behaviors (speed boost, screenshot, etc.)

#### Download Hardening
- Integrity check after download (file size validation, basic format probe via ffmpeg)
- Graceful fallback on corrupt files (offer re-download or stream)
- Better format handling for edge cases
- Download queue that survives app restarts
- Storage usage indicators per show

---

## Architecture Notes

### Update System (Modified)
Keep Anikku's auto-update mechanism but retarget:
- Point release checker at your fork's GitHub releases (or a simple static JSON endpoint)
- Keep auto-install flow for your friend's convenience
- Strip changelog display complexity — a simple "what's new" string in the release JSON is enough

### Database Schema Additions
New tables/columns for Relay-specific features:

```
playback_profiles (
  anime_id          INTEGER PRIMARY KEY,
  preferred_source  TEXT,
  audio_track       TEXT,       -- "sub" | "dub" | specific track ID
  subtitle_track    TEXT,
  subtitle_style    TEXT,       -- JSON blob for style overrides
  playback_speed    REAL DEFAULT 1.0,
  skip_preference   TEXT DEFAULT 'button',  -- "auto" | "button" | "off"
  audio_normalize   INTEGER DEFAULT 0,
  normalize_level   REAL DEFAULT 0.5,
  brightness_offset REAL DEFAULT 0.0
)

session_bookmarks (
  id                INTEGER PRIMARY KEY,
  anime_id          INTEGER,
  episode_number    INTEGER,
  timestamp_ms      INTEGER,
  note              TEXT,
  type              TEXT,       -- "bookmark" | "screenshot" | "clip"
  media_path        TEXT,       -- path to screenshot/clip file
  has_subtitles     INTEGER,    -- whether capture includes subs
  created_at        INTEGER
)

source_health (
  source_id         TEXT PRIMARY KEY,
  last_check        INTEGER,
  status            TEXT,       -- "healthy" | "degraded" | "dead"
  avg_response_ms   INTEGER,
  failure_count     INTEGER
)

aniskip_cache (
  mal_id            INTEGER,
  episode_number    INTEGER,
  op_start_ms       INTEGER,
  op_end_ms         INTEGER,
  ed_start_ms       INTEGER,
  ed_end_ms         INTEGER,
  recap_end_ms      INTEGER,
  post_credits_start INTEGER,
  fetched_at        INTEGER,
  PRIMARY KEY (mal_id, episode_number)
)

filler_cache (
  mal_id            INTEGER,
  episode_number    INTEGER,
  type              TEXT,       -- "canon" | "filler" | "mixed"
  fetched_at        INTEGER,
  PRIMARY KEY (mal_id, episode_number)
)
```

### API Dependencies

| API | Used For | Auth Required | Rate Limits |
|-----|----------|---------------|-------------|
| `api.aniskip.com` | Intro/outro/recap timestamps | No | Reasonable, cache aggressively |
| `api.jikan.moe` | Filler episode data, episode metadata | No | 3 req/sec, 60 req/min |
| AniList GraphQL | Tracker sync, recommendations, character data | OAuth (existing) | 90 req/min |
| MAL API | Tracker sync, MAL ID resolution | OAuth (existing) | Varies |

### Minimum Android Version
Consider bumping from Android 8.0 to **Android 10 (API 29)** or higher:
- Scoped storage is native (fewer permission workarounds)
- Better PiP APIs
- Dark theme system support
- Removes compatibility shims for older devices
- You and your friend are almost certainly on modern phones

---

## Roadmap

| Version | Focus | Key Deliverables |
|---------|-------|-----------------|
| **v0.1** | Strip + Reliability | Remove all cut features. Source fallback chain. AniSkip integration. Audio normalization. Retarget update system. |
| **v0.2** | Smart Watching | Per-show playback profiles. Filler marking. Smart episode completion. Night mode. |
| **v0.3** | Capture + Polish | Screenshot/clip bookmarks (with subtitle toggle). Binge mode. Subtitle controls. Gesture customization. Download hardening. |
