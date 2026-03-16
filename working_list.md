# Working List

## Pending
- [ ] Manually verify AnimeTake search/details/playback in an environment that clears the site's Cloudflare managed challenge

## In Progress
- [~] Document the remaining live-site verification risk for AnimeTake

## Done
- [x] Inspect `AGENTS.md`, `.docs`, and the existing browser extractor pipeline
- [x] Confirm `animetake` is already declared as a browser-routed provider with no extractor implementation
- [x] Research accessible AnimeTake structure from indexed pages and older scraper patterns
- [x] Confirm local live-site inspection is currently blocked by AnimeTake's Cloudflare managed challenge in this environment
- [x] Write the AnimeTake ExecPlan and refresh the task checklist
- [x] Implement `web/apps/browser/src/extractors/animetake.ts`
- [x] Register the AnimeTake extractor, extend the browser timeout, and update `AGENTS.md`
- [x] Run `rtk proxy npm --prefix web/apps/browser run typecheck`
