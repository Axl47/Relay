# Add The AnimePahe Browser Extractor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

The repository does not currently contain `.docs/PLANS.md`; instead, the file `.docs` at the repository root contains the ExecPlan specification. Maintain this document according to that file while keeping this plan self-contained.

## Purpose / Big Picture

After this change, Relay can use the browser broker to search AnimePahe, open AnimePahe detail pages, list AnimePahe episodes, and resolve direct playback for watch URLs such as `https://animepahe.si/play/2383da24-221b-915c-48c4-bcd910cdda99/6e5576e5b682257926d3ece50a05b954a3eb7e9ef1dcf6206c900ef3bebde547`. A user should be able to search for `Naruto`, open the AnimePahe result, see the full episode list, and start playback from the `kwik` player without manually opening the embed host or inspecting network requests.

## Progress

- [x] (2026-03-16 18:02Z) Inspect the browser extractor architecture, the existing AnimePahe provider metadata, and the ExecPlan storage fallback under `docs/exec/`.
- [x] (2026-03-16 18:10Z) Map the live AnimePahe search API, anime page metadata, release pagination, and `kwik` playback chain with Playwright against the real site.
- [x] (2026-03-16 18:12Z) Record the implementation plan in `docs/exec/2026-03-16-animepahe-browser-extractor.md`.
- [x] (2026-03-16 18:18Z) Implement the AnimePahe browser extractor, register it in `web/apps/browser/src/extractors/registry.ts`, and extend playback timeout handling in `web/apps/browser/src/extraction-service.ts`.
- [x] (2026-03-16 18:30Z) Verify `@relay/browser` typecheck/build and run a live extractor smoke against AnimePahe search, details, episodes, and playback.
- [x] (2026-03-16 18:31Z) Update `AGENTS.md` with the AnimePahe maintenance note and revise this ExecPlan with final results.

## Surprises & Discoveries

- Observation: Plain `curl` requests to `animepahe.si` hit a DDoS-Guard JavaScript challenge, but a Playwright page clears it automatically after a few seconds and then exposes normal HTML and API access.
  Evidence: `curl https://animepahe.si/api?m=search&q=naruto` returned the DDoS-Guard interstitial, while a Playwright session reached `animepahe :: okay-ish anime website` and successfully fetched `https://animepahe.si/api?m=search&q=naruto&page=1`.

- Observation: AnimePahe search and episode lists are already available from first-party JSON APIs once the challenge cookies exist.
  Evidence: `api?m=search&q=naruto&page=1` returned search results with `session` ids, and `api?m=release&id=<anime-session>&sort=episode_asc&page=1` returned 30-episode pages with per-episode `session` ids and thumbnails.

- Observation: The AnimePahe play page already embeds direct `kwik` URLs in `data-src` attributes, so the extractor does not need to emulate the site’s dropdown JavaScript.
  Evidence: The sample play page rendered buttons with `data-src="https://kwik.cx/e/EUE2CnVr2iRw"` and `data-resolution="1080"`.

- Observation: The `kwik` embed eventually requests the real HLS manifest from `vault-99.owocdn.top`, and the only consistently required headers are the `kwik` `referer` and `origin`.
  Evidence: A Playwright capture recorded `https://vault-99.owocdn.top/.../uwu.m3u8` with `referer: https://kwik.cx/e/EUE2CnVr2iRw` and `origin: https://kwik.cx`, and a raw `curl -I` with those headers returned HTTP 200 for the manifest.

## Decision Log

- Decision: Implement AnimePahe entirely inside the browser broker instead of mixing HTTP provider code with browser playback-only extraction.
  Rationale: The built-in `AnimePaheProvider` already extends `BrowserProtectedProviderBase`, and the live site gates even the JSON APIs behind the browser challenge. Keeping all four operations inside the browser extractor avoids duplicating challenge-clearing logic across runtimes.
  Date/Author: 2026-03-16 / Codex

- Decision: Capture the HLS request from the `kwik` embed instead of reverse-engineering the player scripts.
  Rationale: The manifest request is directly observable, stable, and already carries the exact `referer` and `origin` headers that Relay needs for proxy playback.
  Date/Author: 2026-03-16 / Codex

## Outcomes & Retrospective

Relay now has a working AnimePahe browser extractor for all four browser-broker operations. The implementation deliberately stays close to the live site’s observable behavior: wait for DDoS-Guard to clear, use the first-party JSON APIs for search and episodes, parse details from the rendered anime page, and capture the real HLS request from the `kwik` embed instead of reverse-engineering the player scripts.

