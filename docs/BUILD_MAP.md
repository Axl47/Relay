---
created_at: 2026-02-22T04:46
updated_at: 2026-02-22T04:47
---
# BUILD_MAP

## App module build configuration

### Primary file
- `app/build.gradle.kts`

### Build types (current)
- `debug`
  - `applicationIdSuffix = ".dev"`
  - `versionNameSuffix = "-<commitCount>"`
- `release`
  - optional minify/shrink via `Config.enableCodeShrink`
  - ProGuard files: `proguard-android-optimize.txt`, `proguard-rules.pro`
- `releaseTest`
  - based on release, suffix `.rt`
- `foss`
  - based on release, suffix `.foss`
- `preview`
  - based on release, suffix `.beta`, uses debug signing
  - has separate `src/beta/res`
- `benchmark`
  - based on release, suffix `.benchmark`, uses debug signing
  - has separate `src/debug/res`

### Product flavors
- No explicit `productFlavors {}` block is defined in `app/build.gradle.kts`.
- There is an `androidComponents.onVariants(selector().withFlavor("default" to "standard"))` hook, so flavor-based assumptions exist in build logic even though the app module does not currently declare flavor dimensions/flavors directly.

### Application identity and SDK
- `namespace = "eu.kanade.tachiyomi"`
- `applicationId = "app.anikku"`
- `versionCode = 5`
- `versionName = "0.1.5"`
- `minSdk`, `targetSdk`, `compileSdk` come from build logic:
  - `buildSrc/src/main/kotlin/mihon/buildlogic/AndroidConfig.kt`
  - current values: `MIN_SDK=26`, `TARGET_SDK=35`, `COMPILE_SDK=35`

### Plugins and conditional plugin wiring
- Applied directly in app:
  - `mihon.android.application`
  - `mihon.android.application.compose`
  - `com.github.zellius.shortcut-helper`
  - `kotlin-parcelize`, `kotlin-serialization`
  - AboutLibraries, Versions plugin
- Conditionally applied when `Config.includeTelemetry` is true:
  - Google Services plugin (`com.google.gms.google-services`)
  - Firebase Crashlytics plugin (`com.google.firebase.crashlytics`)
- Config source:
  - `buildSrc/src/main/kotlin/mihon/buildlogic/BuildConfig.kt`
  - telemetry/updater toggled by Gradle properties (`include-telemetry`, `enable-updater`)

## Dependency catalogs and removable candidates

### Catalog files
- `gradle/libs.versions.toml`
- `gradle/androidx.versions.toml`
- `gradle/aniyomi.versions.toml`
- `gradle/compose.versions.toml`
- `gradle/kotlinx.versions.toml`
- `gradle/sy.versions.toml`

### `gradle/libs.versions.toml` removable candidates for Pass 1
- Firebase stack:
  - `firebase-bom`
  - `firebase-analytics`
  - `firebase-crashlytics`
  - plugins `google-services`, `firebase-crashlytics`
- Palette/theming picker stack:
  - `palette-ktx`
  - `materialKolor`
  - `haze`
- Any item only used by removed modules/features should be pruned after code refs are removed.

### Cross-catalog removable candidates (also referenced by app)
- `gradle/compose.versions.toml`
  - `colorpicker` (custom palette picker feature)
- `gradle/aniyomi.versions.toml`
  - cast bundle (`media-router`, `cast-play-services`) if TV/cast paths are removed
- `gradle/sy.versions.toml`
  - `google-api-services-drive` (Google Drive sync)
- App project/module dependencies to remove:
  - `projects.i18n`, `projects.i18nKmk`, `projects.i18nAnk`, `projects.i18nSy`
  - `projects.flagkit`
  - `projects.telemetry`

## Firebase / Google Services configuration

### Build scripts
- Root `build.gradle.kts` includes plugin aliases for:
  - Google Services
  - Firebase Crashlytics
- App module conditionally applies these via `Config.includeTelemetry`.

### Manifest + config files
- `app/google-services.json` exists (contains app configs for `app.anikku` and `app.anikku.beta`).
- Manifest has Firebase-related cleanup/meta-data:
  - removes `com.google.android.gms.permission.AD_ID`
  - `google_analytics_adid_collection_enabled=false`

### ProGuard/R8 rules tied to Firebase/Google
- `app/proguard-rules.pro` includes explicit blocks for:
  - Firebase Installations
  - Crashlytics
  - Google Drive API
  - Google OAuth client classes

## Signing configuration

- No explicit release signing config is declared in `app/build.gradle.kts`.
- `preview` and `benchmark` explicitly reuse `debug.signingConfig`.
- `release` uses default signing behavior (CI/local signing setup external to this file).
- `macrobenchmark/build.gradle.kts` references debug signing for its benchmark build type (module planned for removal).

## Variant-specific and feature-specific wiring relevant to cuts

### Preview/benchmark variant wiring
- `app/build.gradle.kts`:
  - build types `preview`, `benchmark`
  - sourceSets for `preview` and `benchmark`
- Removal requires:
  - deleting those build types
  - deleting sourceSet overrides
  - removing preview-specific updater logic branches where applicable

### Auto-updater location (keep, retarget to Relay fork)
- `app/src/main/java/eu/kanade/tachiyomi/data/updater/AppUpdateChecker.kt`
  - currently points to `komikku-app/anikku` and `komikku-app/anikku-preview`
- `data/src/main/java/tachiyomi/data/release/ReleaseServiceImpl.kt`
  - calls GitHub releases API endpoint for whichever repo string is provided
- `domain/src/main/java/tachiyomi/domain/release/interactor/GetApplicationRelease.kt`
  - release filtering and semantic/preview version comparison

## Current manifest-level TV / feature declarations (for removal pass)
- `app/src/main/AndroidManifest.xml` currently includes:
  - `android.software.leanback` and optional touchscreen feature flags
  - LEANBACK launcher category on `MainActivity`
  - TV banner resource `@mipmap/ic_banner`
  - cast metadata and cast controls activity
  - Google Drive auth activity
  - Discord login activity + Discord RPC service
  - tracker auth hosts for removed trackers (`bangumi-auth`, `shikimori-auth`, `simkl-auth`)

