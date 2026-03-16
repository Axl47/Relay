# Implement HentaiHaven browser extraction

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repository's ExecPlan requirements described in `.docs`.

## Purpose / Big Picture

After this change, Relay can use the existing `hentaihaven` browser-only provider metadata to search HentaiHaven titles, read an entry's metadata and episode list, and resolve direct playback streams from the site's current player flow instead of returning `Browser extraction provider "hentaihaven" is not implemented yet.` A developer should be able to exercise the browser app against `https://hentaihaven.xxx/search/<query>/`, `https://hentaihaven.xxx/watch/<slug>/`, and `https://hentaihaven.xxx/watch/<slug>/episode-<n>/` and receive structured Relay responses backed by the site's current WordPress and `player-logic` pages.

## Progress

- [x] (2026-03-16 20:33Z) Inspect the browser extractor contract, provider wiring, and ExecPlan requirements.
- [x] (2026-03-16 20:33Z) Confirm `hentaihaven` is already declared in provider metadata and browser routing but still resolves to `UnimplementedProviderExtractor`.
- [x] (2026-03-16 20:48Z) Probe live HentaiHaven pages and capture the current search, detail, episode, and playback flow.
- [x] (2026-03-16 20:48Z) Verify that HentaiHaven's Cloudflare gate blocks the default Playwright context and loads normally with a realistic desktop browser profile.
- [x] (2026-03-16 21:10Z) Implement `web/apps/browser/src/extractors/hentaihaven.ts`.
- [x] (2026-03-16 21:10Z) Register the extractor and update the browser context profile used by the browser service.
- [x] (2026-03-16 21:11Z) Update `AGENTS.md` with the HentaiHaven maintenance note.
- [x] (2026-03-16 21:15Z) Run `rtk proxy npm --prefix web/apps/browser run typecheck`.
- [x] (2026-03-16 21:15Z) Validate HentaiHaven search, anime details, episodes, playback streams, and subtitles through a live `BrowserExtractionService` probe.

## Surprises & Discoveries

- Observation: HentaiHaven's Cloudflare interstitial blocks the browser service's default headless context, but the same site loads normally once the context uses a realistic desktop user agent, viewport, locale, and timezone.
  Evidence: a local Playwright probe stayed on `Just a moment...` with the default context and returned the real `/hentai/` content after switching to a desktop Chromium profile.
- Observation: the episode page already embeds the current player iframe and automatically calls `wp-content/plugins/player-logic/api.php`, so playback does not require clicking a host selector first.
  Evidence: visiting `https://hentaihaven.xxx/watch/natsu-to-hako/episode-1/` triggered `player.php?data=...` and an immediate `api.php` response containing an `octopusmanifest.org/.../playlist.m3u8` source.
- Observation: episode list entries expose release dates, thumbnail images, and preview videos directly on the anime detail page.
  Evidence: `.wp-manga-chapter` entries on `/watch/natsu-to-hako/` contained `img.shadow`, `video.hover-preview-video`, and release-date markup.

## Decision Log

- Decision: implement search against HentaiHaven's canonical `/search/<query>/` route and rank results locally instead of scraping the generic `/hentai/` listing.
  Rationale: the site already returns query-specific result pages with stable `.page-item-detail` cards and paginated `/page/<n>/` paths, which is more precise than the front-page listing.
  Date/Author: 2026-03-16 / Codex
- Decision: resolve playback from the player API response first and keep the iframe URL only as a `text/html` fallback.
  Rationale: the API response already exposes the direct HLS source that Relay can proxy immediately, while the iframe remains useful when the API stops returning direct sources.
  Date/Author: 2026-03-16 / Codex
- Decision: fix HentaiHaven's Cloudflare issue at the shared browser-context layer instead of only inside the extractor.
  Rationale: the extractor cannot control context options before navigation, so the browser service itself must create a realistic desktop context for this provider to load at all.
  Date/Author: 2026-03-16 / Codex

## Outcomes & Retrospective

Relay now has a concrete HentaiHaven browser extractor, and the shared browser service creates the desktop browser context HentaiHaven needs to move past Cloudflare. The extractor resolves search results from `/search/<query>/`, metadata and episodes from `/watch/<slug>/`, and direct HLS playback from the `player-logic` API, while still keeping the player iframe as a fallback embed stream.

The main lesson from this change is that HentaiHaven was not blocked by missing scraper logic alone; the browser service itself needed a more realistic context profile before any extractor could see the site's real HTML. With that in place, the rest of the implementation was mostly selector and network-capture work against a stable WordPress and `player-logic` flow.

## Context and Orientation

Relay's browser service lives under `web/apps/browser/src/`. `web/apps/browser/src/extractors/types.ts` defines the `BrowserProviderExtractor` contract that every browser-only provider must implement. `web/apps/browser/src/extractors/registry.ts` registers extractors by provider ID, while `web/apps/browser/src/extraction-service.ts` maps `hentaihaven` to `https://hentaihaven.xxx`. `web/packages/providers/src/providers/hentaihaven.ts` already exposes HentaiHaven as a browser-only adult provider, so the missing work is entirely in the browser app plus maintainer documentation.

HentaiHaven's live site is a WordPress install with a custom `player-logic` plugin. The current page shapes are:

- `https://hentaihaven.xxx/search/<query>/` for search results.
- `https://hentaihaven.xxx/watch/<slug>/` for anime details and the episode list.
- `https://hentaihaven.xxx/watch/<slug>/episode-<n>/` for playback.

