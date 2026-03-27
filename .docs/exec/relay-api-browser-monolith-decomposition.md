---
created_at: 2026-03-27T11:15:00-04:00
updated_at: 2026-03-27T11:15:00-04:00
status: in_progress
---
# Relay API + Browser Monolith Decomposition ExecPlan

## Objective

Delete the remaining API/browser monoliths by introducing route modules, focused services, provider-folder extractors, and route-testable dependency seams without changing the user-facing web behavior.

## Current Focus

1. Add an injectable API service container and move route bodies out of `web/apps/api/src/app.ts`.
2. Remove the legacy catalog/search alias routes while keeping the canonical query routes stable.
3. Split `relay-service.ts` into domain services and repositories, then delete it.
4. Split the large browser extractor files into provider folders plus shared extractor utilities.

## Verification

- `rtk proxy npm run typecheck` from `web/`
- `rtk proxy npm test` from `web/`
- Manual smoke checks for login, discover, detail, watch, settings, history, library, subtitles, HLS, DASH, and slash-containing ids
