---
created_at: 2026-03-16T21:58:02-04:00
updated_at: 2026-03-16T21:58:02-04:00
spec: .docs/ui-spec.md
status: planned
---
# Relay Web UI Overhaul ExecPlan

## Objective

Implement the Version 0.2 web redesign from `.docs/ui-spec.md` across the Relay web platform in `web/`, with a player-first information architecture, progress-aware page models, and responsive navigation that reduces admin UI weight without regressing search, playback, or provider controls.

## Scope

In scope:
- `web/apps/client` shell, shared styles, and dashboard routes
- `web/apps/api` routes and `RelayService` aggregations needed for progress-aware UI
- `web/packages/contracts` additions for new view models and preferences
- Watch-flow UX for Discover, anime detail, Watch, Library, History, Settings, and Providers

Out of scope for this pass:
- AniSkip, filler metadata, and per-show source preference from section 12 of the spec
- Full cross-provider deduplication heuristics beyond a basic, low-risk first pass
- Replacing the playback engine itself

## Current Code Map

Client routes and shell:
- `web/apps/client/components/app-shell.tsx` contains the current left nav, brand subtitle, Notes card, and global top header.
- `web/apps/client/app/globals.css` contains all current global tokens and page/card/list/player styling.
- `web/apps/client/app/(dashboard)/discover/page.tsx` is a monolithic client component with inline search state and always-expanded provider response cards.
- `web/apps/client/app/(dashboard)/anime/[providerId]/[externalAnimeId]/page.tsx` loads anime details and episodes separately, has no library/progress context, and renders tall generic list rows.
- `web/apps/client/app/(dashboard)/watch/[libraryItemId]/[episodeId]/page.tsx` creates a playback session and renders a bare player panel with no watch context or episode navigation.
- `web/apps/client/app/(dashboard)/library/page.tsx`, `history/page.tsx`, `settings/page.tsx`, and `settings/providers/page.tsx` are simple route-local list/grid shells with inline `useEffect` fetches.
- `web/apps/client/components/video-player.tsx` uses native `<video controls>` with HLS/DASH attachment and progress syncing.

Shared data and backend:
- `web/packages/contracts/src/index.ts` owns the shared page payload schemas for the web client and API.
- `web/apps/api/src/app.ts` exposes the current `/me`, `/providers`, `/catalog/*`, `/library`, `/playback/sessions/*`, `/history`, and `/updates` routes.
- `web/apps/api/src/services/relay-service.ts` already tracks `watchProgress`, writes `historyEntries`, stores provider priority/health, and is the right place for new view-model aggregations.

## Constraints And Decisions

1. Use React Query for redesigned routes instead of adding more route-local `useEffect` + `useState` fetch code. `QueryProvider` already exists and the redesign introduces multiple dependent view models and mutations.
2. Add dedicated screen-oriented API payloads where the current REST shapes are too thin. The current `/library`, `/history`, and catalog endpoints expose raw records, but the spec needs joined data such as resume targets, episode watch state, grouped history, and compact provider summaries.
3. Remove `Updates` from primary navigation as part of the IA change, but keep the route temporarily available until Library absorbs its surface area. Final state should redirect `/updates` into Library-owned UI or retire it after parity.
4. Ship the Watch page layout and episode navigation before attempting fully custom player chrome. The spec's centered transport controls require replacing native browser controls, which is materially riskier than the layout/context work. Treat custom controls as a follow-up slice gated on stable playback behavior.
5. Keep existing playback proxy behavior, subtitle proxying, and DASH/HLS support intact. The redesign should not regress provider-specific playback handling already encoded in `web/apps/api/src/app.ts` and `web/apps/client/components/video-player.tsx`.

## Workstreams

### Workstream 1: Foundations, Contracts, And Shell

Goal:
Establish the new visual system and the data shapes needed by the redesigned screens.

