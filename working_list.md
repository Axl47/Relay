---
created_at: 2026-02-22T04:37
updated_at: 2026-03-25T23:28
---
# Working List

## Current Task: Relay Web Maintainability And Stability Refactor

## Pending
- [ ] Further split the large browser extractor modules under `web/apps/browser/src/extractors/`

## In Progress
- [~] Decompose browser extraction coordination and stage the remaining provider extractor splits

## Done
- [x] Inspect the current `web/` workspace layout, hotspots, and verification baseline
- [x] Confirm `rtk` wrapper behavior and note the correct verification command pattern
- [x] Produce the implementation plan for the maintainability/stability refactor
- [x] Write the maintainability/stability ExecPlan to `.docs/exec/`
- [x] Add real test runners and safety-net suites across `web/`
- [x] Split `@relay/contracts` into focused modules with a barrel export
- [x] Introduce shared provider definitions and reuse them across browser/API/providers
- [x] Refactor client route/query helpers and shared settings/provider UI
- [x] Refactor client playback component into focused hooks/state helpers
- [x] Extract API streaming/proxy helpers out of `web/apps/api/src/app.ts`
- [x] Run workspace typecheck and tests
- [x] Update `AGENTS.md` with the new maintainability hotspots and guidance
