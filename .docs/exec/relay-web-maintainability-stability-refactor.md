---
created_at: 2026-03-25T23:16:00-04:00
updated_at: 2026-03-25T23:16:00-04:00
status: in_progress
---
# Relay Web Maintainability And Stability Refactor ExecPlan

## Objective

Reduce coupling and regression risk across the Relay web platform by splitting oversized modules, centralizing duplicated logic, and adding meaningful test coverage around orchestration-heavy code.

## Scope

In scope:
- `web/apps/api`
- `web/apps/browser`
- `web/apps/client`
- `web/apps/worker`
- `web/packages/contracts`
- `web/packages/provider-sdk`
- `web/packages/providers`
- `AGENTS.md`

Out of scope:
- New end-user features beyond what the refactor requires for internal cleanup
- New infrastructure beyond the current Fastify, Drizzle, Playwright, Redis, BullMQ, and Next.js stack
- Replacing provider-specific playback behavior that is already working unless regression tests reveal a bug

## Decisions

1. Keep runtime behavior as stable as possible while allowing internal module and contract cleanup.
2. Execute in verified slices: tests first, then shared foundations, then service/client/browser decomposition.
3. Treat query-based catalog reads as the canonical API surface for client consumption.
4. Keep `web/packages/contracts/src/index.ts` as a barrel, but move implementation into focused modules.
5. Centralize provider runtime policy in one shared definition module consumed by `providers`, `api`, and `browser`.

## Workstreams

### 1. Safety Net
- Replace placeholder package `test` scripts with real runners where package logic exists.
- Add Vitest suites for client route/query helpers, API pure helpers, browser extraction policy helpers, and playback fallback behavior.
- Preserve existing provider fixture tests and extend them only where orchestration changes need coverage.

### 2. Shared Foundations
- Split shared contracts into focused files under `web/packages/contracts/src/`.
- Add shared catalog query schemas and NDJSON search-stream event schemas.
- Add shared provider definitions and runtime policy.
- Add client query-key and route-builder helpers.

### 3. API Decomposition
- Extract auth guards, request parsing, and typed API errors.
- Move streaming/proxy/manifest/subtitle/compat-MP4 helpers into `web/apps/api/src/streaming/`.
- Replace direct route-to-monolith wiring with route modules and focused services.

### 4. Browser Decomposition
- Move browser runtime policy out of `extraction-service.ts`.
- Split large provider extractor internals into focused helper modules.
- Keep extraction behavior stable through regression tests.

### 5. Client Decomposition
- Move page-local data orchestration into shared hooks.
- Move path/query construction into shared route helpers.
- Deduplicate provider settings UI and image rendering.
- Break `video-player.tsx` into smaller hooks/state helpers without changing the watch UX.

### 6. Worker And Docs Cleanup
- Move queue names and related payload/result typing into shared contracts.
- Split worker job handlers into dedicated modules.
- Update `AGENTS.md` with the new high-value entry points for future maintenance.

## Verification

- `rtk proxy npm run typecheck` from `web/`
- `rtk npm test` from `web/`
- Package-level tests for new helper modules where appropriate
- Manual smoke checks for login, discover, anime detail, watch playback, history, library, and provider settings