Files:
- `web/apps/client/app/layout.tsx`
- `web/apps/client/app/globals.css`
- `web/apps/client/components/app-shell.tsx`
- `web/apps/client/components/query-provider.tsx`
- `web/packages/contracts/src/index.ts`
- `web/apps/api/src/app.ts`
- `web/apps/api/src/services/relay-service.ts`

Tasks:
1. Replace the current token set in `globals.css` with the darker layered palette from the spec, add amber/error/status variables, establish a consistent spacing scale, and promote typography classes/tokens for page title, section header, body, and metadata use cases.
2. Rework `app-shell.tsx` so the sidebar is the primary app chrome:
   - remove the brand subtitle and Notes panel
   - group nav items into Primary and System
   - remove the global top header
   - move account identity to the sidebar footer
   - support active-state emphasis and responsive collapse behavior
3. Introduce shared layout/component building blocks for pills, status rows, section headers, empty states, and episode rows so page work does not duplicate ad hoc markup.
4. Add screen-shaped contract types for the redesign. Prefer explicit payloads such as:
   - `LibraryDashboardResponse`
   - `AnimeDetailView`
   - `WatchPageContext`
   - `GroupedHistoryResponse`
   - richer settings/provider preference types where needed
5. Add the corresponding API routes and `RelayService` methods rather than pushing client pages to join multiple primitive payloads manually.

Completion criteria:
- The shell matches the new IA at desktop width.
- The client and API compile against the new shared contract types.
- Existing routes still render with the new shell and token system before page-specific redesign begins.

### Workstream 2: Discover Redesign

Goal:
Make search result-first, keep provider transparency available on demand, and reduce empty admin chrome above the fold.

Files:
- `web/apps/client/app/(dashboard)/discover/page.tsx`
- new route-local components under `web/apps/client/components/discover/` or equivalent
- optional supporting contract/API additions in `web/packages/contracts/src/index.ts` and `web/apps/api/src/services/relay-service.ts`

Tasks:
1. Replace the card-wrapped page header with a direct page-level search input and inline loading state.
2. Convert the provider response block into a compact status bar with expandable per-provider rows.
3. Stream results into a visually stronger cover grid with:
   - better hover states
   - suppressed `No synopsis.` filler text
   - badges for provider/source count or duplicate visibility
   - optional `In Library` state if the payload can surface it cheaply
4. Decide the first-pass duplicate strategy:
   - preferred: server-side grouping on normalized title + year when confidence is high
   - fallback: keep separate cards but visually mark alternates
5. Preserve search reliability for slash-containing IDs and provider metadata already returned by the search endpoint.

Completion criteria:
- Search remains functional while moving provider details behind progressive disclosure.
- The first viewport is dominated by search and results, not status cards.
- Partial/failure states collapse into the compact provider summary instead of separate warning blocks.

### Workstream 3: Anime Detail Header And Episode State

Goal:
Turn the detail page into a resume-first page with compact metadata and stateful episode rows.

Files:
- `web/apps/client/app/(dashboard)/anime/[providerId]/[externalAnimeId]/page.tsx`
- shared episode/list primitives in `web/apps/client/components/`
- `web/packages/contracts/src/index.ts`
- `web/apps/api/src/app.ts`
- `web/apps/api/src/services/relay-service.ts`

Tasks:
1. Add a detail-page payload that joins:
   - anime metadata
   - library membership state
   - resume target / next unwatched episode
   - per-episode watch progress and completion state
2. Redesign the header into a cover + metadata + CTA layout:
   - prominent title
   - compact year/episode/status line
   - limited visible tags with inline expansion
   - synopsis with controlled expansion
   - primary `Resume` or `Watch Ep 1` action above the fold
   - secondary library action and overflow menu
3. Replace the current tall episode rows with compact list items that show:
   - watched / in-progress / unwatched indicators
   - duration only when known
   - current episode highlighting
   - row-level click target plus compact play affordance
4. Auto-scroll to the current/in-progress episode when the screen loads and preserve sort toggles for `Oldest first` and `Newest first`.

