# Working List

## Pending
- [ ] None

## In Progress
- [~] None

## Done
- [x] Inspect `AGENTS.md`, `.docs`, and the browser extractor contract
- [x] Confirm `hentaihaven` is already routed through the browser service but still falls back to `UnimplementedProviderExtractor`
- [x] Probe live HentaiHaven pages and map the current search, detail, episode, and playback structures
- [x] Verify that HentaiHaven's Cloudflare gate passes with a realistic desktop browser context and fails with the default Playwright context
- [x] Implement `web/apps/browser/src/extractors/hentaihaven.ts`
- [x] Register the extractor and update the shared browser context profile
- [x] Update `AGENTS.md` and write the HentaiHaven ExecPlan
- [x] Run `rtk proxy npm --prefix web/apps/browser run typecheck`
- [x] Validate live HentaiHaven search, anime details, episodes, playback streams, and subtitles through `BrowserExtractionService`
- [x] Trace HentaiHaven playback stalls to mislabelled `fdc.anpustream.com` init fragments being rewritten as HLS text by `web/apps/api/src/app.ts`
- [x] Restrict HLS body rewriting to real `.m3u8` or `.m3u` upstream URLs and document the proxy edge case in `AGENTS.md`
- [x] Run `rtk proxy npm --prefix web/apps/api run typecheck` and verify the proxied `i.mp4` fragment still returns MP4 bytes through `/stream/.../__upstream__/...`
