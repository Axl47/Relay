# Add the AnimeOnsen browser extractor

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows the repository-root `.docs` plan requirements.

## Purpose / Big Picture

After this change, Relay should be able to use the existing `animeonsen` browser-only provider end to end instead of failing with `Browser extraction provider "animeonsen" is not implemented yet.` A user should be able to search AnimeOnsen, open a title page, list episodes, and resolve a watch page into a playable manifest plus subtitle tracks through the browser broker.

## Progress

- [x] (2026-03-16 18:41Z) Read the browser extractor interfaces, registry, browser service wiring, and existing extractor implementations.
- [x] (2026-03-16 18:41Z) Confirmed `web/packages/providers/src/providers/animeonsen.ts` already marks AnimeOnsen as `executionMode: "browser"` and that the browser registry is the missing implementation point.
- [x] (2026-03-16 18:46Z) Implemented `web/apps/browser/src/extractors/animeonsen.ts`, registered it in `web/apps/browser/src/extractors/registry.ts`, and updated `AGENTS.md` with the AnimeOnsen token/content-ID maintenance note.
- [x] (2026-03-16 18:46Z) Ran `rtk npm --prefix web/apps/browser typecheck` and confirmed the browser app compiles with the new extractor.
- [~] (2026-03-16 18:46Z) Validate the extractor against the live site in an environment that can clear the current Cloudflare gate. Completed: local static/API research and compile verification. Remaining: live end-to-end verification.

## Surprises & Discoveries

- Observation: `https://www.animeonsen.xyz/*` is currently fronted by a Cloudflare interstitial that blocks plain HTTP fetches and also stalled the local headless Playwright runs in this environment.
  Evidence: `rtk curl -I https://www.animeonsen.xyz/watch/GbnE2r0g5WlQ21k0?episode=7` returned `HTTP/2 403` with `cf-mitigated: challenge`, and the Playwright probe remained on `Just a moment...` with no cookies after 60 seconds.

- Observation: The site’s asset host `https://api.animeonsen.xyz` is directly reachable and exposes the same `/v4/...` surface the web app uses after it has an authenticated session token.
  Evidence: `rtk curl -I https://api.animeonsen.xyz/v4/image/210x300/tpDOKQ9iGVuAUnTa` returned `HTTP/2 200`, while `/v4/content/...` returned `HTTP/2 401 Unauthorized` instead of a challenge page.

- Observation: Third-party indexed snippets exposed the AnimeOnsen player contract well enough to infer the browser-side resolution flow: page metadata includes `ao-content-id`, the page stores an `ao.session` cookie, and the player calls `https://api.animeonsen.xyz/v4/content/<contentId>/video/<episode>` with a derived bearer token before using `data.uri.stream` and `data.uri.subtitles`.
  Evidence: search snippets for `ao-content-id`, `ao.session`, and `api.animeonsen.xyz/v4/content/.../video/...` matched the same route structure as the reachable API host.

## Decision Log

- Decision: Implement AnimeOnsen as a full `BrowserProviderExtractor` instead of leaving search/details/episodes unimplemented and supporting playback only.
  Rationale: The provider already routes every operation through the browser broker via `BrowserProtectedProviderBase`, so partial support would still leave the provider unusable in normal Relay flows.
  Date/Author: 2026-03-16 / Codex

- Decision: Use page-driven extraction for metadata discovery and direct `api.animeonsen.xyz` fetches for playback once the browser page exposes the content ID and session cookie.
  Rationale: The API host appears stable and machine-readable, but still requires browser-established session state. Mixing DOM discovery with authenticated API calls should be more robust than scraping a custom player iframe.
  Date/Author: 2026-03-16 / Codex

- Decision: Treat unresolved Cloudflare pages as `challenge_failed` so the existing browser extraction retry path can reset the provider context and try again.
  Rationale: `BrowserExtractionService` already retries that error class and preserves the correct cookie-context lifecycle for browser-backed providers.
  Date/Author: 2026-03-16 / Codex

## Outcomes & Retrospective

The repository now has a concrete AnimeOnsen browser extractor instead of the previous 501 placeholder, and the browser app still typechecks. The remaining gap is live validation: this environment could not get past AnimeOnsen’s current Cloudflare interstitial, so the DOM selectors and token heuristics are grounded in reachable API behavior plus indexed page snippets rather than a successful local browser session.

## Context and Orientation

The browser extraction service lives under `web/apps/browser/src`. `web/apps/browser/src/extractors/types.ts` defines the `BrowserProviderExtractor` interface. `web/apps/browser/src/extractors/registry.ts` owns the provider-to-extractor registration map. `web/apps/browser/src/extraction-service.ts` creates an `ExtractionRuntime` with the provider ID, the resolved domain, and `runtime.withPage(...)`, which is the only supported way to run Playwright work while preserving cookies and challenge retries.

AnimeOnsen already exists as a provider in `web/packages/providers/src/providers/animeonsen.ts`. Because it extends `BrowserProtectedProviderBase`, all `search`, `getAnime`, `getEpisodes`, and `resolvePlayback` calls are delegated to the browser broker. Without an extractor implementation in `web/apps/browser/src/extractors`, the registry currently returns `UnimplementedProviderExtractor`, which produces an HTTP 501 response.

