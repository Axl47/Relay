---
created_at: 2026-04-04T00:00:00-04:00
updated_at: 2026-04-04T00:00:00-04:00
status: in_progress
---
# Xtream Provider + First-Class Movie/TV Support ExecPlan

## Objective

Add an `xtream` provider backed by TMDB metadata and Xtream-style embed mirrors, while extending Relay's web stack to model general movie/TV content as a first-class non-adult provider category.

## Current Focus

1. Extend contracts, preferences, and persistence to represent `general` content plus item `kind` / season / episode fields.
2. Implement the `xtream` HTTP provider and conditionally register it when `TMDB_API_KEY` is configured.
3. Update client routing and detail/watch surfaces to present movie/TV content correctly without breaking existing anime flows.
4. Add targeted tests and run typecheck/test verification across the web workspace.

## Verification

- `rtk proxy npm run typecheck` from `web/`
- `rtk proxy npm test` from `web/`
- `rtk proxy npm run db:push -w @relay/api`
- Manual smoke checks for xtream movie search/detail/watch, xtream TV season/episode watch, discover kind filters, and provider visibility when `TMDB_API_KEY` is unset
