---
created_at: 2026-02-22T04:37
updated_at: 2026-03-20T01:06
---
# Working List

## Current Task: Discover Last Search Restore
- [x] Add contracts schema/type for cached catalog search snapshot response
- [x] Add RelayService in-memory per-user last-search cache with 30-minute TTL
- [x] Expose authenticated `GET /catalog/search/last` endpoint
- [x] Update Discover page to auto-restore cached results and prefill query
- [x] Run typecheck for contracts/api/client and capture verification notes

## Pending
- [ ] Add custom Relay-owned player controls to replace native browser controls
- [ ] Add provider admin actions beyond enable/reorder, such as test connection and richer overflow actions
- [ ] Fold update activity into the Library UI instead of relying on the `/updates` redirect fallback

## In Progress
- [~] None

## Done
- [x] Inspect `.docs/ui-spec.md` and the current Relay web client, API, and shared contract surfaces
- [x] Map route/component/API hotspots for Discover, Library, History, Watch, Settings, Providers, and anime detail
- [x] Write the Relay Web UI overhaul ExecPlan in `.docs/exec/relay-web-ui-overhaul.md`
- [x] Update `AGENTS.md` with the current `.docs` guidance and the shared web contracts hotspot
- [x] Audit schema/service dependencies and set the phase boundaries for the first implementation pass
- [x] Implement shared contracts for dashboard, detail, watch, history, and settings view models
- [x] Implement API endpoints and `RelayService` aggregations for the redesigned web UI
- [x] Update playback progress bookkeeping so Library/Resume views can rely on `lastEpisodeNumber` and `lastWatchedAt`
- [x] Redesign the app shell, global styles, and shared UI primitives
- [x] Redesign Discover, Detail, Watch, Library, History, Settings, and Providers pages for the first pass
- [x] Redirect `/updates` to `/library` to match the new information architecture
- [x] Run `rtk proxy npm --prefix web/apps/api run typecheck`
- [x] Run `rtk proxy npm --prefix web/apps/client run typecheck`
- [x] Run `rtk proxy npm --prefix web run typecheck`
- [x] Run `rtk proxy npm --prefix web run typecheck -w @relay/contracts`
- [x] Run `rtk proxy npm --prefix web run typecheck -w @relay/api`
- [x] Run `rtk proxy npm --prefix web run typecheck -w @relay/client`
- [x] Run `rtk proxy npm --prefix web/apps/client run build`
- [x] Verify the live AnimePahe stream proxy serves the playlist with `.ts`-aliased segment URLs and `video/mp2t` segment content types instead of raw `.jpg` / `image/jpeg`
