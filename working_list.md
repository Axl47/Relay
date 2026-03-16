# Working List

## Pending
- [ ] Implement browser-side extractors for the browser-protected providers and Aniwave fallback paths
- [ ] Finish Android import provider mapping and tracker guardrails for unsupported providers

## In Progress
- [~] Close the remaining browser-protected and import/tracker scaffolds against the production provider set

## Done
- [x] Create the live checklist and map the requested rollout onto the current `web/` scaffold
- [x] Extend shared contracts, provider SDK, and persistence schema for provider metadata, adult gating, playback state, and aggregated search responses
- [x] Add provider base classes, registry metadata, all provider adapters, and fixture-based parser tests
- [x] Wire the browser broker app into the workspace, API runtime, and deploy manifests
- [x] Replace `demo` with the seeded curated provider set and remove legacy assumptions
- [x] Run targeted verification for providers, browser, API, worker, and client typechecks
- [x] Update worker and client flows for metadata, adult gating, aggregated search, playback polling, and provider settings
