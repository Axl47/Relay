# Working List
## Pending
- [ ] None

## In Progress
- [ ] None

## Done
- [x] Implement 403/download reliability hardening
- [x] Add shared stream header/cookie resolver utility in `app/src/main/java/eu/kanade/tachiyomi/ui/player/StreamRequestHeaders.kt`
- [x] Add unit tests for stream header merge/format in `app/src/test/java/eu/kanade/tachiyomi/ui/player/StreamRequestHeadersTest.kt`
- [x] Integrate resolver into internal player header setup in `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerActivity.kt`
- [x] Add runtime HTTP playback fallback in `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerObserver.kt`, `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerActivity.kt`, and `app/src/main/java/eu/kanade/tachiyomi/ui/player/PlayerViewModel.kt`
- [x] Extend hoster loader with resolved candidate list API in `app/src/main/java/eu/kanade/tachiyomi/ui/player/loader/HosterLoader.kt`
- [x] Add unit tests for resolved candidate ordering/filtering in `app/src/test/java/eu/kanade/tachiyomi/ui/player/loader/HosterLoaderTest.kt`
- [x] Upgrade downloader to exhaust candidates and improve terminal errors in `app/src/main/java/eu/kanade/tachiyomi/data/download/Downloader.kt`
- [x] Integrate resolver into downloader ffmpeg/external header usage in `app/src/main/java/eu/kanade/tachiyomi/data/download/Downloader.kt`
- [x] Run targeted tests: `./gradlew :app:testDebugUnitTest --tests "eu.kanade.tachiyomi.ui.player.StreamRequestHeadersTest" --tests "eu.kanade.tachiyomi.ui.player.loader.HosterLoaderTest"`
- [x] Run compile gate: `./gradlew :app:compileDebugKotlin`
- [x] Plan finalized and locked decisions captured
- [x] Set up remediation execution checklist
- [x] Restore upstream English strings into `core/common/src/main/res/values/strings.xml` with Relay branding and compatibility aliases
- [x] Add one-time official extension repo bootstrap in `app/src/main/java/eu/kanade/tachiyomi/extension/api/ExtensionApi.kt`
- [x] Run compile gate: `./gradlew :app:compileDebugKotlin`
- [x] Run build gate: `./gradlew :app:assembleDebug`

## Blocked
- [!] Manual smoke checks (fresh install bootstrap, existing repos unchanged, labels readable) require device/emulator runtime interaction
