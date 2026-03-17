# Relay Web — UI/UX Specification
### Version 0.2 Design Overhaul

---

## 1. Design Direction

### 1.1 Current State Summary

Relay Web has four primary screens (Discover, Library, History/Updates, Watch) plus detail pages, settings, and provider management. The current UI uses a consistent dark theme with bordered card containers, a fixed left sidebar, and a teal/mint accent color. The foundation is functional but visually flat — every element has equal weight, there's no typographic hierarchy, and the watching experience (the core interaction) has less context than the administrative pages.

### 1.2 Design Principles for Relay Web

These are derived from the Lattice philosophy, adapted for web:

**The player is the product.** Every design decision should make the path from "I want to watch something" to "I'm watching it" shorter. Admin surfaces (providers, settings) exist to support this, not compete with it.

**Show, don't organize.** Cover art, progress bars, and visual state indicators communicate faster than labels and lists. Lean on the rich visual content (anime covers, episode thumbnails) that providers give you.

**Transparency without obstruction.** Provider health, source status, and system state are valuable — but they should be available on demand, not blocking the primary content. Developer-facing data belongs behind progressive disclosure.

**Two users, zero onboarding.** No tooltips, no tutorials, no "Notes" boxes. You and Mikel know how this works. The UI should be self-evident through layout and interaction patterns.

### 1.3 Visual Language

**Color palette:**
- Background: current dark base is good. Keep the layered dark grays (e.g., `#0d1117`, `#161b22`, `#21262d`) for depth.
- Accent: keep the teal/mint (`~#4ecdc4`) for primary actions and active states.
- Secondary accent: introduce a warm amber (`~#f0a500`) for warnings, provider errors, and filler episode markers.
- Progress/watched: use accent teal for progress bars and completion indicators.
- Destructive: muted red (`~#e05252`) for errors and failed providers.
- Text: white for primary, `rgba(255,255,255,0.6)` for secondary, `rgba(255,255,255,0.35)` for tertiary/metadata.

**Typography hierarchy** (use a system like this consistently):
- Page title: 28–32px, bold (e.g., anime title on detail page)
- Section header: 18–20px, semibold (e.g., "Episodes")
- Body / episode title: 14–15px, regular
- Metadata / timestamps / badges: 12–13px, regular or medium
- Use a clean sans-serif: the current font appears to be system defaults. Consider explicitly setting `Inter`, `DM Sans`, or `Figtree` for consistency across platforms.

**Card usage rules:**
- Cards (bordered containers) are for **repeated items**: episode rows, search result cards, provider status rows.
- Cards are NOT for wrapping primary content (the player, the anime header, the search bar). Primary content should breathe directly on the page background.
- Remove the outer card wrapper from the Watch page content and the Discover page header.

**Spacing system:**
- Use a consistent spacing scale: 4, 8, 12, 16, 24, 32, 48px.
- Current spacing feels arbitrary — some gaps are too large (between provider response cards), others too tight (episode list inner padding).

---

## 2. Global Shell

### 2.1 Sidebar (Left Navigation)

**Current state:** Fixed left sidebar with "Relay" branding, subtitle, nav links (Discover, Library, History, Updates, Settings, Providers), and a "Notes" box at the bottom.

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Brand | "Relay" + subtitle paragraph | "Relay" wordmark only. Remove "Web-first self-hosted library and playback" — unnecessary for two users. |
| Active state | None — no link appears selected | Active page gets: left accent border (3px teal), slightly brighter text, subtle background highlight (`rgba(255,255,255,0.05)`) |
| Notes box | Static developer note in a bordered card | **Remove entirely.** This is documentation, not UI. |
| Grouping | Flat list of 6 links | Group into two sections: **Primary** (Discover, Library, History) — separated by subtle divider — **System** (Settings, Providers). "Updates" can merge into Library as a tab or filter, not a separate page. |
| Collapse | Always expanded | On narrower viewports (< 1200px), sidebar collapses to icons only with tooltips on hover. On mobile widths (< 768px), sidebar becomes a bottom tab bar or hamburger drawer. |
| User badge | "Axor" + "Logout" buttons in the top header bar | Move user identity into sidebar bottom: small avatar/initial circle + username. Logout moves to Settings. Remove the top-right header buttons. |

**Revised sidebar structure:**
```
[Relay wordmark]

● Discover
● Library  
● History

─────────

  Settings
  Providers

─────────
  
  [A] Axor
```

### 2.2 Top Header Bar

