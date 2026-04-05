---
created_at: 2026-03-27T19:24:00-04:00
updated_at: 2026-03-27T19:54:00-04:00
spec: .docs/ui-spec.md
status: completed
---
# Relay Web UI/UX Redesign Implementation ExecPlan

## Objective

Implement the March 27, 2026 Relay web redesign plan across the client, API, and shared contracts, preserving the current dark utilitarian identity while fixing onboarding, clarifying the information architecture, and making desktop and narrow-mobile use feel like one coherent playback product.

## Scope

In scope:
- `web/apps/client` shell, shared styles, root routing, login, and all current dashboard routes
- `web/apps/api` routes needed to expose imports history and existing latent surfaces cleanly
- `web/packages/contracts` additions for imports listing and client-facing response types
- Auth-aware empty/error states for signed-out or first-run users
- Desktop and mobile responsive behavior for Discover, Library, Activity, Sources, Account, Detail, and Watch

Out of scope:
- Replacing the playback engine or existing HLS/DASH attachment logic
- Inventing new provider/tracker backend capabilities beyond what already exists
- URL migrations beyond relabeling existing surfaces in-place

## Decisions

1. Keep current route paths in phase 1:
   - `/history` remains the route but is labeled `Activity`
   - `/settings/providers` remains the route but is labeled `Sources`
   - `/settings` becomes the `Account` surface
2. Reuse existing contracts and user preferences rather than introducing duplicate client-only state.
3. Use graceful signed-out experiences on protected routes instead of allowing unrelated downstream queries to fail noisily.
4. Add imports listing so Account/Data can show actual import history, not only one-off job polling.
5. Favor responsive structure changes over custom player chrome. The player layout changes in this pass, native controls remain.

## Workstreams

### 1. Data and auth foundations
- Add `ImportJobsResponse` to `web/packages/contracts/src/imports.ts`
- Add `GET /imports` in `web/apps/api/src/routes/imports.ts`
- Add client hooks for trackers and imports
- Standardize auth/session checks so signed-out users see intentional CTA states across Discover, Library, Activity, Account, Sources, Detail, and Watch entry

### 2. Shared shell and styling
- Rebuild `web/apps/client/components/app-shell.tsx` around `Discover`, `Library`, `Activity`, `Sources`, and `Account`
- Rework `web/apps/client/app/globals.css` to support a denser wide desktop layout, page toolbars, improved card/list states, and a usable narrow-phone bottom nav
- Make `/` resolve to onboarding-aware destination behavior instead of always redirecting blindly to Discover

### 3. Primary workflow pages
- Discover: sticky search, filter chips, density toggle, richer loading/no-results/provider states, and provider details in a drawer/sheet
- Library: continue watching, categories, persisted layout/sort preferences, compact mobile default, and better shelf/list/grid hierarchy
- Activity: date-grouped timeline with lightweight filters

### 4. Secondary workflow pages
- Sources: operator-style provider management with grouping, health explanation, adult-gate visibility, and reorder affordances
- Account: playback, appearance, integrations, data, and session sections with trackers/imports included
- Login: first-run-aware copy, bootstrap disclosure, autocomplete, and stronger mobile structure

### 5. Context pages
- Detail: tighter metadata header, sticky actions, episode search/sort, clearer progress/resume context
- Watch: theater-first layout, collapsible episode rail/sheet, inline next/previous actions, compact autoplay dock, and mobile-friendly metadata stacking

## Verification Plan

- Typecheck client, API, and contracts after all edits
- Run targeted client tests for route helpers, API base URL behavior, search stream parsing, and playback session helpers
- Run a browser pass for desktop and narrow mobile on at least Discover, Library, Account, Sources, Detail, Watch, and Login
- Confirm signed-out flows on protected routes render login/bootstrap CTAs instead of generic request errors

## Completion Criteria

- The shell reflects the new IA on desktop and mobile
- Signed-out users can understand how to enter the product from any primary route
- Discover, Library, Account, Sources, Detail, and Watch all match the new hierarchy and responsiveness goals
- Library layout/sort/category visibility round-trip through user preferences
- Trackers and imports are visible in the web UI using existing backend capabilities plus imports listing support

## Outcome

- Completed the planned client shell, route, auth-state, and responsive UI refactors across Discover, Library, Activity, Sources, Account, Detail, Watch, and Login.
- Added imports history support end-to-end through shared contracts, the API route/service/repository stack, and the Account/Data surface.
- Verified the signed-out desktop and narrow-mobile flows live in the browser, and verified the code paths with passing client/API typechecks and test suites.
- Authenticated browser verification remains blocked locally because the current `/auth/login` path returns `500 read ECONNRESET` against the local backend/database setup.