Completion criteria:
- The detail page exposes a visible resume path without scrolling.
- Episode rows communicate state without repeating placeholder text.
- Library membership toggles and resume state stay consistent after mutations.

### Workstream 4: Watch Page Context, Navigation, And Playback UX

Goal:
Make the watch route feel like a playback product instead of a standalone video panel.

Files:
- `web/apps/client/app/(dashboard)/watch/[libraryItemId]/[episodeId]/page.tsx`
- `web/apps/client/components/video-player.tsx`
- new watch-specific components under `web/apps/client/components/watch/`
- `web/packages/contracts/src/index.ts`
- `web/apps/api/src/app.ts`
- `web/apps/api/src/services/relay-service.ts`

Tasks:
1. Add a watch-context payload that includes:
   - anime title and provider summary
   - episode list with watch state
   - current episode metadata
   - next episode metadata
   - fallback source count if available from resolved playback
2. Rebuild the page layout into two zones:
   - left player column with breadcrumb/context bar and below-player now/next/source info
   - right episode sidebar that collapses under the player on narrower breakpoints
3. Remove the panel wrapper around the player area while preserving the existing HLS/DASH attach logic.
4. Add episode switching within the watch route, current-episode auto-scroll, and keyboard shortcuts for transport and episode navigation.
5. Implement the autoplay transition overlay as a separate slice after watch context and next-episode resolution are stable.
6. Evaluate whether native controls are sufficient for phase 1. If not, schedule a dedicated custom-controls follow-up that replaces `controls` with Relay-owned chrome.

Completion criteria:
- The watch page shows what is playing, what comes next, and where the user is in the series without going back to detail.
- Episode switching works from the sidebar and preserves progress updates.
- Existing ready/resolving/failed/expired session states still surface clearly.

### Workstream 5: Library Dashboard And History

Goal:
Make Library answer "what should I watch now?" and make History readable as a chronological activity log.

Files:
- `web/apps/client/app/(dashboard)/library/page.tsx`
- `web/apps/client/app/(dashboard)/history/page.tsx`
- optional redirect or deprecation work for `web/apps/client/app/(dashboard)/updates/page.tsx`
- `web/packages/contracts/src/index.ts`
- `web/apps/api/src/app.ts`
- `web/apps/api/src/services/relay-service.ts`

Tasks:
1. Add a dashboard-oriented library payload with at least:
   - `continueWatching`
   - `recentlyAdded`
   - `allItems`
   - item-level progress and completion state
2. Redesign Library into three sections from the spec:
   - Continue Watching row linking directly into the watch route
   - Recently Added row, only when relevant
   - full library grid/list with sort and layout toggles
3. Surface update-related information inside Library rather than keeping Updates as a top-level nav item. Options:
   - recent updates inside Library sections
   - redirect `/updates` to a Library filtered view once parity exists
4. Group History by relative day buckets client-side or server-side, depending on payload simplicity, and add cover thumbnails plus resume-on-click behavior.

Completion criteria:
- Continue Watching cards use real watch-progress data rather than inferred timestamps alone.
- Recently Added is conditional and not a permanent empty shell.
- History is grouped by day and supports re-entry into playback.

### Workstream 6: Settings, Providers, And Responsive Polish

Goal:
Bring secondary surfaces up to the same design language and complete the responsive behavior promised by the spec.

Files:
- `web/apps/client/app/(dashboard)/settings/page.tsx`
- `web/apps/client/app/(dashboard)/settings/providers/page.tsx`
- `web/packages/contracts/src/index.ts`
- `web/apps/api/src/app.ts`
- `web/apps/api/src/services/relay-service.ts`
- `web/apps/client/app/globals.css`

Tasks:
1. Expand user preference contracts and persistence for the spec-backed settings that do not exist yet:
   - autoplay countdown duration
   - subtitle preference refinements
   - audio normalization default
   - progress save interval
   - theme/cosmetic toggles as placeholders if they are not yet functional
