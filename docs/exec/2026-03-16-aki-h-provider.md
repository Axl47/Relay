# Add The Aki-H Provider

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The repository does not currently contain `.docs/PLANS.md`; instead, the file `.docs` at the repository root contains the ExecPlan specification. Maintain this document according to that file while keeping this plan self-contained.

## Purpose / Big Picture

After this change, Relay can search Aki-H titles, open Aki-H detail pages, list Aki-H episodes, and resolve Aki-H playback for watch pages such as `https://aki-h.com/watch/YN4LfVD7aq/`. A user should be able to search for `Ikumonogakari`, open `Ikumonogakari The Animation`, see the four available episode variants, and start playback without manually chasing Aki-H’s nested iframe chain.

## Progress

- [x] (2026-03-16 09:20Z) Inspect the provider architecture, Aki-H catalog HTML, and the live playback chain from `aki-h.com/watch/...` through the nested hosts.
- [x] (2026-03-16 09:21Z) Record the plan in `docs/exec/2026-03-16-aki-h-provider.md` because this checkout uses a root `.docs` file instead of a `.docs/` directory.
- [x] (2026-03-16 09:31Z) Implement the Aki-H provider metadata, registry wiring, and fixture-backed search/details/episodes parser.
- [x] (2026-03-16 09:33Z) Implement the Aki-H browser playback extractor and register it in the browser broker.
- [x] (2026-03-16 09:40Z) Verify provider tests, `@relay/providers` build, `@relay/browser` build, and a live browser-extractor smoke against the real Aki-H watch page.
- [x] (2026-03-16 09:42Z) Update `AGENTS.md` with the `.docs` layout discovery and the Aki-H playback maintenance note.

## Surprises & Discoveries

- Observation: The repo-level `.docs` path is a UTF-8 text file containing the ExecPlan rules, not a directory.
  Evidence: `rtk file .docs` reports `Unicode text, UTF-8 text`.

- Observation: Aki-H search is a `POST` form submission to `/search/` with field `q`, even though pagination links switch to `GET` URLs like `/search/?q=ikumonogakari&page=2/`.
  Evidence: The live search form HTML is `<form action="https://aki-h.com/search/" ... method="post">` with `<input ... name="q">`, and the first result card for `Ikumonogakari` appears in the response body for `POST q=ikumonogakari`.

- Observation: Aki-H watch playback is referer-locked across multiple hosts.
  Evidence: The chain is `aki-h.com/watch/<token>/` -> `window.displayvideo(0, 28885)` -> `aki-h.com/video/28885/` -> inline `video_data.files.url = 'https://v.aki-h.com/v/28885'` -> `/f/YN4LfVD7aq` -> `streaming.aki.today/playback/v/JiWC8TL2/` -> `aki-h.stream/v/BroAdI38` or `aki-h.stream/v2/BroAdI38`. Fetching the later hosts without the expected referer returns `403` or `You are not authorized`.

- Observation: The browser player requests a direct HLS master playlist from `aki-h.stream`, so the extractor can stop at that playlist instead of decoding the full obfuscated player script.
  Evidence: A live Playwright smoke against `AkiHExtractor.resolvePlayback()` returned `https://aki-h.stream/file/BroAdI38/` with headers `{ referer: "https://aki-h.stream/v/BroAdI38", origin: "https://aki-h.stream" }`.

## Decision Log

- Decision: Implement Aki-H as a hybrid provider rather than a pure `BrowserProtectedProviderBase`.
  Rationale: Search, anime details, and episode lists are stable server-rendered HTML and are faster and easier to test over HTTP. Playback is the only part that currently needs browser help because the nested hosts enforce referers and use obfuscated player bootstrap scripts.
  Date/Author: 2026-03-16 / Codex

- Decision: Store this ExecPlan under `docs/exec/` for this change.
  Rationale: The AGENTS convention points at `.docs/exec/`, but this checkout already uses `.docs` as a file, so a normal `docs/exec/` directory is the least surprising non-destructive fallback.
  Date/Author: 2026-03-16 / Codex

## Outcomes & Retrospective

Relay now has a working Aki-H provider with HTTP catalog parsing and browser-assisted playback extraction. The risky playback path was reduced to a direct HLS playlist capture, which means the API can proxy and rewrite the playlists instead of trying to serve a brittle embed chain. The remaining maintenance risk is upstream DOM drift on the watch page or a change in the `aki-h.stream` request pattern.

## Context and Orientation

Relay’s built-in providers live under `web/packages/providers/src/providers/`. The registry that exposes them to the rest of the application lives in `web/packages/providers/src/index.ts`. Shared HTML parsing helpers such as `absoluteUrl`, `extractIdAfterPrefix`, `parseNumber`, `parseYear`, and `createStream` live in `web/packages/providers/src/base/provider-utils.ts`.

