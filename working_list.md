# Working List
## Pending
- [ ] Manual QA scenarios for Passes 5-7 on device/emulator

## In Progress
- [~] None

## Done
- [x] Set up Pass 5-7 combined rollout checklist
- [x] Add Pass 5-7 schema/migration foundations (`133.sqm`-`135.sqm`, SQLDelight tables/queries)
- [x] Thread `episodeType` through episode database/domain/app models and mappers
- [x] Add filler domain/data stack (Jikan API, cache repo, DI wiring, MAL resolution + anime sync flow)
- [x] Add per-anime filler preferences (`hide_filler`, `skip_filler`, next-card countdown) and expose in anime UI
- [x] Implement smart completion chain + post-credits awareness + next-episode transition card logic
- [x] Add capture stack (capture models/repo/table usage) and persist screenshot/bookmark captures
- [x] Implement Bookmarks home tab (capture feed) and move Updates entry to More while preserving shortcuts
- [x] Add bookmark timestamp jump handoff into player start position
- [x] Implement full gesture remap preferences + left-handed mode + long-press ownership
- [x] Add clip/export baseline with downloaded-only guard, auto-download gate, notification progress, and capture feed entry
- [x] Implement binge mode session state, reminders/snooze, background restore, and player toggle/explainer
- [x] Run compile gate: `./gradlew :app:compileDebugKotlin`
- [x] Run unit tests: `./gradlew :app:testDebugUnitTest`
- [x] Run build gate: `./gradlew :app:assembleDebug`

## Blocked
- [!] Manual smoke checks require runtime interaction (device/emulator)
