---
created_at: 2026-02-22T04:43
updated_at: 2026-02-22T04:47
---
# CUT_MAP

## Feature removal map (Pass 1 scope)

| Feature to cut | Status | Primary code locations |
|---|---|---|
| SyncYomi sync | Found | `app/src/main/java/eu/kanade/tachiyomi/data/sync/SyncManager.kt`, `app/src/main/java/eu/kanade/tachiyomi/data/sync/service/SyncYomiSyncService.kt`, `app/src/main/java/eu/kanade/tachiyomi/data/sync/SyncDataJob.kt`, `app/src/main/java/eu/kanade/presentation/more/settings/screen/SettingsDataScreen.kt`, `app/src/main/java/eu/kanade/domain/sync/SyncPreferences.kt` |
| Google Drive sync | Found | `app/src/main/java/eu/kanade/tachiyomi/data/sync/service/GoogleDriveSyncService.kt`, `app/src/main/java/eu/kanade/tachiyomi/ui/setting/track/GoogleDriveLoginActivity.kt`, `app/src/main/java/eu/kanade/presentation/more/settings/screen/SettingsDataScreen.kt`, `app/src/main/java/eu/kanade/tachiyomi/di/AppModule.kt` |
| Discord Rich Presence | Found | `app/src/main/java/eu/kanade/tachiyomi/data/connections/discord/*`, `app/src/main/java/eu/kanade/presentation/more/settings/screen/SettingsDiscordScreen.kt`, `app/src/main/java/eu/kanade/tachiyomi/ui/setting/connections/DiscordLoginActivity.kt`, `app/src/main/AndroidManifest.xml` (Discord activity/service declarations), `app/src/main/java/eu/kanade/tachiyomi/App.kt`, `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerActivity.kt` |
| Android TV / Fire TV support | Found | `app/src/main/AndroidManifest.xml` (`android.software.leanback`, `LEANBACK_LAUNCHER`, `android:banner`), `app/src/main/java/eu/kanade/tachiyomi/util/system/TvUtils.kt`, `app/src/main/res/values/ic_banner_background.xml`, `app/src/main/res/mipmap*/ic_banner*` |
| Feed tab | Partially found | No feed tab in current `HomeScreen` navigation (`Library/Updates/History/Browse/More` only) at `app/src/main/java/eu/kanade/tachiyomi/ui/home/HomeScreen.kt`; feed persistence/domain still present: `data/src/main/sqldelight/tachiyomi/data/feed_saved_search.sq`, `data/src/main/java/tachiyomi/data/source/FeedSavedSearchRepositoryImpl.kt`, `domain/src/main/java/tachiyomi/domain/source/interactor/*Feed*`, wiring in `app/src/main/java/eu/kanade/domain/SYDomainModule.kt` |
| NSFW / lewd filter | Found | `domain/src/main/java/tachiyomi/domain/library/service/LibraryPreferences.kt` (`pref_filter_library_lewd_v2`), `app/src/main/java/eu/kanade/presentation/more/settings/screen/SettingsBrowseScreen.kt` (NSFW settings), `app/src/main/java/eu/kanade/tachiyomi/extension/util/ExtensionLoader.kt` (load NSFW source), plus incognito-wide wiring in `app/src/main/java/eu/kanade/tachiyomi/App.kt` and `MainActivity.kt` |
| Panorama / wide cover display | Not clearly found | No obvious `panorama`/`wide cover` implementation located via code search. Likely absent already or folded into generic cover layouts; verify with UI acceptance pass before deleting anything. |
| Manual anime info editing | Found | `app/src/main/java/eu/kanade/tachiyomi/ui/anime/EditAnimeDialog.kt`, `app/src/main/java/eu/kanade/tachiyomi/ui/anime/AnimeScreen.kt`, `app/src/main/java/eu/kanade/tachiyomi/ui/anime/AnimeScreenModel.kt` |
| Custom theme color palettes / picker | Found | `app/src/main/java/eu/kanade/presentation/more/settings/screen/SettingsAppearanceScreen.kt`, `app/src/main/java/eu/kanade/presentation/more/settings/screen/appearance/AppCustomThemeColorPickerScreen.kt`, `app/src/main/java/eu/kanade/presentation/more/settings/widget/AppThemePreferenceWidget.kt`, `app/src/main/java/eu/kanade/domain/ui/model/AppTheme.kt`, `app/build.gradle.kts` (`materialKolor`, `compose.colorpicker`) |
| Onboarding / getting started flow | Found | `app/src/main/java/eu/kanade/tachiyomi/ui/more/OnboardingScreen.kt`, `app/src/main/java/eu/kanade/presentation/more/onboarding/*`, `app/src/main/java/eu/kanade/tachiyomi/ui/main/MainActivity.kt` (`ShowOnboarding()`) |
| Telemetry / Firebase module | Found | `telemetry/` module (`telemetry/build.gradle.kts`), root plugin aliases in `build.gradle.kts`, conditional plugin apply in `app/build.gradle.kts`, `app/google-services.json`, app startup path in `app/src/main/java/eu/kanade/tachiyomi/App.kt` (`TelemetryConfig.init`) |
| Localization overlays + flagkit | Found | modules `i18n/`, `i18n-ank/`, `i18n-kmk/`, `i18n-sy/`, `flagkit/`; references in `settings.gradle.kts`, `app/build.gradle.kts`, `core/common/build.gradle.kts`, `domain/build.gradle.kts`, `source-local/build.gradle.kts`, `presentation-core/build.gradle.kts`, `presentation-widget/build.gradle.kts` |
| Macrobenchmark module | Found | `macrobenchmark/`, inclusion in `settings.gradle.kts`, benchmark plugin/deps in `macrobenchmark/build.gradle.kts`, app `benchmark` build type in `app/build.gradle.kts` |
| Preview + benchmark variants | Found | `app/build.gradle.kts`: `preview`, `benchmark`, also `releaseTest`, `foss` build types and preview/benchmark sourceSets |
| Auto-update system (keep, retarget) | Found | `app/src/main/java/eu/kanade/tachiyomi/data/updater/*`, `app/src/main/java/eu/kanade/tachiyomi/ui/main/MainActivity.kt`, release lookup in `data/src/main/java/tachiyomi/data/release/ReleaseServiceImpl.kt`, release policy in `domain/src/main/java/tachiyomi/domain/release/interactor/GetApplicationRelease.kt`, repo/tag constants in `app/src/main/java/eu/kanade/tachiyomi/data/updater/AppUpdateChecker.kt` |
| Community files | Found | `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, `.github/FUNDING.yml` |

## Additional repo-level cleanup anchors

- Localization infra file(s): `.weblate` (if present in fork baseline; not present in this workspace root listing).
- Manifest OAuth hosts tied to removable trackers: `bangumi-auth`, `shikimori-auth`, `simkl-auth` in `app/src/main/AndroidManifest.xml`.
- Tracker OAuth handlers for removable trackers in `app/src/main/java/eu/kanade/tachiyomi/ui/setting/track/TrackLoginActivity.kt`.
- Build property gates that influence stripping sequence:
  - `buildSrc/src/main/kotlin/mihon/buildlogic/BuildConfig.kt`
  - `app/build.gradle.kts` (`Config.includeTelemetry`, `Config.enableUpdater`).

## Important observations before Pass 1 execution

- Feed appears already removed from top-level navigation, but feed data/domain scaffolding remains.
- `i18n-aniyomi` is included in `settings.gradle.kts` but missing on disk; this inconsistency should be resolved during module cleanup.
- `google-services.json` still exists in `app/`, so telemetry strip must remove both dependency/plugins and artifact file.
