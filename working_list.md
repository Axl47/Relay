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
- [x] Treat stale HentaiHaven `text/html` playback sessions as non-reusable so fresh playback requests re-resolve to direct streams
- [x] Normalize HentaiHaven Anpu fragment response types in `web/apps/api/src/app.ts` so mislabelled `i.mp4`, `ha*.jpg`, and `snd*.jpg` fMP4 payloads are not served as playlists or JPEGs
- [x] Rewrite mislabelled Anpu fragment proxy URLs with a `.mp4` alias suffix and strip that suffix back out in `RelayService`
- [x] Switch HentaiHaven direct HLS/MP4 candidates to `redirect` mode so playback can bypass Relay's fragment proxy when upstream CORS is already open
- [x] Treat stale proxied HentaiHaven HLS sessions as non-reusable so the API stops handing out old `/stream/.../__upstream__/...` playback chains
- [x] Decode the HentaiHaven iframe token into a deterministic `api.php` POST so playback resolution no longer depends on catching the network response in time
- [x] Switch HentaiHaven HLS back to proxy mode so Firefox never fetches Anpu's mislabelled fMP4 fragments directly
- [x] Invalidate stale HentaiHaven redirect sessions too, so the API stops reusing old direct-HLS playback after switching back to proxy mode
- [x] Extend HentaiHaven browser playback timeout and shorten the post-iframe wait so the live browser service can finish extraction before its global deadline
- [x] Reset the HentaiHaven browser context after playback so failed playback pages do not poison subsequent search/detail requests
- [x] Extend the HentaiHaven timeout for search/anime/episodes too, since the forced context reset can trigger another Cloudflare clearance before the next operation
- [x] Move HentaiHaven onto an ephemeral browser context with no cookie-jar reuse so playback-state cookies can no longer poison later searches
