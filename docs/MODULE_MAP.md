---
created_at: 2026-02-22T04:42
updated_at: 2026-02-22T04:42
---
# MODULE_MAP

## Module inventory (from `settings.gradle.kts`)

| Module | Exists | Summary |
|---|---|---|
| `:app` | Yes | Main Android application shell (UI, player, trackers, updater, backup/sync integration). |
| `:core-metadata` | Yes | Metadata support utilities; depends on `:source-api`. |
| `:core:archive` | Yes | Archive/unarchive and file handling helpers used by local/source workflows. |
| `:core:common` | Yes | Shared networking, logging, JS engine, preference, and common runtime helpers. |
| `:data` | Yes | SQLDelight-backed repositories and data persistence layer. |
| `:domain` | Yes | Use-cases/interactors and domain models across app features. |
| `:i18n` | Yes | Base multiplatform string resources (`MR`). |
| `:i18n-aniyomi` | No | Referenced in settings, but module directory is currently missing. |
| `:i18n-kmk` | Yes | KMK string overlay module (`KMR`). |
| `:i18n-ank` | Yes | ANK string overlay module (`AMR`). |
| `:flagkit` | Yes | Flag resources module consumed by app UI. |
| `:i18n-sy` | Yes | SY string overlay module (`SYMR`). |
| `:macrobenchmark` | Yes | Macrobenchmark test module for performance profiling. |
| `:presentation-core` | Yes | Shared Compose presentation components and screen primitives. |
| `:presentation-widget` | Yes | App widget presentation module. |
| `:source-api` | Yes | Source abstraction API (KMP), used by source implementations and app features. |
| `:source-local` | Yes | Local source implementation + local file source logic. |
| `:telemetry` | Yes | Firebase/no-op telemetry module gated by build property. |

## Inter-module dependency map (direct project dependencies)

- `:app` -> `:i18n`, `:i18n-kmk`, `:i18n-ank`, `:i18n-sy`, `:core:archive`, `:core:common`, `:core-metadata`, `:source-api`, `:source-local`, `:data`, `:domain`, `:presentation-core`, `:presentation-widget`, `:telemetry`, `:flagkit`.
- `:core:archive` -> `:core:common`.
- `:core:common` -> `:i18n`, `:i18n-sy`.
- `:core-metadata` -> `:source-api`.
- `:data` -> `:source-api`, `:domain`, `:core:common`.
- `:domain` -> `:i18n`, `:i18n-sy`, `:i18n-ank`, `:source-api`, `:core:common`.
- `:source-api` -> `:core:common` (androidMain).
- `:source-local` -> `:source-api`, `:i18n`, `:i18n-sy`, `:core:archive`, `:core:common`, `:core-metadata`, `:domain`.
- `:presentation-core` -> `:core:common`, `:i18n`, `:i18n-sy`.
- `:presentation-widget` -> `:core:common`, `:domain`, `:presentation-core`, `:i18n`.
- `:flagkit` -> `:core:common`.
- `:macrobenchmark` -> targets `:app` benchmark variant.
- `:telemetry` -> standalone module consumed by `:app`.

## Notes relevant to implementation passes

- `:i18n-aniyomi` is included in settings but missing on disk; this should be resolved before/while variant/module cleanup.
- Build logic for common SDK values is centralized in `buildSrc/src/main/kotlin/mihon/buildlogic/AndroidConfig.kt` (currently `minSdk=26`, `targetSdk=35`).
- `:app` still carries cross-cutting integration points for Discord, sync providers, updater, and onboarding; Pass 1 cleanup will be concentrated there plus `:domain`/`data` support modules.
