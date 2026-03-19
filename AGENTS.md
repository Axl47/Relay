# NEXUS AGENTS DOCUMENT

## ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `.docs/PLANS.md`) from design to implementation. Write new plans to `.docs/exec/`. If inside Plan Mode, create the plan in a multiline markdown block, and write it after initiating implementation, so you can use the plan to guide your implementation and refer back to it as needed. If outside Plan Mode, you can write the plan directly and refer to it as needed.

## Rule

Always prefix shell commands with `rtk`.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
rtk proxy <cmd>     # Run raw command without filtering
```

## RTK Verification

```bash
rtk --version
rtk gain
which rtk
```

## Development Details

Whenever new updates are made, this file (`AGENTS.md`) should be updated with any surprising files not apparent from the codebase that could benefit other developers. Focus on the why and when it could be useful.

- The repository root `.docs` path is a directory again. Write new ExecPlans under `.docs/exec/`; if `.docs/PLANS.md` is still absent, follow the nearby ExecPlans in `.docs/exec/` or `docs/relay-implementation-plan.md` for structure until a dedicated template is restored.
- `web/docker-compose.yml` is the Dokploy entrypoint for the web workspace, while `web/deploy/docker-compose.yml` stays dev-only. Check `web/deploy/dokploy/` first when Dokploy builds or startup healthchecks fail, and remember that `NEXT_PUBLIC_API_URL` is baked into the client image at build time, so changing the public API domain requires rebuilding the `client` service. Dokploy should route the public web app to `client` on port `3009`.
- `web/packages/contracts/src/index.ts` is the first file to check when the web client redesign needs richer page payloads, because the Next.js routes and Fastify API share their screen-facing schemas there and progress-aware changes to Library, Detail, Watch, Settings, or Providers usually start as contract additions before the page components can move.
- `web/apps/api/src/services/relay-service.ts` now owns the web-facing dashboard/detail/watch/history view-model aggregation as well as the `library_items.lastEpisodeNumber` / `lastWatchedAt` progress bookkeeping. Check it first when Resume buttons, Continue Watching rows, grouped history, or watch-side episode state look stale, because those UIs now depend on the service enriching raw catalog/progress rows before the client renders them.
- `web/apps/api/src/app.ts` and `web/apps/api/src/services/relay-service.ts` are the first files to check when AnimePahe playback reaches Relay but Firefox still aborts after the manifest loads, because `vault-*.owocdn.top` HLS media segments are disguised as `.jpg` paths and upstream labels them as `image/jpeg`. Relay now rewrites those segment URLs with a `~relay.ts` alias and normalizes the proxied response type to `video/mp2t`; without both, clients can keep treating encrypted TS fragments as images instead of media segments.
- `web/apps/client/components/video-player.tsx` and `web/apps/api/src/app.ts` are the next files to check when AnimePahe still fails specifically in Firefox after the manifest, key, and first segment all load, because the stream audio is implicit HE-AACv2 inside MPEG-TS and `hls.js` derives an `mp4a.40.1` init segment that Firefox rejects or decodes with an AAC cookie error. Relay now works around that with a Firefox-targeted `/playback/sessions/:id/compat.mp4` fallback that transcodes the audio to AAC-LC through `ffmpeg` into a cached `faststart` MP4 with range support, so verify the client switched to the compat route, that the API still uses `-extension_picky 0` for AnimePahe’s disguised `.jpg` HLS segments, and that the cached compat file exists when users say the scrubber only knows about buffered ranges.
- `web/packages/providers/src/base/provider-utils.ts` owns the shared HTML challenge detector used by HTTP providers. Check it first when Cloudflare-backed sites suddenly flip from working to `challenge-protected`, because some hosts now inject `/cdn-cgi/challenge-platform/scripts/jsd/main.js` on otherwise normal pages and that script alone should not be treated as a blocking interstitial.
- `web/packages/providers/src/providers/javguru.ts` intentionally filters search results down to numeric `/<post-id>/<slug>/` permalinks. Use that file first when Javguru starts returning static pages like `advanced-search` or `jav-actress-list`, because the site mixes page links into search markup and broad anchor scraping will surface junk results.
- `web/packages/providers/src/providers/aniwave.ts` applies provider-side title relevance filtering on top of `/filter?keyword=...`. Check that file first when Aniwave starts returning a page full of loosely related cards, because the site search can include broad substring matches that look populated but are not actually relevant to the user query.
- `web/apps/client/app/(dashboard)/discover/page.tsx`, `web/apps/client/app/(dashboard)/anime/[providerId]/[externalAnimeId]/page.tsx`, and `web/apps/client/app/(dashboard)/watch/[libraryItemId]/[episodeId]/page.tsx` must encode IDs when building URLs and decode dynamic route params before reusing them in API calls. Check those routes when providers use slash-containing IDs like Javguru, otherwise params get split or double-encoded and users land on 404s / in-page `Not found`.
- `web/apps/api/src/app.ts` now owns slash-safe catalog query endpoints and the same-origin `/media/proxy` route used by the web client for remote cover images. Check it together with `web/apps/client/lib/media.ts` when external IDs contain `/` or browsers block posters with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.
- `web/packages/providers/src/providers/javguru.ts` now prefers the shortcode button payloads over raw iframe scraping, and it promotes the Dood-style `STREAM DD` host into a direct MP4 before falling back to iframe embeds. Check it together with `web/apps/api/src/services/relay-service.ts` when Javguru playback falls back to a black screen or `Embeds disabled`, because stale sessions that cached old HTML/embed/HLS URLs also need to be treated as non-reusable, and Dood embed pages can include Turnstile scripts while still exposing a valid `pass_md5` player config.
- `web/apps/browser/src/extractors/aki-h.ts` is the first place to check when Aki-H playback breaks, because the provider only scrapes search/details/episodes over HTTP and the real stream comes from a referer-locked browser chain that eventually surfaces `aki-h.stream/file...` HLS playlists. If Aki-H starts returning 403s or blank playback, re-verify the `v.aki-h.com` play click, the `aki-h.stream/file|quality` response capture, and the `referer` header derived from `https://aki-h.stream/v/<id>`.
- `web/apps/browser/src/extractors/animepahe.ts`, `web/apps/browser/src/extraction-service.ts`, and `web/apps/api/src/services/relay-service.ts` are the first files to check when AnimePahe search or playback starts failing, because the site’s first-party JSON APIs are hidden behind DDoS-Guard and the real video only appears after the play page hands off to `kwik.cx`, which then requests an HLS manifest from `vault-99.owocdn.top`. Re-verify the challenge wait loop, the `data-src` extraction from `/play/<anime>/<episode>`, the captured `kwik` `referer`/`origin` headers, and the AnimePahe stale-session guard in playback reuse before changing anything deeper in the stack.
- `web/apps/api/src/app.ts` rewrites HLS playlists onto `/stream/:sessionId/...` paths, so never forward the upstream `content-length` or `content-range` headers when a playlist body is being rewritten. Check that function first when Firefox reports `NS_BINDING_ERROR` or players fail only on proxied HLS manifests, because stale upstream length headers can describe the pre-rewrite body and cause the browser to abort the response.
- `web/apps/browser/src/extractors/animeonsen.ts` is the first file to check when AnimeOnsen search/details/playback break, because the provider now mixes three different paths: Meilisearch for search, `api.animeonsen.xyz/v4/content/<content_id>/episodes|video/<episode>` for data, and the challenged site only as a metadata fallback. Re-verify the bearer tokens, `ao-content-id` extraction, and episode payload shape before assuming the stream host itself changed.
- `web/apps/browser/src/extractors/animetake.ts` is the first file to check when AnimeTake search/details/playback break, because the extractor now depends on three fallback layers that are easy to confuse: A-Z listing pages (`/az-all-anime/<letter>?page=<n>`) for search and latest-episode hints, detail-page scraping for metadata and explicit episode links, and playback capture that prefers direct media requests but can fall back to inline `/redirect...` or iframe embeds. Check that file first when Cloudflare starts blocking the broker again or AnimeTake changes its listing pagination / player script shape.
- `web/apps/browser/src/extractors/hentaihaven.ts`, `web/apps/browser/src/browser/context-manager.ts`, and `web/apps/api/src/services/relay-service.ts` are the first files to check when HentaiHaven search/details/playback regress, because the extractor depends on the current `/search/<query>/`, `/watch/<slug>/`, and `wp-content/plugins/player-logic/api.php` flow while the site's Cloudflare gate only clears in Relay after the shared browser context presents a normal desktop profile, the iframe `data` token can be decoded into the `api.php` `action/a/b` POST without waiting on the network listener, and HLS playback needs Relay's proxy path for `octopusmanifest.org` / `fdc.anpustream.com` so mislabelled Anpu fMP4 fragments do not hit Firefox directly. Stale HentaiHaven sessions must be treated as non-reusable whenever they are `text/html` or anything other than `proxy` mode, otherwise Relay can keep serving old redirect-based playback chains after the resolver changes. Re-verify the `.page-item-detail.video` search cards, `.wp-manga-chapter` episode links, the `player_logic_item iframe`, the decoded `api.php` request parts, the `api.php` `octopusmanifest.org` response, proxied HLS behavior, and HentaiHaven session reuse behavior before changing anything deeper in the stack.
- `web/apps/browser/src/extractors/hentaihaven.ts`, `web/apps/browser/src/browser/context-manager.ts`, `web/apps/browser/src/extraction-service.ts`, and `web/apps/api/src/services/relay-service.ts` are the first files to check when HentaiHaven search/details/playback regress, because the extractor depends on the current `/search/<query>/`, `/watch/<slug>/`, and `wp-content/plugins/player-logic/api.php` flow while the site's Cloudflare gate only clears in Relay after the shared browser context presents a normal desktop profile, the iframe `data` token can be decoded into the `api.php` `action/a/b` POST without waiting on the network listener, and HLS playback needs Relay's proxy path for `octopusmanifest.org` / `fdc.anpustream.com` so mislabelled Anpu fMP4 fragments do not hit Firefox directly. Stale HentaiHaven sessions must be treated as non-reusable whenever they are `text/html` or anything other than `proxy` mode, otherwise Relay can keep serving old redirect-based playback chains after the resolver changes. HentaiHaven now also uses an ephemeral browser context in `context-manager.ts` with no cookie-jar reuse, because persisting playback-state cookies was enough to leave later searches stuck on Cloudflare challenge pages even after a context reset.
- `web/apps/api/src/app.ts` is the companion file to check when HentaiHaven reaches Relay's proxied HLS path but Firefox still spins with `NS_BINDING_ABORTED`, because the provider's `octopusmanifest.org` master playlists advertise subtitle renditions whose `URI`s are raw `.vtt` files rather than HLS subtitle playlists. Relay now strips those `TYPE=SUBTITLES` entries for HentaiHaven during HLS rewriting so `hls.js` uses Relay's separate subtitle tracks instead of trying to parse `WEBVTT` as `#EXTM3U`.
- `web/apps/api/src/app.ts` and `web/apps/api/src/services/relay-service.ts` are the first files to check when HLS playback stalls on proxied `__upstream__` fragment requests even though the manifest itself loads, because some upstream hosts such as HentaiHaven's `fdc.anpustream.com` mislabel binary fMP4 media as playlists or images (`i.mp4` as `application/x-mpegURL`, `ha*.jpg` / `snd*.jpg` as `image/jpeg`) and some clients key off the local proxy URL suffix as well as the response headers. Keep HLS playlist rewriting path-aware there, normalize those response content types, and preserve the `~relay.mp4` alias stripping in `RelayService` so Relay does not serve fMP4 fragments with misleading headers or `.jpg` proxy paths.
- `web/apps/client/components/video-player.tsx` is the companion file to check when providers return a valid stream session but the browser still says no supported format was found, because DASH manifests now rely on `dashjs` there while HLS still uses `hls.js`. Check it together with `web/apps/api/src/app.ts` when a provider resolves to `.mpd`, because the client needs DASH attachment and the API stream proxy still has to serve relative manifest subrequests correctly.
- `web/apps/api/src/lib/subtitles.ts` and `web/apps/client/app/globals.css` are the first files to check when AnimeOnsen subtitles load but look out of order or visually wrong, because the provider serves ASS without file extensions and Relay now approximates that by converting ASS `\pos(x,y)` tags into WebVTT cue placement while styling browser `::cue` output to remove the default black boxes. Re-verify the ASS-to-VTT placement math and cue styling before assuming the subtitle URLs themselves changed.
- `web/packages/providers/src/providers/aniwave.ts` should prefer MyCloud/Cloudora over Vidplay from `/ajax/server/list`, and `web/apps/api/src/services/relay-service.ts` is the companion file to check when old sessions keep redirecting to dead `shipimagesbolt.online/embed-1/...` pages. Use those two files first when Aniwave says a file was deleted while the same episode still works on-site, because Vidplay often maps to dead `embed-1` tokens while MyCloud/Cloudora still return usable embeds, and prefetching the chosen embed URL can invalidate the token before the client opens it.