2. Redesign Settings into clear grouped sections instead of generic list cards.
3. Redesign Providers into compact rows with:
   - enabled/disabled toggle
   - health dot and latency summary
   - more menu actions
   - drag or button-based priority ordering
4. Add any missing provider admin actions required by the UI, such as an explicit test endpoint if the page should expose `Test Connection`.
5. Finish responsive shell behavior:
   - collapsed icon rail between tablet and desktop widths
   - mobile bottom tab bar or drawer
   - watch sidebar stacking below player on narrow layouts

Completion criteria:
- Settings and Providers stop looking like raw admin dumps and align with the same spacing/type system as primary screens.
- Provider priority remains editable and persisted.
- The shell behaves correctly at the breakpoint bands defined in the spec.

## Execution Order

Recommended sequence:
1. Workstream 1
2. Workstream 3 data model pieces needed by resume/watch state
3. Workstream 4 watch layout and navigation
4. Workstream 2 discover polish
5. Workstream 5 library and history
6. Workstream 6 settings/providers polish

Rationale:
- The spec is player-first, so watch context and episode state should land before secondary admin surfaces.
- Library and detail both depend on the same progress-aware joins, so those backend additions should be shared early.
- Discover and provider UI are largely presentation work once the shell and tokens are stable.

## Verification Plan

Automated checks:
- `rtk npm --prefix web/apps/client run typecheck`
- `rtk npm --prefix web/apps/api run typecheck`
- `rtk npm --prefix web run typecheck`
- `rtk npm --prefix web/apps/client run build`

Behavioral verification per slice:
- Discover: successful search, partial-provider search, no-results state, slash-safe detail navigation
- Detail: add/remove library state, resume CTA selection, episode list sort and current-episode auto-scroll
- Watch: ready/resolving/failed playback states, episode switching, subtitle selection, keyboard shortcuts, autoplay overlay
- Library: continue-watching cards open the intended episode, progress bars reflect stored `watchProgress`, empty-state handling
- History: entries group by day, clicking resumes the correct episode and position
- Providers: enable/disable, reorder priority, health display refresh, adult-gated providers remain protected by settings

## Risks And Open Questions

1. Custom player controls vs native controls:
   The spec's centered transport cluster is not compatible with browser-native controls. Decide early whether phase 1 keeps native controls with only layout/context improvements, or whether this pass funds a custom control layer.
2. Search deduplication quality:
   Cross-provider title grouping is easy to get wrong. The plan assumes a conservative first pass and treats aggressive dedupe as optional unless a stable normalization key emerges.
3. Updates page migration:
   The spec removes `Updates` from primary nav, but the current app has a real route. The implementation should choose between redirecting it into Library or keeping it as a temporary secondary surface during rollout.
4. Progress payload shape:
   The current service stores enough raw data (`watchProgress`, `historyEntries`, `libraryItems`) but does not expose joined screen models yet. Final field names and route boundaries should be agreed before implementation to avoid churn across client and API.
5. Responsive nav interaction:
   The spec allows a collapsed icon rail, bottom tab bar, or drawer on smaller screens. The exact mobile navigation pattern should be locked before implementation to keep the shell refactor stable.

## Suggested Milestones

Milestone 1:
- Workstream 1 complete
- watch/detail/library contract additions merged
- shell and tokens in place

Milestone 2:
- detail page and watch page match the player-first layout
- playback context and episode-state UI ship without custom controls

Milestone 3:
- library dashboard, history grouping, and discover/provider polish land
- updates nav removal and responsive shell complete

## Human Decisions Needed Before Coding

1. Should the first Watch-page implementation keep native browser controls and defer custom Relay controls, or is custom player chrome required in the first pass?
2. Should `/updates` become a redirect into Library once the dashboard exists, or should it stay as a hidden-but-supported route for a longer migration window?
3. For mobile navigation, do we want a bottom tab bar or a drawer-first approach?

## Commit Message

docs(exec): add Relay web UI overhaul implementation plan