The main remaining risk is upstream markup drift on the AnimePahe play page or a change in how `kwik` triggers the manifest request. The maintenance note in `AGENTS.md` and the live smoke command in this plan are intended to make that failure mode fast to re-diagnose.

## Context and Orientation

Relay routes browser-only providers through `web/apps/browser/src/extraction-service.ts`. That service chooses an extractor from `web/apps/browser/src/extractors/registry.ts`, opens a Playwright page through `web/apps/browser/src/browser/context-manager.ts`, and returns the extracted response back to the API. `web/apps/browser/src/extractors/types.ts` defines the four required operations: `search`, `getAnime`, `getEpisodes`, and `resolvePlayback`.

AnimePahe is already registered as a browser-protected provider in `web/packages/providers/src/providers/animepahe.ts`, so the missing piece is only the browser extractor itself.

The live AnimePahe flow needed for this change is:

Search:
`https://animepahe.si/api?m=search&q=<query>&page=<page>` returns JSON entries with the anime `session` id, title, poster, type, and year.

Anime details:
`https://animepahe.si/anime/<anime-session>` renders the title under `h1.user-select-none span`, synopsis under `.anime-synopsis`, metadata rows under `.anime-info p`, and genre tags under `.anime-genre a`.

Episodes:
`https://animepahe.si/api?m=release&id=<anime-session>&sort=episode_asc&page=<page>` returns paginated episode entries with per-episode `session` ids, duration strings, thumbnails, and created timestamps.

Playback:
`https://animepahe.si/play/<anime-session>/<episode-session>` renders quality buttons with `data-src` `kwik` embed URLs. Opening a `kwik` embed such as `https://kwik.cx/e/EUE2CnVr2iRw` and starting playback triggers a real HLS request to `https://vault-99.owocdn.top/.../uwu.m3u8`.

## Plan of Work

Add `web/apps/browser/src/extractors/animepahe.ts` and implement the full `BrowserProviderExtractor` contract.

For search, first load the AnimePahe home page so DDoS-Guard can set the browser cookies, then call the first-party search API with `fetch()` from inside the Playwright page. Map each search entry’s `session` to Relay’s `externalAnimeId`.

For anime details, open `/anime/<session>`, wait for the challenge page to disappear, and parse the title, synopsis, cover image, status, year, tags, and total episode count from the rendered DOM.

For episodes, reuse the same challenge-cleared browser page and fetch every `api?m=release...` page until `current_page === last_page`, then map the episode `session` values to Relay `externalEpisodeId` values.

For playback, open `/play/<anime-session>/<episode-session>`, extract the default `data-src` `kwik` embed URL, navigate to that embed, capture the first successful `.m3u8` request, and return it with the captured `referer` and `origin` headers.

Register the extractor in `web/apps/browser/src/extractors/registry.ts`. Extend `web/apps/browser/src/extraction-service.ts` so AnimePahe playback gets the same 45-second timeout cushion that Hanime already uses, because the DDoS-Guard page plus the embed hop can exceed the normal 25-second budget.

Update `AGENTS.md` with the exact files and runtime facts that matter when AnimePahe extraction breaks.

## Concrete Steps

From the repository root:

1. Create `web/apps/browser/src/extractors/animepahe.ts`.
2. Register the extractor in `web/apps/browser/src/extractors/registry.ts`.
3. Extend AnimePahe playback timeout handling in `web/apps/browser/src/extraction-service.ts`.
4. Update `AGENTS.md`.
5. Run:

    rtk proxy npm --prefix web --workspace @relay/browser run typecheck

6. Run:

    rtk proxy npm --prefix web --workspace @relay/browser run build

