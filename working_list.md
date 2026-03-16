# Working List

## Pending
- [ ] Implement browser-side extractors for the browser-protected providers and Aniwave fallback paths
- [ ] Finish Android import provider mapping and tracker guardrails for unsupported providers

## In Progress
- [~] Close the remaining browser-protected and import/tracker scaffolds against the production provider set

## Done
- [x] Restore Hanime playback without the blocked iframe fallback
- [x] Switch Hanime playback back to direct browser extraction while keeping franchise-grouped discovery
- [x] Verify Hanime provider and browser packages after the playback fix
- [x] Invalidate stale Hanime HTML playback sessions so the web client stops reusing the embedded fallback
- [x] Extend Hanime playback timeouts in both the API and browser service so direct extraction is not aborted at 25000ms
- [x] Replace Hanime’s slow player-boot wait with a direct `/play` -> manifest fetch flow and a short manifest authorization retry
- [x] Create the live checklist and map the requested rollout onto the current `web/` scaffold
- [x] Extend shared contracts, provider SDK, and persistence schema for provider metadata, adult gating, playback state, and aggregated search responses
- [x] Add provider base classes, registry metadata, all provider adapters, and fixture-based parser tests
- [x] Wire the browser broker app into the workspace, API runtime, and deploy manifests
- [x] Replace `demo` with the seeded curated provider set and remove legacy assumptions
- [x] Run targeted verification for providers, browser, API, worker, and client typechecks
- [x] Update worker and client flows for metadata, adult gating, aggregated search, playback polling, and provider settings