## Sub Agents

Use sub-agents where appropriate to break down complex changes into manageable pieces, and to allow for more focused implementation and testing. For example, if implementing a new feature that requires both backend and frontend changes, you might create separate sub-agents for each layer of the stack, but before then use an exploring agent (or multiple) to get context on the codebase and research the best approaches for the feature, outline the specific steps needed for implementation into a final exec plan, and spin up task subagents that handle the implementation. This allows for more efficient development and testing, as each sub-agent can focus on a specific aspect of the implementation, and can be tested independently before being integrated into the larger codebase.

## Final Output

When asking the user to verify implemented changes, output a checklist they can fill to make sure everything works as intended. Describe what they should see, how it should work, and what they need to manually test. The user will then fill in the checklist and provide feedback on any issues they encounter, which can be used to further refine the implementation.

If the user asked for multiple changes and only some were implemented, make sure to clearly indicate which ones were completed, which ones were not fully realized, and which ones are still pending. For example:

```txt
- [x] Implement app scaffold (completed with basic layout and navigation)
- [~] Implement feature A (stub implementation completed)
- [ ] Implement feature B (pending due to X reason)
```

Include a commit message after each implementation or fix, following the Conventional Commits specifications. If it's a large change, follow this format:

```txt
feat(update): add startup update prompt choices and sectioned changelog pipeline
- feat(update): gate startup updates behind user choice (Yes/No/Remind Later)
- feat(update): persist per-release prompt decisions (ignore until newer, 24h remind-later)
- refactor(update): split updater flow into eligibility check and install phases
- feat(update): parse GitHub release body into sectioned changelog blocks for in-app prompt
- test(update): add updater decision/state-store/changelog parser coverage
- feat(ci): generate release notes sections from commit metadata and publish via body_path
- feat(ci): support multi-section changelog from Conventional Commit lines in commit body
- fix(navigation): clamp bottom navbar sizing to prevent tiny rendering on some phones
- fix(navigation): make top-level tab swipe detection more reliable in Explore
- fix(search): move Explore apply+navigate to app scope to prevent canceled loads on slower devices
- docs(readme): document updater prompt behavior and changelog contract
```
