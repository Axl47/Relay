# Working List
## Pending
- [ ] None

## In Progress
- [ ] None

## Done
- [x] Plan finalized and locked decisions captured
- [x] Set up remediation execution checklist
- [x] Restore upstream English strings into `core/common/src/main/res/values/strings.xml` with Relay branding and compatibility aliases
- [x] Add one-time official extension repo bootstrap in `app/src/main/java/eu/kanade/tachiyomi/extension/api/ExtensionApi.kt`
- [x] Run compile gate: `./gradlew :app:compileDebugKotlin`
- [x] Run build gate: `./gradlew :app:assembleDebug`

## Blocked
- [!] Manual smoke checks (fresh install bootstrap, existing repos unchanged, labels readable) require device/emulator runtime interaction