The API runtime uses `createProviderRegistry()` from `web/packages/providers/src/index.ts` to seed provider metadata and to resolve search, details, episode lists, and playback. Playback resolutions are cached in `web/apps/api/src/services/relay-service.ts`; stream bodies are served from `web/apps/api/src/app.ts` through `/stream/:sessionId`. If a resolved stream has `proxyMode: "redirect"` and no special headers or cookies, the API issues a raw redirect. Otherwise the API fetches the upstream URL server-side with the stored headers and streams the response body back to the client.

The browser broker lives under `web/apps/browser/src/`. `web/apps/browser/src/extraction-service.ts` routes extraction requests to per-provider extractors from `web/apps/browser/src/extractors/registry.ts`. Today the only concrete extractor is `web/apps/browser/src/extractors/hanime.ts`, which is useful as a pattern for playback-only browser extraction.

For Aki-H itself, the relevant HTML shapes are:

Search pages:
`POST https://aki-h.com/search/` with form field `q` returns cards under `.film_list-wrap .flw-item`. Each card contains `.film-poster-ahref` and `.film-name a`.

Series pages:
`https://aki-h.com/<slug>/` contains the title in `.film-name.dynamic-name`, the synopsis in `.film-description .text` or `.anisc-info .item .text`, cover art in `.anis-cover` and `.film-poster img`, metadata rows in `.anisc-info .item`, and episode cards under `.live__-wrap .item` that link directly to `https://aki-h.com/watch/<token>/`.

Watch pages:
`https://aki-h.com/watch/<token>/` renders `window.displayvideo(0, <numericVideoId>)`. `https://aki-h.com/video/<numericVideoId>/` then exposes inline `video_data` with either a direct media URL or, for the sampled page, an iframe target at `https://v.aki-h.com/v/<numericId>`. The nested player path continues through `v.aki-h.com`, `streaming.aki.today`, and `aki-h.stream`.

## Plan of Work

Add a new provider module at `web/packages/providers/src/providers/aki-h.ts`. Use the existing `RelayProviderBase` directly because the search endpoint is custom and playback needs special handling. In the constructor, register metadata for provider id `aki-h`, display name `Aki-H`, base URL `https://aki-h.com`, content class `hentai`, adult gating enabled, search support enabled, tracker sync disabled, and execution mode `browser` so playback gets the longer browser timeout while the provider still performs catalog parsing over HTTP.

Implement `search()` by posting `q=<query>` to `https://aki-h.com/search/`, then parsing `.film_list-wrap .flw-item`. Each result should use the series slug as `externalAnimeId`, the visible English title as `title`, the card poster as `coverImage`, and a short synopsis if one exists on the card; otherwise leave synopsis `null`. `hasNextPage` should reflect the presence of a `.pagination__next` link that points to a different page.

Implement `getAnime()` by fetching `https://aki-h.com/<externalAnimeId>/`, extracting the main title, synopsis, poster/cover image, category/status/year fields from the `.anisc-info` metadata list, and genre tags from the genre links. Derive the year from the `Premiered` row or fallback meta text. Set `totalEpisodes` from the parsed episode list length.

Implement `getEpisodes()` from the same series page by collecting `.live__-wrap .item` cards. Each episode uses the series slug as `externalAnimeId` and the watch token after `watch/` as `externalEpisodeId`. Parse the episode number from the visible title when possible; if no numeric marker exists, keep the original order. Preserve the thumbnail from the `t.aki-h.com/thumbnail/<token>.webp` image.

Implement `resolvePlayback()` by delegating to `ctx.browser?.extractPlayback(...)` when available. If the browser broker is missing, throw a provider runtime error explaining that Aki-H playback requires the internal browser broker. This keeps the HTTP provider deterministic while letting the browser do the referer-sensitive media extraction.

Add a browser extractor at `web/apps/browser/src/extractors/aki-h.ts`. Start from the watch page, let the nested player iframes load, click the play affordance inside the `v.aki-h.com` frame, and observe network responses for direct HLS URLs on `aki-h.stream` such as `/file/<id>/` or `/quality/<id>/720/`. Prefer the master playlist path (`/file/` or `/file2/`) when available and derive it from a quality URL only as fallback. Return the HLS stream with `referer` pointing at `https://aki-h.stream/v/<id>` or `.../v2/<id>` and `origin` set to `https://aki-h.stream` so the API stream proxy can fetch the playlists and segments successfully.

Register the extractor in `web/apps/browser/src/extractors/registry.ts` and add `aki-h` to the browser service’s `providerBaseUrlMap` in `web/apps/browser/src/extraction-service.ts`.

Register the provider in `web/packages/providers/src/index.ts` so the API, client, and provider seeding all pick it up.