**Current state:** "Relay Web" title + subtitle + Axor/Logout buttons. Takes ~80px of vertical space on every page.

**Changes:**
- **Remove the global header bar entirely.** The sidebar already identifies the app. The "Relay Web / Account-backed catalog..." description is unnecessary.
- Each page gets its own contextual header within the content area (e.g., the Discover page shows a search bar at the top, the Watch page shows the anime title).
- This reclaims ~80px of vertical space on every page, which matters significantly for the Watch page.

---

## 3. Discover Page

### 3.1 Current State

The page has: a section header ("Discover"), a subtitle ("Search enabled providers..."), a search input + button, a status warning ("Partial results returned..."), a "Provider responses" section with per-provider cards showing name/slug/status/response time/result count, and finally a grid of anime result cards.

### 3.2 Problems

1. The provider response table dominates the page and pushes actual results below the fold.
2. The search bar is wrapped in a card — unnecessary container.
3. The status warning ("Partial results returned") and the provider detail table are two separate elements conveying related information.
4. The subtitle "Search enabled providers and move titles straight into your library" is instructional text that two experienced users don't need.

### 3.3 Changes

**Layout — top to bottom:**

```
[Search input ─────────────────────── 🔍]
[Provider status bar: compact, collapsible]

[Results grid: 4-column card layout]
```

**Search bar:**
- Remove the enclosing card. The search input sits directly on the page background.
- Full-width input with integrated search icon (or Enter-to-search). Remove the separate "Search" button — Enter key triggers search, or make the button subtle/inline.
- Placeholder text: "Search across providers..." (replaces the subtitle).
- On submit: show a subtle loading state (skeleton cards in the results grid, or a thin progress bar under the search input).

**Provider status bar (replaces current Provider responses section):**
- Default state: a single compact line below the search bar.
  - When all providers succeed: `✓ 5 providers · 18 results · 1.4s avg`
  - When some fail: `⚠ 3 of 5 providers · 2 timed out · 12 results` (amber warning color)
  - When search is in progress: `Searching 5 providers...` with a subtle animation
- Expandable: click/tap the status bar to reveal the per-provider detail rows (current Provider responses UI, but more compact).
- Per-provider rows in the expanded view:
  - Healthy: name + result count + response time (teal dot)
  - Error: name + error message + response time (red dot)
  - Remove the "slug · type ·" metadata — that's developer info, not user info.
  - Layout: single row per provider, not a card. Just a line with dots/badges.

**Results grid:**
- Keep the current 4-column card layout — this is already the strongest part of the UI.
- De-duplicate results across providers: if "No Game, No Life" appears from Aniwave, AnimePahe, and AnimeOnsen, show it once with a small "3 sources" badge rather than three separate cards. When the user clicks, they can choose a source on the detail page.
  - If de-duplication is complex, defer this. But flag duplicates visually (e.g., dim subsequent duplicates with "Also on AnimePahe, AnimeOnsen").
- Add hover state to cards: subtle scale-up (1.02) + shadow increase + show a truncated synopsis tooltip or preview.
- "No synopsis." text: replace with nothing. An empty state is less distracting than "No synopsis." repeated across every card.

**Result cards — per-card improvements:**
- Current: cover art + title + source badge + type badge + optional year.
- Keep this structure, but:
  - If the result is already in the user's library, show a small "In Library" indicator (checkmark or badge) on the cover art corner.
  - Replace "No synopsis." with the year if available, or nothing.
  - Source badge: keep, this is useful.

---

## 4. Anime Detail Page

### 4.1 Current State

A card containing: cover art (left), title + synopsis + source badge + year + a massive tag cloud + "Add To Library" button. Below it, a separate card with an episode list: numbered episodes with "Duration unknown" and a "Watch" button per row.

### 4.2 Problems

1. The tag cloud shows 30+ tags with equal visual weight — it overwhelms the page.
2. "Add To Library" is below the tag cloud, below the fold.
3. The episode list rows are tall (~80px) with minimal content.
4. No episode watch state (unwatched / in-progress / watched).
5. No current-episode indicator.
6. "Duration unknown" repeated on every row is noise.
7. The synopsis is truncated but there's no way to expand it.

### 4.3 Changes