The AnimeOnsen site appears to be a JavaScript application behind Cloudflare. The normal HTML routes (`/search`, `/details/<id>`, `/watch/<id>?episode=<n>`) require a browser context, while `https://api.animeonsen.xyz/v4/...` responds as a JSON/image API once the page has provided the correct session token. The extractor therefore needs to do two kinds of work: parse page metadata from the browser-rendered document, and issue authenticated `fetch` calls from within the same browser page for the player endpoint.

## Plan of Work

Add a new file `web/apps/browser/src/extractors/animeonsen.ts`. Define helper functions to normalize whitespace, coerce episode numbers, build absolute URLs against `https://www.animeonsen.xyz`, and detect when a page is still stuck on the Cloudflare interstitial. Implement a page-wait helper similar to the AnimePahe extractor so the code can fail with `BrowserExtractionError("challenge_failed", ...)` when the DOM never becomes usable.

Implement `search` by navigating to the AnimeOnsen search route, applying the user query through the page, and reading result cards into `SearchPage.items`. Use broad but deliberate selectors that look for anchors containing `/details/`, then extract the title, synopsis, cover image, and external anime ID from each card. Cap the returned items to the requested `limit` and set `hasNextPage` conservatively to `false` unless the page exposes an explicit next-page control.

Implement `getAnime` by navigating to the details route for `input.externalAnimeId`, waiting for the detail content to render, then extracting the page title, synopsis, cover image, release year, episode count, tags, and any hidden `ao-content-id` value if present. Return `status: "unknown"` unless the page explicitly states a reliable status.

Implement `getEpisodes` by reusing the details route and, if needed, opening the watch route for the first episode to guarantee that the episode selector exists. Parse episode controls from the page into `EpisodeList.episodes`, using option values or watch links to produce `externalEpisodeId` values that can be fed back into `resolvePlayback`. If the page exposes only numeric episode numbers, store those as strings.

Implement `resolvePlayback` by opening the watch route with the chosen episode number, waiting for the page metadata to become available, deriving the API bearer token from the `ao.session` cookie inside the page, and then fetching `https://api.animeonsen.xyz/v4/content/<contentId>/video/<episode>` from page context. Map the JSON response into a `PlaybackResolution` containing the best manifest URL in `data.uri.stream`, subtitle tracks from `data.uri.subtitles`, and proxy-mode headers/cookies as needed.

Finally, register `AnimeOnsenExtractor` in `web/apps/browser/src/extractors/registry.ts`, update this plan and `working_list.md`, then run the browser app typecheck.

## Concrete Steps

From the repository root:

    rtk npm --prefix web/apps/browser typecheck

Expected output:

    > tsc -p tsconfig.json --noEmit

When validating specific behavior in a live environment, start the browser broker:

    rtk npm --prefix web/apps/browser run dev

Then exercise the JSON endpoints indirectly through the API or a small broker request payload for `providerId: "animeonsen"`. The expected failure before this change is HTTP 501 with `Browser extraction provider "animeonsen" is not implemented yet.` After the change, the endpoints should either return structured data or fail with a narrower upstream/challenge error instead of `unimplemented_provider`.

## Validation and Acceptance

Acceptance means all four broker operations for `providerId: "animeonsen"` are implemented and the browser app typechecks. In an environment where the browser can clear AnimeOnsen’s Cloudflare gate, search should return AnimeOnsen results instead of a 501, opening a title should return structured anime metadata and episodes, and playback resolution should return at least one stream plus any discovered subtitles.

Because the local environment currently stalls on the Cloudflare interstitial, typechecking is the mandatory automated validation here, and the final summary must call out the live verification risk explicitly.

## Idempotence and Recovery

The code changes are additive and can be applied repeatedly without side effects. If the extractor selectors are wrong, the safe recovery path is to edit only `web/apps/browser/src/extractors/animeonsen.ts` and rerun `rtk npm --prefix web/apps/browser run typecheck`. If a broken extractor causes repeated `challenge_failed` errors, deleting the relevant browser context is already handled by the existing retry logic in `web/apps/browser/src/extraction-service.ts`.

## Artifacts and Notes

Important observed outputs:

    rtk curl -I https://www.animeonsen.xyz/watch/GbnE2r0g5WlQ21k0?episode=7
    HTTP/2 403
    cf-mitigated: challenge

    rtk curl -I https://api.animeonsen.xyz/v4/image/210x300/tpDOKQ9iGVuAUnTa
    HTTP/2 200

    rtk curl -I https://api.animeonsen.xyz/v4/content/tpDOKQ9iGVuAUnTa
    HTTP/2 401

## Interfaces and Dependencies

In `web/apps/browser/src/extractors/animeonsen.ts`, define:

    export class AnimeOnsenExtractor implements BrowserProviderExtractor {
      search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage>;
      getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails>;
      getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList>;
      resolvePlayback(
        input: ProviderEpisodeRef,
        runtime: ExtractionRuntime,
      ): Promise<PlaybackResolution>;
    }

The implementation should depend only on existing browser-service modules plus the browser page APIs already used in the other extractors. Throw `BrowserExtractionError("challenge_failed", ...)` for unusable Cloudflare interstitials and `BrowserExtractionError("upstream_error", ...)` for missing content IDs, cookies, or malformed player payloads.

Revision note: Created this ExecPlan before implementation because AnimeOnsen is a multi-method browser integration with live-site uncertainty and requires a documented recovery path.

Revision note: Updated after implementation to record the landed extractor, the successful browser-app typecheck, and the remaining live-site validation gap caused by the Cloudflare challenge.
