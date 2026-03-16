import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertProviderContract, createProviderRequestContext } from "@relay/provider-sdk";
import {
  AniwaveProvider,
  GogoanimeProvider,
  HanimeProvider,
  HstreamProvider,
  JavGuruProvider,
} from "./index";

type MockResponseConfig = {
  body: string;
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
};

type MockRoute = {
  match: (url: string, init: RequestInit | undefined) => boolean;
  response: MockResponseConfig;
};

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");

function fixture(path: string) {
  return readFileSync(join(fixtureRoot, path), "utf8");
}

function createMockFetch(routes: MockRoute[]): typeof fetch {
  return (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes.find((candidate) => candidate.match(url, init));
    if (!route) {
      throw new Error(`Unexpected fixture fetch: ${url}`);
    }

    return new Response(route.response.body, {
      status: route.response.status ?? 200,
      headers: {
        "content-type": route.response.contentType ?? "text/html; charset=utf-8",
        ...(route.response.headers ?? {}),
      },
    });
  }) as typeof fetch;
}

describe("Wave 1 provider contract fixtures", () => {
  it("gogoanime resolves search, details, episodes, and direct playback", async () => {
    const provider = new GogoanimeProvider();
    const ctx = createProviderRequestContext({
      fetch: createMockFetch([
        {
          match: (url) => url.startsWith("https://gogoanime.by/?s="),
          response: { body: fixture("gogoanime/search.html") },
        },
        {
          match: (url) => url === "https://gogoanime.by/series/jigokuraku-2nd-season/",
          response: { body: fixture("gogoanime/series.html") },
        },
        {
          match: (url) =>
            url === "https://gogoanime.by/jigokuraku-2nd-season-episode-10-english-subbed/",
          response: { body: fixture("gogoanime/episode.html") },
        },
        {
          match: (url) =>
            url.startsWith(
              "https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php?",
            ),
          response: { body: fixture("gogoanime/player.html") },
        },
        {
          match: (url) =>
            url.startsWith(
              "https://9animetv.be/wp-content/plugins/video-player/includes/player/n-bg/player.php?",
            ),
          response: { body: fixture("gogoanime/player-inner.html") },
        },
      ]),
    });

    await assertProviderContract(provider, ctx);
    const playback = await provider.resolvePlayback(
      {
        providerId: "gogoanime",
        externalAnimeId: "jigokuraku-2nd-season",
        externalEpisodeId: "jigokuraku-2nd-season-episode-10-english-subbed",
      },
      ctx,
    );
    expect(playback.streams[0]?.mimeType).toBe("video/mp4");
    expect(playback.subtitles[0]?.url).toContain("jigokuraku-10.vtt");
  });

  it("javguru decodes iframe playback from fixture HTML", async () => {
    const provider = new JavGuruProvider();
    const ctx = createProviderRequestContext({
      fetch: createMockFetch([
        {
          match: (url) => url.startsWith("https://jav.guru/?s="),
          response: { body: fixture("javguru/search.html") },
        },
        {
          match: (url) =>
            url ===
            "https://jav.guru/953304/myba-092-a-married-womans-petals-spread-suzuna-nami/",
          response: { body: fixture("javguru/post.html") },
        },
      ]),
    });

    await assertProviderContract(provider, ctx);
    const playback = await provider.resolvePlayback(
      {
        providerId: "javguru",
        externalAnimeId: "953304/myba-092-a-married-womans-petals-spread-suzuna-nami",
        externalEpisodeId: "953304/myba-092-a-married-womans-petals-spread-suzuna-nami",
      },
      ctx,
    );
    expect(playback.streams[0]?.mimeType).toBe("text/html");
    expect(playback.streams[0]?.url).toContain("streamtape.example");
  });

  it("hstream exposes streams and subtitles from the player API", async () => {
    const provider = new HstreamProvider();
    const ctx = createProviderRequestContext({
      fetch: createMockFetch([
        {
          match: (url) => url.startsWith("https://hstream.moe/search?search="),
          response: { body: fixture("hstream/search.html") },
        },
        {
          match: (url) =>
            url ===
            "https://hstream.moe/hentai/imaizumin-chi-wa-douyara-gal-no-tamariba-ni-natteru-rashii",
          response: { body: fixture("hstream/series.html") },
        },
        {
          match: (url) =>
            url ===
              "https://hstream.moe/hentai/imaizumin-chi-wa-douyara-gal-no-tamariba-ni-natteru-rashii-6" ||
            url ===
              "https://hstream.moe/hentai/imaizumin-chi-wa-douyara-gal-no-tamariba-ni-natteru-rashii-1",
          response: {
            body: fixture("hstream/episode.html"),
            headers: {
              "set-cookie":
                "XSRF-TOKEN=fixture; Path=/, hstream_session=session-fixture; Path=/",
            },
          },
        },
        {
          match: (url) => url === "https://hstream.moe/player/api",
          response: {
            body: fixture("hstream/player.json"),
            contentType: "application/json",
          },
        },
      ]),
    });

    await assertProviderContract(provider, ctx);
    const episodes = await provider.getEpisodes(
      {
        providerId: "hstream",
        externalAnimeId: "imaizumin-chi-wa-douyara-gal-no-tamariba-ni-natteru-rashii",
      },
      ctx,
    );
    expect(episodes.episodes.map((episode) => episode.number)).toEqual([1, 6]);
    expect(episodes.episodes.map((episode) => episode.title)).toEqual([
      "Imaizumin Chi wa Douyara Gal no Tamariba ni Natteru Rashii - 1",
      "Imaizumin Chi wa Douyara Gal no Tamariba ni Natteru Rashii - 6",
    ]);
    const playback = await provider.resolvePlayback(
      {
        providerId: "hstream",
        externalAnimeId: "imaizumin-chi-wa-douyara-gal-no-tamariba-ni-natteru-rashii",
        externalEpisodeId: "imaizumin-chi-wa-douyara-gal-no-tamariba-ni-natteru-rashii-6",
      },
      ctx,
    );
    expect(playback.streams.find((stream) => stream.isDefault)?.mimeType).toBe("video/mp4");
    expect(playback.streams.some((stream) => stream.mimeType === "application/dash+xml")).toBe(true);
    expect(playback.subtitles[0]?.format).toBe("ass");
  });

  it("hanime parses Nuxt state and yields HLS playback", async () => {
    const provider = new HanimeProvider();
    const ctx = createProviderRequestContext({
      fetch: createMockFetch([
        {
          match: (url) => url === "https://cached.freeanimehentai.net/api/v10/search_hvs",
          response: {
            body: JSON.stringify([
              {
                id: 3393,
                name: "Natsu to Hako 1",
                search_titles: "Natsu to Hako 1 Natsu to Hako Test 夏と箱",
                slug: "natsu-to-hako-1",
                description: "<p>First episode.</p>",
                cover_url: "https://hanime-cdn.com/images/covers/natsu-to-hako-1.webp",
                poster_url: "https://hanime-cdn.com/images/posters/natsu-to-hako-1.webp",
                released_at: "2025-05-11T15:00:00.000Z",
                released_at_unix: 1746975600,
                created_at_unix: 1769895730,
                tags: ["vanilla"],
                brand: "Mary Jane",
              },
              {
                id: 3411,
                name: "Natsu to Hako 2",
                search_titles: "Natsu to Hako 2 Natsu to Hako Test 夏と箱",
                slug: "natsu-to-hako-2",
                description:
                  "<p>Sex in a phone booth just wasn't as nice as they were expecting.</p>",
                cover_url: "https://hanime-cdn.com/images/covers/natsu-to-hako-2.webp",
                poster_url: "https://hanime-cdn.com/images/posters/natsu-to-hako-2.webp",
                released_at: "2026-02-05T15:00:00.000Z",
                released_at_unix: 1770303600,
                created_at_unix: 1773541602,
                tags: ["vanilla", "school girl"],
                brand: "Mary Jane",
              },
            ]),
            contentType: "application/json",
          },
        },
      ]),
    });

    await assertProviderContract(provider, ctx);
    const anime = await provider.getAnime(
      {
        providerId: "hanime",
        externalAnimeId: "natsu-to-hako",
      },
      ctx,
    );
    const playback = await provider.resolvePlayback(
      {
        providerId: "hanime",
        externalAnimeId: "natsu-to-hako",
        externalEpisodeId: "natsu-to-hako-2",
      },
      ctx,
    );
    const episodes = await provider.getEpisodes(
      {
        providerId: "hanime",
        externalAnimeId: "natsu-to-hako",
      },
      ctx,
    );
    expect(anime.title).toBe("Natsu to Hako");
    expect(anime.totalEpisodes).toBe(2);
    expect(playback.streams[0]?.mimeType).toBe("text/html");
    expect(playback.streams[0]?.url).toBe("https://hanime.tv/videos/hentai/natsu-to-hako-2");
    expect((await provider.search({ query: "natsu", page: 1, limit: 5 }, ctx)).items[0]?.coverImage)
      .toContain("hanime-cdn.com/images/posters");
    expect((await provider.search({ query: "natsu", page: 1, limit: 5 }, ctx)).items[0]?.externalAnimeId)
      .toBe("natsu-to-hako");
    expect(episodes.episodes).toHaveLength(2);
    expect(episodes.episodes.map((episode) => episode.externalEpisodeId)).toEqual([
      "natsu-to-hako-1",
      "natsu-to-hako-2",
    ]);
    expect(episodes.episodes.map((episode) => episode.number)).toEqual([1, 2]);
  });

  it("aniwave resolves SSR metadata, episode ajax, and embed playback", async () => {
    const provider = new AniwaveProvider();
    const ctx = createProviderRequestContext({
      fetch: createMockFetch([
        {
          match: (url) => url.startsWith("https://aniwaves.ru/filter?keyword="),
          response: { body: fixture("aniwave/search.html") },
        },
        {
          match: (url) =>
            url ===
            "https://aniwaves.ru/watch/saioshi-no-gikei-wo-mederu-tame-nagaiki-shimasu-82442",
          response: { body: fixture("aniwave/watch.html") },
        },
        {
          match: (url) => url.startsWith("https://aniwaves.ru/ajax/episode/list/82442"),
          response: {
            body: fixture("aniwave/episode-list.json"),
            contentType: "application/json",
          },
        },
        {
          match: (url) => url.startsWith("https://aniwaves.ru/ajax/server/list?servers=82442&eps="),
          response: {
            body: fixture("aniwave/server-list.json"),
            contentType: "application/json",
          },
        },
        {
          match: (url) => url.startsWith("https://aniwaves.ru/ajax/sources?id=encoded-link-id"),
          response: {
            body: fixture("aniwave/sources.json"),
            contentType: "application/json",
          },
        },
      ]),
    });

    await assertProviderContract(provider, ctx);
    const playback = await provider.resolvePlayback(
      {
        providerId: "aniwave",
        externalAnimeId: "saioshi-no-gikei-wo-mederu-tame-nagaiki-shimasu-82442",
        externalEpisodeId: "1",
      },
      ctx,
    );
    expect(playback.streams[0]?.mimeType).toBe("text/html");
    expect(playback.streams[0]?.url).toContain("shipimagesbolt.online");
  });
});
