# Implement AnimeTake browser extraction

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repository's ExecPlan requirements described in `.docs`.

## Purpose / Big Picture

After this change, Relay can use the existing `animetake` browser-only provider metadata to search AnimeTake titles, read an anime's metadata and episode list, and attempt playback resolution through the browser broker instead of failing with `Browser extraction provider "animetake" is not implemented yet.` A developer should be able to start the browser service, request `animetake` search/details/episodes/playback through the normal provider pipeline, and observe Relay returning structured results or an explicit Cloudflare-related failure instead of a 501 stub.

## Progress

- [x] (2026-03-16 20:30Z) Inspect the browser extractor contract, provider wiring, and ExecPlan requirements.
- [x] (2026-03-16 20:30Z) Confirm `animetake` is already wired into provider metadata and browser-service routing but still falls back to `UnimplementedProviderExtractor`.
- [x] (2026-03-16 20:30Z) Research current AnimeTake URL patterns from indexed pages and older scraper code.
- [x] (2026-03-16 20:35Z) Implement `web/apps/browser/src/extractors/animetake.ts` with search, details, episodes, and playback fallbacks.
- [x] (2026-03-16 20:35Z) Register the extractor in `web/apps/browser/src/extractors/registry.ts`.
- [x] (2026-03-16 20:35Z) Extend AnimeTake browser extraction timeouts in `web/apps/browser/src/extraction-service.ts`.
- [x] (2026-03-16 20:35Z) Update `AGENTS.md` with the AnimeTake maintenance note.
- [x] (2026-03-16 20:37Z) Run `rtk proxy npm --prefix web/apps/browser run typecheck` successfully.
- [ ] Manually validate AnimeTake against a browser context that can pass the site's Cloudflare managed challenge.

## Surprises & Discoveries

- Observation: plain `curl` and local headless Playwright both stop on AnimeTake's Cloudflare managed challenge, so this environment cannot prove live extraction end to end.
  Evidence: `https://animetake.com.co/anime` and `https://animetake.com.co/anime/jigokuraku-2nd-season/episode/3` both returned `Just a moment...` / `Performing security verification` during direct network fetches and a real Playwright session.
- Observation: indexed pages reveal stable public routes even though raw HTML is challenge-protected.
  Evidence: search results exposed `/all-anime-shows`, `/az-all-anime/<letter>?page=<n>`, `/anime/<slug>/`, and current episode routes under `/anime/<slug>/episode/<n>`.
- Observation: older AnimeTake scrapers depended on inline `gstoreplayer.source` payloads and same-origin `/redirect...` links, which suggests the current extractor should keep inline-script and redirect fallbacks even if direct network capture is preferred.
  Evidence: an older `anime_downloader` AnimeTake scraper resolved `gstoreplayer.source` JSON and followed same-origin redirect endpoints before handing playback to provider-specific hosts.

## Decision Log

- Decision: implement search against the A-Z listing pages and rank matches locally instead of depending on an unknown site-search form.
  Rationale: indexed pages confirm the A-Z route shape and pagination query parameter, while the site search form is not observable from this environment.
  Date/Author: 2026-03-16 / Codex
- Decision: make playback resolution prefer directly observed media requests but fall back to inline-source parsing and embed URLs.
  Rationale: this gives the best chance of returning a playable media URL when the browser can fully load the page, while still degrading to an iframe-compatible `text/html` stream when AnimeTake only exposes an embed host.
  Date/Author: 2026-03-16 / Codex
- Decision: document the Cloudflare limitation explicitly instead of treating missing live validation as a silent success.
  Rationale: the extractor should land with clear expectations about what was and was not proven from this environment.
  Date/Author: 2026-03-16 / Codex

## Outcomes & Retrospective

Relay now has a concrete AnimeTake browser extractor wired into the registry, plus a longer extraction timeout for this provider's challenge-heavy pages. The implementation is intentionally fallback-oriented: A-Z list scraping backs search and episode-count reconstruction, detail-page scraping provides metadata and explicit episode links when available, and playback resolution prefers direct media requests but degrades to redirect/embed streams when AnimeTake only exposes a hosted player.

The remaining gap is live end-to-end validation from an environment that passes AnimeTake's Cloudflare gate. This repository state is useful because it replaces the prior 501 stub with real extraction logic and explicit challenge-aware failures, but playback quality and selector accuracy still need confirmation on a less-restricted network/browser context.

## Context and Orientation

Relay's browser service lives under `web/apps/browser/src/`. `web/apps/browser/src/extractors/types.ts` defines the `BrowserProviderExtractor` contract: each extractor must implement `search`, `getAnime`, `getEpisodes`, and `resolvePlayback`. `web/apps/browser/src/extractors/registry.ts` registers concrete extractors per provider ID; `animetake` is already listed as supported there but currently maps to `UnimplementedProviderExtractor`. `web/apps/browser/src/extraction-service.ts` maps `animetake` to `https://animetake.com.co` and retries once when an extractor throws a `challenge_failed` `BrowserExtractionError`.