**Header section (replaces top card):**

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  [Cover]   No Game, No Life          [▶ Resume Ep 3] │
│  [Art  ]   2014 · 12 episodes · ongoing              │
│  [Image]   Aniwave                                   │
│            Action · Comedy · Fantasy  [+2 more]      │
│                                                      │
│            Sixteen sentient races inhabit Disboard,   │
│            a world overseen by Tet... [Show more]    │
│                                                      │
│            [♡ In Library]  [⋮ More]                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Specific changes:
- **Title**: 28–32px, bold. This is the largest text on the page.
- **Metadata row**: year · episode count · status. Single line, secondary text color. This gives immediate context.
- **Source badge**: keep as a small pill badge, but de-emphasize (it's metadata, not primary info).
- **Tags**: show only the first 3–5 most relevant genre tags as small pills. If more exist, show "+N more" that expands inline.
- **Synopsis**: show first 2–3 lines. "Show more" link expands to full text. No "..." truncation without an expansion mechanism.
- **Primary action button**: "Resume Ep 3" (or "Watch Ep 1" for unwatched shows). Teal, prominent, top-right. This is the single most important action on this page. It should be visible without scrolling on any viewport.
- **"Add To Library"** / **"In Library"**: secondary button near the primary action. Toggle state — if already in library, show as a filled heart/bookmark icon with "In Library" label.
- **More menu (⋮)**: Contains: Remove from Library, Change Source, Edit, etc.

**Episode list section:**

The episode list is where the user spends real time deciding what to watch next. It needs to communicate state efficiently.

**Episode row layout (compact — ~48px height):**
```
[●] 3   Episode 3                          24:00    [▶]
         Title of the Episode if Known
```

- **Watch state indicator (left dot/icon)**:
  - `○` empty circle: unwatched
  - `◐` half-circle or teal progress bar: in-progress (show % as a thin bar under the episode number)
  - `●` filled teal circle or checkmark: watched
- **Episode number**: bold, fixed-width column.
- **Episode title**: if the provider supplies a title, show it as secondary text under the episode number. If not, omit the line entirely (don't show "Episode N" — the number already conveys that).
- **Duration**: show if known. If unknown, show nothing (not "Duration unknown").
- **Watch button**: small play icon (▶), not a full "Watch" text button. Saves horizontal space.
- **Current episode highlight**: if the user has progress on an episode, highlight that row with a subtle left-border accent (teal) and slightly lighter background. This is the "you are here" indicator.

**Episode list header:**
```
Episodes (12)                          [Newest first ▾]
```
- Show total count.
- Sort toggle: "Newest first" / "Oldest first" (some shows are better watched in reverse for rewatchers).
- If filler data is available (future feature): add a "Hide filler" toggle here.

**Episode list behavior:**
- For shows with many episodes (50+), consider a virtualized/windowed list to maintain performance.
- If the user has watched episodes 1–5 and is partway through 6, the list should auto-scroll to episode 6 on page load.
- Clicking a row plays the episode. Clicking the ▶ button also plays. The entire row is a click target.

---

## 5. Watch Page

### 5.1 Current State

A card titled "Watch" with subtitle "Progress is saved every 15 seconds and on pause." Inside it, a video player with standard controls: play, volume, timestamp, 10-second skip forward/back, CC, settings, fullscreen.

There is no indication of what show is playing, which episode, what's next, or how to navigate to other episodes.

### 5.2 Problems

1. Zero context about what's playing.
2. No episode navigation without going back to the detail page.
3. The "Watch" heading and progress note waste vertical space on obvious information.
4. The player is wrapped in a card — adds visual border/padding that reduces the player's size.
5. Player controls are split: play/volume/time on the left, skip/CC/settings/fullscreen on the right, with a huge gap in between on wide screens.
6. No keyboard shortcuts visible or documented.

### 5.3 Changes

**Overall layout — the Watch page becomes two zones:**

```
┌────────────────────────────────────────┬──────────────┐
│ ◄ No Game, No Life · Episode 3         │              │
├────────────────────────────────────────┤              │
│                                        │  Episodes    │
│                                        │              │
│           [VIDEO PLAYER]               │  ✓ 1         │
│           (no card border,             │  ✓ 2         │
│            edge-to-edge in             │  ▶ 3  ← NOW  │
│            its column)                 │  ○ 4         │
│                                        │  ○ 5         │
│                                        │  ○ 6         │
├────────────────────────────────────────┤              │
│ Now: Episode 3                         │              │
│ Next: Episode 4 · Auto-play in 15s    │              │
│                                        │              │
│ Source: Aniwave (2 fallbacks)          │              │
└────────────────────────────────────────┴──────────────┘
```

**Top bar (above player):**
- Breadcrumb-style navigation: "◄ No Game, No Life · Episode 3"
- Clicking the show title goes back to the detail page.
- Remove the "Watch" heading and "Progress is saved..." subtitle entirely.

**Video player:**
- Remove the card border/container. The player sits directly in the content area.
- On wide screens, the player takes ~70–75% width; the episode sidebar takes ~25–30%.
- On narrow screens (< 1024px), the episode sidebar moves below the player.
- In fullscreen, obviously just the player.

**Player controls (redesigned):**
- Center the primary controls: ‹‹ 10s | ◀ Prev | ▶ Play/Pause | Next ▶ | 10s ››
- Left: volume slider + current time / duration
- Right: CC, settings (gear), fullscreen
- This clustering means the most-used controls (play, skip) are always in the same place regardless of screen width.

**Episode sidebar (right panel):**
- Compact vertical list of episodes with watch state indicators (same style as detail page).
- Current episode highlighted with accent.
- Clicking any episode switches playback immediately.
- Auto-scrolls to current episode.
- Collapsible: a toggle button at the top of the sidebar can collapse it to give the player full width.
- Width: 240–300px fixed.

**Below-player info bar:**
- "Now playing: Episode 3 — [Episode Title if known]"
- "Next: Episode 4 · Auto-play in 15s" (countdown visible)
- Source indicator: "Aniwave" with a small health dot. If fallback sources are available, show "(2 fallbacks)" as a reassurance signal.
- This section is minimal — 2-3 lines max.

**Keyboard shortcuts (not shown in UI, but functional):**
- Space: play/pause
- Left/Right arrow: seek ±10s
- Shift+Left/Right: seek ±30s  
- N: next episode
- P: previous episode
- F: fullscreen
- M: mute
- Up/Down: volume

**Auto-play behavior:**
- When an episode ends, show a brief transition state:
  - The player dims slightly.
  - A centered overlay shows: "Next: Episode 4 — [title]" with a circular countdown (15s default, configurable).
  - "Play Now" button to skip countdown.
  - "Cancel" to stop auto-play and return to detail page.
  - If next episode is the last episode, don't auto-play — show "Series complete" or "Last episode" instead.

---

## 6. Library Page

### 6.1 Current State

Not shown in screenshots, but based on the nav structure it exists.

### 6.2 Spec

The Library is the home screen for returning users. It should answer: "What am I watching, and what's next?"

**Layout:**

```
Continue Watching
[Cover] Ep 3  [Cover] Ep 12  [Cover] Ep 1  [Cover] Ep 7
 NGNL          JJK             CSM           Mob

Recently Added
[Cover] [Cover] [Cover] [Cover]

All (24)                                    [Grid ▾] [A-Z ▾]
[Cover] [Cover] [Cover] [Cover] [Cover] [Cover]
[Cover] [Cover] [Cover] [Cover] [Cover] [Cover]
...
```

**Continue Watching section:**
- Horizontal row of anime the user has in-progress.
- Each card shows: cover art, progress bar (teal, shows % of current episode), episode number ("Ep 3"), show title truncated.
- Ordered by last watched (most recent first).
- Clicking a card goes directly to the Watch page for the next unwatched content (not the detail page — reduce friction).
- Maximum ~6 items visible; horizontally scrollable if more.

**Recently Added section:**
- Shows the last few anime added to library, regardless of watch state.
- Only shown if there are recent additions (< 30 days). Otherwise, omit.

**All Library section:**
- Full grid of all library entries.
- Sort options: A-Z, Recently Watched, Recently Added, Year.
- View toggle: Grid (cover cards) / List (compact rows with more metadata).
- Optional: category/tag filter if categories are implemented.

**Library card design:**
- Cover art (2:3 aspect ratio).
- Title below.
- Watch progress indicator:
  - Unwatched: no indicator.
  - In-progress: teal progress bar at bottom of cover + "Ep N" badge.
  - Completed: subtle checkmark overlay or "Complete" badge.
- New episodes available: small notification dot if updates are detected.

---

## 7. History Page

### 7.1 Spec

A chronological log of what was watched and when. Useful for "what did I watch last week?" and "where did I leave off?"

**Layout:**
```
Today
  No Game, No Life · Episode 3 · Watched 14 min    2:30 PM
  No Game, No Life · Episode 2 · Completed          1:45 PM

Yesterday  
  Jujutsu Kaisen · Episode 12 · Completed           11:20 PM

March 12
  Chainsaw Man · Episode 1 · Watched 8 min          9:15 PM
```

- Grouped by day.
- Each entry: show title · episode number · status (completed / watched X min) · time.
- Clicking an entry resumes that episode at the last position.
- Small cover art thumbnail on the left for visual identification.
- "Clear History" option in the page header (or in Settings).

---

## 8. Settings & Providers Pages

### 8.1 Settings

Group settings into clear sections:

**Playback**
- Default auto-play countdown (5s / 10s / 15s / off)
- Default subtitle language preference
- Audio normalization default (off / light / strong)
- Progress save interval (current: 15s — make configurable: 10s / 15s / 30s)

**Appearance**
- Theme (dark only for now, but leave the option)
- Cover-based dynamic theming toggle

**Account**
- Username display
- Logout
- Export library (JSON)
- Import library (JSON)

**About**
- Version
- Attribution (Apache 2.0 credit to Anikku/Aniyomi/Tachiyomi lineage)

### 8.2 Providers

This is the admin surface for managing content sources.

**Provider list:**
```
Providers (5 enabled, 1 disabled)

[●] Aniwave          anime    Healthy · 1.2s avg    [⋮]
[●] AnimePahe        anime    Healthy · 0.8s avg    [⋮]
[●] AnimeOnsen       anime    Healthy · 1.4s avg    [⋮]
[●] Gogoanime        anime    Degraded · 3.1s avg   [⋮]
[○] AnimeTake        anime    Error · Challenge      [⋮]
```

- Each row: toggle (enabled/disabled), name, type, health status with color dot, average response time, more menu.
- More menu: Test Connection, Set Priority, Disable, Remove.
- Priority: drag-to-reorder the provider list. This determines which provider's results appear first in search and which source is tried first during playback.
- Health status refreshes periodically in the background.
- "Add Provider" button at the bottom if the system supports adding new sources.

---

## 9. Component Library

### 9.1 Buttons

| Type | Usage | Style |
|------|-------|-------|
| Primary | "Resume Ep 3", "Search", "Play Now" | Teal background, white text, rounded (6px), subtle shadow |
| Secondary | "Add to Library", "Cancel" | Transparent background, teal border, teal text |
| Ghost | "Show more", sort toggles, filter toggles | No border, no background, teal text, underline on hover |
| Danger | "Remove from Library", "Clear History" | Transparent background, red text (confirm before action) |
| Icon | Play ▶, Settings ⚙, Fullscreen ⛶ | Transparent, icon only, hover: subtle background circle |

### 9.2 Badges / Pills

- **Source badge**: dark background (`rgba(255,255,255,0.1)`), light text, small (12px font), rounded-full. Used to show which provider a result or episode comes from.
- **Genre pill**: similar to source badge but slightly more prominent. Used on detail pages.
- **Status badge**: colored dot (4–6px circle) + text label. Green/teal = healthy, amber = degraded, red = error.
- **Year badge**: plain text, no background, secondary color. Shown inline with metadata.
- **Episode count badge**: on Library cards, shows "Ep N" for in-progress shows. Teal background, white text, positioned on cover art bottom-left.

### 9.3 Cards

- **Anime result card** (used in search results and library grid):
  - Cover art: 2:3 aspect ratio, rounded corners (8px), object-fit: cover.
  - Title: below the image, 14px, semibold, max 2 lines with ellipsis.
  - Metadata: source badge, year. Below title.
  - Hover: subtle scale (1.02), increased shadow/glow.
  - Click: navigates to detail page.
  
- **Continue Watching card** (used in library hero row):
  - Same as anime result card but with:
    - Teal progress bar at bottom of cover (width = % of current episode watched).
    - "Ep N" badge on cover.
  - Click: navigates directly to Watch page (not detail page).

- **Episode row** (used on detail page and watch sidebar):
  - Not a traditional "card" — more of a list item.
  - Left: watch state dot/icon + episode number.
  - Center: episode title (if known).
  - Right: duration (if known) + play icon.
  - Active/current: left teal border + subtle background highlight.
  - Hover: subtle background change.
  - Height: 44–52px.

### 9.4 Player Component

- No outer border/card wrapper.
- Dark player chrome matching the app background (seamless).
- Controls appear on hover/tap, fade after 3 seconds of inactivity.
- Progress bar: thin (3px) at rest, thickens (6px) on hover. Teal for played, white/gray for buffered, dark for remaining.
- Centered primary controls cluster.
- Volume slider: appears on hover over volume icon.
- Subtitle selector (CC button): dropdown with available tracks.
- Settings gear: dropdown with playback speed, audio normalization toggle, subtitle style.

---

## 10. Responsive Behavior

### 10.1 Breakpoints

| Breakpoint | Sidebar | Watch Layout | Results Grid | Episode List |
|-----------|---------|-------------|-------------|-------------|
| ≥ 1440px | Expanded (240px) | Player + sidebar | 5 columns | Sidebar right |
| 1024–1439px | Expanded (200px) | Player + sidebar | 4 columns | Sidebar right |
| 768–1023px | Collapsed (icons, 56px) | Player full-width, episodes below | 3 columns | Below player |
| < 768px | Bottom tab bar | Player full-width, episodes below | 2 columns | Below player |

### 10.2 Mobile Considerations

- On mobile widths, the Watch page is player-first: the player takes full width, episode list is scrollable below.
- Library "Continue Watching" row is horizontally scrollable.
- Sidebar becomes a 4-item bottom tab bar: Discover, Library, History, Settings (Providers accessible from Settings).

---

## 11. Interaction States

### 11.1 Loading

- **Search**: skeleton cards in the results grid (gray rectangles with shimmer) while providers are queried. Results stream in as providers respond — don't wait for all providers before showing any results.
- **Episode list**: show skeleton rows until episode data loads.
- **Watch page**: show a centered spinner on the player area while the video source is being resolved. If fallback is occurring, show "Trying another source..." text.

### 11.2 Errors

- **All providers fail on search**: replace results area with a centered empty state: "No providers responded. Check your provider settings." with a link to the Providers page.
- **Video fails to load**: overlay on the player: "Couldn't load this episode. [Retry] [Try Another Source]"
- **Video fails mid-playback**: brief toast notification: "Source interrupted — switching to [next source]..." (this ties into the fallback chain feature).

### 11.3 Empty States

- **Library with no shows**: centered illustration or message: "Your library is empty. Search for something to watch." with a link/button to Discover.
- **Search with no results**: "No results for '[query]' across N providers." (Don't say "try a different search" — the user knows that.)
- **History with no entries**: "Nothing watched yet."

---

## 12. Data-Driven Improvements (Future)

These are improvements that require API integration beyond what's currently shown, aligned with the features from the Relay mobile spec:

### 12.1 AniSkip Integration (Watch Page)
- "Skip Intro" / "Skip Outro" button overlay on the player at the correct timestamps.
- Requires MAL ID mapping (from tracker integration or metadata lookup).

### 12.2 Filler Episode Marking (Detail Page)
- Color-coded dots on episode rows: green (canon), amber (mixed), red (filler).
- "Hide filler" toggle in episode list header.
- Requires Jikan API integration.

### 12.3 Watch Progress Sync
- If the web and mobile apps share a backend, watch progress should sync.
- The "Continue Watching" section on the Library page should reflect cross-device progress.

### 12.4 Per-Show Source Preference
- On the detail page, the user can set which provider to prefer for this show.
- Stored server-side (account-backed, as the app already is).

---

## 13. Implementation Priority

Ordered by impact × effort:

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| 1 | **Watch page redesign** — add context bar, episode sidebar, remove card wrapper | Medium | Very High |
| 2 | **Episode watch state** — progress indicators on episode rows across all views | Medium | Very High |
| 3 | **Sidebar active state** — highlight current page | Trivial | Medium |
| 4 | **Remove global header bar** — reclaim space | Trivial | Medium |
| 5 | **Detail page header restructure** — move Add to Library up, collapse tags, add Resume button | Medium | High |
| 6 | **Discover page provider collapse** — compact status bar, progressive disclosure | Low | High |
| 7 | **Library page Continue Watching row** | Medium | High |
| 8 | **Compact episode rows** — reduce height, show title if available, hide "Duration unknown" | Low | Medium |
| 9 | **Player controls recentering** | Low | Medium |
| 10 | **Typography hierarchy** — apply consistent scale across all pages | Low | Medium |
| 11 | **Auto-play transition** — next episode countdown overlay | Medium | Medium |
| 12 | **Responsive behavior** — sidebar collapse, mobile breakpoints | High | Medium |
| 13 | **Search results deduplication** — group same show across providers | High | Low–Medium |
| 14 | **History page design** | Medium | Low |
| 15 | **Keyboard shortcuts** | Low | Low |

Items 1–6 are the first pass. Items 7–11 are the second pass. Items 12–15 are polish.
