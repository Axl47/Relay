# Working List
## Pending
- [ ] Pass 1: Strip & Rebrand baseline
- [ ] Pass 2: Source fallback chain
- [ ] Pass 3: AniSkip integration
- [ ] Pass 4: Playback profiles + audio normalization
- [ ] Pass 5: Filler marking + smart completion
- [ ] Pass 6: Bookmarks/clips/screenshots
- [ ] Pass 7: Binge mode + gesture customization

## In Progress
- [~] Pass 1: Strip & Rebrand baseline

## Done
- [x] Initialize implementation orchestration from spec + plan
- [x] Pass 0.1: Create `docs/MODULE_MAP.md`
- [x] Pass 0.2: Create `docs/TRACKER_MAP.md`
- [x] Pass 0.3: Create `docs/CUT_MAP.md`
- [x] Pass 0.4: Create `docs/PLAYER_MAP.md`
- [x] Pass 0.5: Create `docs/SCHEMA_MAP.md`
- [x] Pass 0.6: Create `docs/BUILD_MAP.md`

## Verification Log
- Pass 0.1: Updated file `docs/MODULE_MAP.md` only. No tests run (documentation-only change); confidence signal was direct path/dependency extraction from current Gradle/module files.
- Pass 0.2: Updated file `docs/TRACKER_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from tracker registry, tracker package layout, manifest deeplinks, and tracker-facing UI files.
- Pass 0.3: Updated file `docs/CUT_MAP.md` only. No tests run (documentation-only change); confidence signal was direct feature-to-file mapping across app/domain/data/manifest/build files.
- Pass 0.4: Updated file `docs/PLAYER_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from player activity/viewmodel/loader code and mpv integration points.
- Pass 0.5: Updated file `docs/SCHEMA_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from SQLDelight schema/view/migration files and track repository mappings.
- Pass 0.6: Updated file `docs/BUILD_MAP.md` only. No tests run (documentation-only change); confidence signal was direct extraction from app/root/buildSrc Gradle files, version catalogs, manifest, and updater implementation paths.
- Pass 1 (partial): Updated Gradle/settings/module layout for baseline strip (removed i18n/flagkit/telemetry/macrobenchmark modules, trimmed build types/plugins/dependencies, bumped SDK config, removed `app/google-services.json`), reduced active tracker surface to MAL+AniList in manager/settings/login flow, and removed manifest declarations for TV launcher, Google Drive login, Discord components, and non-MAL/AniList tracker auth hosts while preserving dual `relay`/`anikku` scheme compatibility during migration. No tests run yet (per instruction).