The provider package under `web/packages/providers/src/providers/animetake.ts` already declares AnimeTake as a browser-only anime provider, so no provider-package implementation changes are needed beyond the browser extractor itself. The missing work is entirely in the browser app plus maintainer documentation.

AnimeTake's current public structure, as inferred from indexed pages, includes:

- `/all-anime-shows` for a broad catalog page.
- `/az-all-anime/<letter>?page=<n>` for alphabetical listing pages.
- `/anime/<slug>/` for series detail pages.
- `/anime/<slug>/episode/<n>` for episode playback pages.

Because live HTML is challenge-protected from this environment, the extractor must use resilient DOM heuristics instead of brittle theme-specific selectors wherever possible.

## Plan of Work

Create `web/apps/browser/src/extractors/animetake.ts`. In that file, add a readiness loop similar to the AnimeOnsen and AnimePahe extractors that detects Cloudflare interstitial text and waits for real content. Define helpers to normalize text, build absolute URLs, rank titles against a query, and extract episode numbers from URLs or nearby badge text.

Implement search by loading one or more `/az-all-anime/<letter>?page=<n>` pages, scraping anime cards from detail-page links, recording any nearby latest-episode badge, ranking matches locally, and paginating the ranked matches according to the Relay `SearchInput`. Do not depend on a site search endpoint that is not observable from this environment.

Implement `getAnime` by loading `/anime/<slug>/` and scraping title, synopsis, cover image, tags, year, status, and total-episode hints from the detail page. When the detail page does not expose a total episode count directly, reuse the listing-page badge fallback.

Implement `getEpisodes` by first trying to scrape explicit episode links from the detail page. If the page only exposes the latest-episode count, synthesize a numeric episode list from `1` through that latest count using the known `/anime/<slug>/episode/<n>` route shape.

Implement `resolvePlayback` by loading `/anime/<slug>/episode/<n>`, listening for request/response traffic that exposes `.m3u8`, `.mp4`, or `.mpd` URLs, and normalizing any observed `referer` / `origin` headers. Add fallback parsing for inline source URLs, `gstoreplayer.source`-style payloads, same-origin `/redirect...` links, and iframe/embed URLs. Prefer direct media streams when present; otherwise return the best embed URL as a `text/html` stream so the client can fall back to the provider iframe.

Register the extractor in `web/apps/browser/src/extractors/registry.ts`. Update `AGENTS.md` with a short maintenance note that points future contributors to the AnimeTake extractor when the site's Cloudflare gate, A-Z pagination, or inline redirect/player flow changes.

## Concrete Steps

From the repository root `/Users/axel/Desktop/Code_Projects/Personal/Relay`, perform the following:

1. Edit `web/apps/browser/src/extractors/animetake.ts` and add the implementation described above.
2. Edit `web/apps/browser/src/extractors/registry.ts` to import and register `AnimeTakeExtractor`.
3. Edit `AGENTS.md` to capture the AnimeTake maintenance note.
4. Run:

    rtk proxy npm --prefix web/apps/browser run typecheck

5. Optionally, if AnimeTake's Cloudflare challenge is passable in the target environment, run the browser app and manually exercise AnimeTake provider search/details/playback through the normal API flow.

## Validation and Acceptance

Acceptance is primarily behavior-based:

- Before the change, an AnimeTake browser extraction request returns a 501 unimplemented-provider error.
- After the change, the browser service resolves AnimeTake search/details/episodes requests through a concrete extractor implementation and either returns structured data or an explicit challenge/upstream parsing error.
- `rtk proxy npm --prefix web/apps/browser run typecheck` succeeds.
- In an environment where AnimeTake's Cloudflare challenge can be satisfied, requesting playback for `/anime/jigokuraku-2nd-season/episode/3` should yield either a direct media stream or an embed-backed session instead of a 501.

## Idempotence and Recovery

These edits are additive and safe to repeat. If a selector or fallback is wrong, recovery is limited to re-editing the extractor and rerunning the browser app typecheck. No migrations or destructive commands are involved.

## Artifacts and Notes

Observed current public routes from indexed pages:

    https://animetake.com.co/all-anime-shows
    https://animetake.com.co/az-all-anime/j?page=1
    https://animetake.com.co/anime/jigokuraku-2nd-season/
    https://animetake.com.co/anime/jigokuraku-2nd-season/episode/3

Observed Cloudflare challenge text during direct fetches:

    Just a moment...
    Performing security verification
    This website uses a security service to protect against malicious bots.

## Interfaces and Dependencies

`web/apps/browser/src/extractors/animetake.ts` must export:

    export class AnimeTakeExtractor implements BrowserProviderExtractor

The extractor should throw `BrowserExtractionError` with code `challenge_failed` when the page never progresses past Cloudflare, and `upstream_error` when the page loads but expected AnimeTake content or playback sources cannot be found.

Revision note: updated the plan after implementation to record the shipped extractor, the added timeout adjustment, the successful browser-app typecheck, and the remaining Cloudflare-blocked live validation gap.