Add fixtures under `web/packages/providers/test/fixtures/aki-h/` for search, series, watch, and video pages. Add a provider contract test to `web/packages/providers/src/providers.test.ts` that verifies search, anime details, and episode parsing from fixtures while mocking the browser broker for playback. Add a focused browser extractor test only if the extractor logic can be exercised without live network; otherwise verify the extractor through the provider-layer browser mock and keep the browser extractor itself covered by targeted runtime checks.

## Concrete Steps

From the repository root:

1. Create the provider file, register it, and add the browser extractor wiring.
2. Add Aki-H HTML fixtures for search and series parsing.
3. Add or extend tests in `web/packages/providers/src/providers.test.ts`.
4. Run:

    rtk npm --prefix web test -- --runInBand packages/providers/src/providers.test.ts

5. Run:

    rtk npm --prefix web run build --workspace @relay/providers

6. If the browser extractor adds compile-time surface area, run:

    rtk npm --prefix web run build --workspace @relay/browser

7. Run a live smoke against the real browser extractor implementation:

    rtk proxy bash -lc 'cd /Users/axel/Desktop/Code_Projects/Personal/Relay/web/apps/browser && npx tsx <<'"'"'NODE'"'"'
    import { chromium } from "playwright";
    import { AkiHExtractor } from "./src/extractors/aki-h.ts";
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const extractor = new AkiHExtractor();
    try {
      const result = await extractor.resolvePlayback(
        {
          providerId: "aki-h",
          externalAnimeId: "ikumonogakari-the-animation",
          externalEpisodeId: "YN4LfVD7aq",
        },
        {
          providerId: "aki-h",
          domain: "aki-h.com",
          signal: AbortSignal.timeout(30000),
          async withPage(task) {
            const page = await context.newPage();
            try {
              return await task(page);
            } finally {
              await page.close();
            }
          },
        },
      );
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await context.close();
      await browser.close();
    }
    NODE'

Expected success is zero TypeScript errors and passing provider tests that include the new Aki-H case.

## Validation and Acceptance

Acceptance is met when all of the following are true:

Searching Aki-H for `ikumonogakari` returns `Ikumonogakari The Animation`.

Opening the Aki-H anime details response for `ikumonogakari-the-animation` returns the synopsis about the population decline law, the `Censored` category, and the expected genre tags.

Listing episodes for `ikumonogakari-the-animation` returns four watch entries from the sample page: two English `Vol` entries and two Thai subtitle entries.

Resolving playback for `YN4LfVD7aq` produces a direct HLS stream entry whose URL is on `aki-h.stream/file/...` and whose headers include the matching `aki-h.stream/v/...` referer. If the extractor cannot produce direct media, it must fail loudly rather than caching a stale unusable embed chain.

## Idempotence and Recovery

The catalog parser and fixture changes are additive and safe to rerun. If playback extraction lands in a broken referer-dependent embed state, remove the Aki-H playback-specific code and rerun the provider tests before attempting a different extraction strategy. Do not delete or overwrite the existing `.docs` file; it is the repository’s current ExecPlan specification.

## Artifacts and Notes

The live playback chain captured during discovery:

    https://aki-h.com/watch/YN4LfVD7aq/
      -> window.displayvideo(0, 28885)
      -> https://aki-h.com/video/28885/
      -> video_data.files.url = https://v.aki-h.com/v/28885
      -> https://v.aki-h.com/f/YN4LfVD7aq
      -> https://streaming.aki.today/playback/v/JiWC8TL2/
      -> https://aki-h.stream/v/BroAdI38
      -> https://aki-h.stream/v2/BroAdI38

The live extractor smoke result captured after implementation:

    {
      "providerId": "aki-h",
      "externalAnimeId": "ikumonogakari-the-animation",
      "externalEpisodeId": "YN4LfVD7aq",
      "streams": [
        {
          "id": "aki-h-hls",
          "url": "https://aki-h.stream/file/BroAdI38/",
          "quality": "auto",
          "mimeType": "application/vnd.apple.mpegurl",
          "headers": {
            "referer": "https://aki-h.stream/v/BroAdI38",
            "origin": "https://aki-h.stream"
          },
          "proxyMode": "proxy",
          "isDefault": true
        }
      ]
    }

The live search form and result card markers:

    <form action="https://aki-h.com/search/" method="post">
      <input name="q">
    </form>

    <div class="flw-item">
      <a href="https://aki-h.com/ikumonogakari-the-animation/" class="film-poster-ahref">
      <h3 class="film-name"><a ...>Ikumonogakari The Animation</a></h3>
    </div>

The live series episode card markers:

    <div class="live__-wrap">
      <a href="https://aki-h.com/watch/YN4LfVD7aq/" class="live-thumbnail">
      <a ... href="https://aki-h.com/watch/YN4LfVD7aq/">Ikumonogakari The Animation Vol 1 Sub-Eng</a>
    </div>

Revision note: updated after implementation to record the direct `aki-h.stream/file/...` HLS capture, the exact verification commands, and the completed rollout status.