7. Run a live smoke:

    rtk proxy bash -lc 'cd /Users/axel/Desktop/Code_Projects/Personal/Relay/web && node --input-type=module <<'"'"'NODE'"'"'
    import { chromium } from "playwright";
    import { AnimePaheExtractor } from "./apps/browser/src/extractors/animepahe.ts";

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const extractor = new AnimePaheExtractor();
    const runtime = {
      providerId: "animepahe",
      domain: "animepahe.si",
      signal: AbortSignal.timeout(45000),
      async withPage(task) {
        const page = await context.newPage();
        try {
          return await task(page);
        } finally {
          await page.close();
        }
      },
    };

    try {
      console.log(JSON.stringify(await extractor.search({ query: "naruto", page: 1, limit: 3 }, runtime), null, 2));
      console.log(JSON.stringify(await extractor.getAnime({ providerId: "animepahe", externalAnimeId: "78e38106-d9f3-a8b5-7974-9702f603dc96" }, runtime), null, 2));
      console.log(JSON.stringify(await extractor.getEpisodes({ providerId: "animepahe", externalAnimeId: "78e38106-d9f3-a8b5-7974-9702f603dc96" }, runtime).then((value) => value.episodes.slice(0, 3)), null, 2));
      console.log(JSON.stringify(await extractor.resolvePlayback({ providerId: "animepahe", externalAnimeId: "2383da24-221b-915c-48c4-bcd910cdda99", externalEpisodeId: "6e5576e5b682257926d3ece50a05b954a3eb7e9ef1dcf6206c900ef3bebde547" }, runtime), null, 2));
    } finally {
      await context.close();
      await browser.close();
    }
    NODE'

## Validation and Acceptance

Acceptance is met when all of the following are true:

Searching AnimePahe for `naruto` returns the `Naruto` series entry whose `externalAnimeId` is AnimePahe’s session id.

Opening AnimePahe details for `78e38106-d9f3-a8b5-7974-9702f603dc96` returns the `Naruto` title, the Hidden Leaf Village synopsis, year `2002`, completed status, and genre tags that include `Action`, `Adventure`, and `Fantasy`.

Listing AnimePahe episodes for `78e38106-d9f3-a8b5-7974-9702f603dc96` returns episode entries whose `externalEpisodeId` values are the API `session` tokens and whose durations parse from strings like `00:23:20`.

Resolving playback for `2383da24-221b-915c-48c4-bcd910cdda99 / 6e5576e5b682257926d3ece50a05b954a3eb7e9ef1dcf6206c900ef3bebde547` returns an HLS stream on `vault-99.owocdn.top/.../uwu.m3u8` with `referer: https://kwik.cx/e/...` and `origin: https://kwik.cx`.

## Idempotence and Recovery

The source changes are additive and safe to rerun. If a later verification shows that AnimePahe changed the play page markup but still exposes `data-src` buttons, only the DOM selectors in `web/apps/browser/src/extractors/animepahe.ts` should need updates. If `kwik` stops exposing the manifest through a plain play click, re-run the live Playwright smoke to capture the new request path before changing the extractor.

## Artifacts and Notes

The live search response shape:

    {
      "current_page": 1,
      "last_page": 4,
      "data": [
        {
          "title": "Naruto",
          "type": "TV",
          "year": 2002,
          "poster": "https://i.animepahe.si/posters/...",
          "session": "78e38106-d9f3-a8b5-7974-9702f603dc96"
        }
      ]
    }

The live play-page buttons:

    <button class="dropdown-item active"
            data-src="https://kwik.cx/e/EUE2CnVr2iRw"
            data-fansub="SubsPlease"
            data-resolution="1080">
      SubsPlease · 1080p
    </button>

The live manifest request headers:

    referer: https://kwik.cx/e/EUE2CnVr2iRw
    origin: https://kwik.cx

The final live smoke summary after implementation:

    {
      "search": {
        "count": 3,
        "first": {
          "externalAnimeId": "78e38106-d9f3-a8b5-7974-9702f603dc96",
          "title": "Naruto",
          "kind": "tv"
        },
        "hasNextPage": true
      },
      "anime": {
        "title": "Naruto",
        "year": 2002,
        "status": "completed",
        "totalEpisodes": 220
      },
      "episodes": {
        "count": 220,
        "first": {
          "externalEpisodeId": "67ce9d96765835e4657093df2d7b75f58aa9a41b76226d987173a1b261a4c4c4",
          "number": 1,
          "title": "Episode 1"
        }
      },
      "playback": {
        "stream": {
          "id": "animepahe-1080p",
          "url": "https://vault-99.owocdn.top/stream/99/02/b6603c81658b8b0ba66c686359bba30a7da485bf34f780b0bb1a40af2d8e0089/uwu.m3u8",
          "headers": {
            "referer": "https://kwik.cx/e/EUE2CnVr2iRw",
            "origin": "https://kwik.cx"
          }
        }
      }
    }

Revision note: updated after implementation to record the completed rollout, the corrected verification commands, and the successful live smoke outputs.
