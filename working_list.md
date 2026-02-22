# Working List
## Pending
- [ ] Pass 2: Source fallback chain
- [ ] Pass 3: AniSkip integration
- [ ] Pass 4: Playback profiles + audio normalization
- [ ] Pass 5: Filler marking + smart completion
- [ ] Pass 6: Bookmarks/clips/screenshots
- [ ] Pass 7: Binge mode + gesture customization

## In Progress
- [ ] Pass 2.1: Source health + anime source priority schema/repository
- [ ] Pass 2.2: Player fallback integration + status indicator
- [ ] Pass 2.3: Source priority editor UI on anime detail

## Done
- [x] Initialize implementation orchestration from spec + plan
- [x] Pass 0.1: Create `docs/MODULE_MAP.md`
- [x] Pass 0.2: Create `docs/TRACKER_MAP.md`
- [x] Pass 0.3: Create `docs/CUT_MAP.md`
- [x] Pass 0.4: Create `docs/PLAYER_MAP.md`
- [x] Pass 0.5: Create `docs/SCHEMA_MAP.md`
- [x] Pass 0.6: Create `docs/BUILD_MAP.md`
- [x] Pass 1 (Option 2): Replace deleted i18n modules with local compatibility shims/resources and restore `assembleDebug` progression to app compile stage
- [x] Pass 1 (Option 3, targeted): Remove/stub remaining removed-feature dependencies to reach successful `assembleDebug`
- [x] Pass 1.1: Fully remove SyncYomi + Google Drive sync surfaces
- [x] Pass 1.2: Fully remove Discord RPC surfaces
- [x] Pass 1.3: Fully remove onboarding flow
- [x] Pass 1.4: Fully remove NSFW/lewd filter surfaces
- [x] Pass 1.5: Fully remove custom theme color-picker surfaces
- [x] Pass 1.6: Fully remove feed/saved-search leftover domain+data surfaces
- [x] Pass 1.7: Fully remove deprecated trackers (Kitsu/Shikimori/Bangumi/Simkl)
- [x] Pass 1.8: Remove remaining TV/community artifacts
- [x] Compile verification after Pass 1 cuts (`:app:compileDebugKotlin`)
- [x] Pass 2 core foundation: added `source_health` + `anime_source_priority` tables/migration and wired fallback health recording/order logic into `PlayerViewModel`

## Verification Log
- Pass 0.1: Updated file `docs/MODULE_MAP.md` only. No tests run (documentation-only change); confidence signal was direct path/dependency extraction from current Gradle/module files.
- Pass 0.2: Updated file `docs/TRACKER_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from tracker registry, tracker package layout, manifest deeplinks, and tracker-facing UI files.
- Pass 0.3: Updated file `docs/CUT_MAP.md` only. No tests run (documentation-only change); confidence signal was direct feature-to-file mapping across app/domain/data/manifest/build files.
- Pass 0.4: Updated file `docs/PLAYER_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from player activity/viewmodel/loader code and mpv integration points.
- Pass 0.5: Updated file `docs/SCHEMA_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from SQLDelight schema/view/migration files and track repository mappings.
- Pass 0.6: Updated file `docs/BUILD_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from app/root/buildSrc Gradle files, version catalogs, manifest, and updater implementation paths.
- Pass 1 (partial): Updated Gradle/settings/module layout for baseline strip (removed i18n/flagkit/telemetry/macrobenchmark modules, trimmed build types/plugins/dependencies, bumped SDK config, removed `app/google-services.json`), reduced active tracker surface to MAL+AniList in manager/settings/login flow, and removed manifest declarations for TV launcher, Google Drive login, Discord components, and non-MAL/AniList tracker auth hosts while preserving dual `relay`/`anikku` scheme compatibility during migration.
- Pass 1 (Option 2): Added local `dev.icerock.moko.resources` shim classes, regenerated `MR/AMR/KMR/SYMR` compatibility objects, generated placeholder string/plural/array resources in `core/common`, removed stale `projects.i18n*` module dependencies from module build files, and added missing app resource placeholders required by manifest/resource linking.
- Pass 1 (Option 3, targeted): Replaced removed-in-fork dependency paths with compile-safe implementations and removed telemetry/crashlytics wiring in `App.kt`.
- Pass 1.1–1.3: Removed SyncYomi/Google Drive/Discord/onboarding runtime + settings surfaces by deleting feature packages/files and stripping remaining imports/calls in app lifecycle, tabs/player/webview, migrations, DI, and settings screens. No tests run (per instruction); confidence signal was zero matches in source scan for removed symbols (`SyncDataJob`, `SyncManager`, `SyncPreferences`, `GoogleDriveService`, `GoogleDriveSyncService`, `DiscordRPCService`, `DiscordScreen`, `OnboardingScreen`, `shownOnboardingFlow`).
- Pass 1.4–1.5: Removed NSFW/lewd toggle plumbing and custom color-picker plumbing (`filterLewd`, `showNsfwSource`, `colorTheme`, `AppTheme.CUSTOM`, `CustomColorScheme`) across preferences, extension filtering, settings, and theme delegate paths. No tests run (per instruction); confidence signal was zero matches in source scan for removed symbols.
- Pass 1.6–1.8: Removed feed/saved-search leftovers (domain/data interactors/models/repos/SQL files and DI registrations), removed tracker implementations for Kitsu/Shikimori/Bangumi/Simkl with status-map cleanup, and removed remaining TV/community artifacts (`TvUtils`, banner resources, community files/templates/funding). No tests run (per instruction); confidence signal was zero matches in source scan for target feature symbols in source code.