The episode page injects `player_logic` configuration, embeds a same-origin `player.php?data=...` iframe, and then requests `wp-content/plugins/player-logic/api.php`. That API responds with direct playback sources such as `https://octopusmanifest.org/<id>/playlist.m3u8` plus authorization metadata. Subtitle files are fetched separately from the same manifest host and currently appear as `.ass` files like `/s/en.ass`.

## Plan of Work

Create `web/apps/browser/src/extractors/hentaihaven.ts`. In that file, add a readiness loop that waits past Cloudflare's interstitial text and then confirms the expected HentaiHaven content is present. Define helpers to normalize anime and episode IDs, clean text, build search/detail/episode URLs, rank titles against the query, and parse year, page count, release dates, and episode numbers from the current WordPress markup.

Implement search by loading the canonical `/search/<query>/` page for the requested Relay page number, scraping `.page-item-detail` cards, extracting the `/watch/<slug>/` target, title, alternative title, cover image, and release year, then ranking the page's items against the query. Return `requiresAdultGate: true` and `contentClass: "hentai"` for every result.

Implement `getAnime` and `getEpisodes` from the same detail-page snapshot. Load `/watch/<slug>/`, scrape the cover image, synopsis, genres, release years, and episode links from `.post-content_item`, `.description-summary`, and `.wp-manga-chapter`. Map the snapshot into `AnimeDetails` and `EpisodeList`, using the chapter thumbnails and release dates when present.

Implement `resolvePlayback` by loading `/watch/<slug>/<episode-id>/`, listening for `api.php` responses, direct media requests, and subtitle requests, then preferring the structured API payload over looser network matches. If the API response exposes no usable direct source, fall back to the embedded `player.php?data=...` iframe as a `text/html` redirect stream. Return any observed subtitle URLs as Relay subtitle tracks.

Update `web/apps/browser/src/browser/context-manager.ts` so new browser contexts use the same desktop profile that was proven to pass HentaiHaven's Cloudflare gate in local probes. Register the extractor in `web/apps/browser/src/extractors/registry.ts`, and add an `AGENTS.md` note that points maintainers to the HentaiHaven extractor and browser context manager when Cloudflare or the `player-logic` flow changes.

## Concrete Steps

From the repository root `/Users/axel/Desktop/Code_Projects/Personal/Relay`, perform the following:

1. Edit `web/apps/browser/src/browser/context-manager.ts` to create browser contexts with a realistic desktop user agent, viewport, locale, and timezone.
2. Add `web/apps/browser/src/extractors/hentaihaven.ts` with search, anime, episodes, and playback resolution.
3. Edit `web/apps/browser/src/extractors/registry.ts` to import and register `HentaiHavenExtractor`.
4. Edit `AGENTS.md` to record the HentaiHaven maintenance note.
5. Run:

    rtk proxy npm --prefix web/apps/browser run typecheck

6. Run a targeted local probe that imports the extractor, opens real HentaiHaven pages through Playwright, and verifies search/details/episodes/playback behavior.

## Validation and Acceptance

Acceptance is behavior-based:

- Before the change, any HentaiHaven browser extraction request returns a 501 unimplemented-provider error.
- After the change, Relay can search HentaiHaven, fetch anime metadata, fetch episode lists, and resolve a direct HLS stream from the site's current `player-logic` API flow.
- The browser service no longer stalls on HentaiHaven's Cloudflare interstitial when using its shared browser context.
- `rtk proxy npm --prefix web/apps/browser run typecheck` succeeds.
- A targeted local probe for `Natsu to Hako` should return:
  - a search result containing `/watch/natsu-to-hako/`,
  - anime details with title `Natsu to Hako`,
  - episode entries including `episode-1` and `episode-2`,
  - a playback resolution whose default stream points at `octopusmanifest.org/.../playlist.m3u8` or a future equivalent direct media URL.

## Idempotence and Recovery

These edits are additive and safe to repeat. Recovery is limited to re-editing the extractor or browser context defaults and rerunning the browser-app typecheck and live probe. No migrations or destructive repository operations are involved.

## Artifacts and Notes

Observed live playback flow for `https://hentaihaven.xxx/watch/natsu-to-hako/episode-1/`:

    iframe: https://hentaihaven.xxx/wp-content/plugins/player-logic/player.php?data=...&lang=en
    api:    https://hentaihaven.xxx/wp-content/plugins/player-logic/api.php
    source: https://octopusmanifest.org/<id>/playlist.m3u8
    subs:   https://octopusmanifest.org/<id>/s/en.ass

Observed search and detail selectors:

    search cards:   .page-item-detail.video
    detail metadata: .post-content_item
    synopsis:       .description-summary .summary__content
    episode list:   .wp-manga-chapter
    player iframe:  .player_logic_item iframe

## Interfaces and Dependencies

`web/apps/browser/src/extractors/hentaihaven.ts` must export:

    export class HentaiHavenExtractor implements BrowserProviderExtractor

The extractor should throw `BrowserExtractionError` with code `challenge_failed` when the page never progresses past Cloudflare and `upstream_error` when the page loads but expected search/detail/player data is missing.

Revision note: created the plan after live-site research so implementation can proceed against the observed HentaiHaven page structure, Cloudflare behavior, and `player-logic` API flow.
