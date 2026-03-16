import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { LibraryRefreshResult, RelayProvider } from "@relay/provider-sdk";

type DemoAnime = {
  id: string;
  title: string;
  synopsis: string;
  coverImage: string;
  bannerImage: string;
  year: number;
  tags: string[];
  episodes: Array<{
    id: string;
    number: number;
    title: string;
    durationSeconds: number;
    releasedAt: string;
    streamUrl: string;
    mimeType: "application/vnd.apple.mpegurl" | "video/mp4";
  }>;
};

const demoCatalog: DemoAnime[] = [
  {
    id: "relay-signal",
    title: "Relay Signal",
    synopsis:
      "A private relay station drifts above a rain-heavy city while its operators archive illegal broadcasts and hidden episodes.",
    coverImage:
      "https://images.unsplash.com/photo-1517602302552-471fe67acf66?auto=format&fit=crop&w=900&q=80",
    bannerImage:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
    year: 2025,
    tags: ["mystery", "cyberpunk", "drama"],
    episodes: [
      {
        id: "relay-signal-01",
        number: 1,
        title: "Cold Start",
        durationSeconds: 1452,
        releasedAt: "2025-01-04T00:00:00.000Z",
        streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        mimeType: "application/vnd.apple.mpegurl",
      },
      {
        id: "relay-signal-02",
        number: 2,
        title: "Fault Window",
        durationSeconds: 1480,
        releasedAt: "2025-01-11T00:00:00.000Z",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        mimeType: "video/mp4",
      },
    ],
  },
  {
    id: "glass-harbor",
    title: "Glass Harbor",
    synopsis:
      "Ferries, debt ledgers, and missing idols collide in a harbor town where every tide exposes another secret.",
    coverImage:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80",
    bannerImage:
      "https://images.unsplash.com/photo-1493558103817-58b2924bce98?auto=format&fit=crop&w=1400&q=80",
    year: 2024,
    tags: ["thriller", "slice of life"],
    episodes: [
      {
        id: "glass-harbor-01",
        number: 1,
        title: "Dockside Inventory",
        durationSeconds: 1412,
        releasedAt: "2024-10-08T00:00:00.000Z",
        streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        mimeType: "application/vnd.apple.mpegurl",
      },
    ],
  },
];

function toSearchPage(input: SearchInput, items: DemoAnime[]): SearchPage {
  const filtered = items.filter((item) =>
    item.title.toLowerCase().includes(input.query.toLowerCase()),
  );

  return {
    providerId: "demo",
    query: input.query,
    page: input.page,
    hasNextPage: false,
    items: filtered.map((item) => ({
      providerId: "demo",
      externalAnimeId: item.id,
      title: item.title,
      synopsis: item.synopsis,
      coverImage: item.coverImage,
      year: item.year,
      kind: "tv",
      language: "en",
    })),
  };
}

export class DemoProvider implements RelayProvider {
  readonly id = "demo";
  readonly displayName = "Demo Broadcast";
  readonly supportsSearch = true;

  async search(input: SearchInput) {
    return toSearchPage(input, demoCatalog);
  }

  async getAnime({ externalAnimeId }: ProviderAnimeRef): Promise<AnimeDetails> {
    const anime = demoCatalog.find((item) => item.id === externalAnimeId);
    if (!anime) {
      throw new Error(`Unknown demo anime: ${externalAnimeId}`);
    }

    return {
      providerId: this.id,
      externalAnimeId: anime.id,
      title: anime.title,
      synopsis: anime.synopsis,
      coverImage: anime.coverImage,
      bannerImage: anime.bannerImage,
      status: "ongoing",
      year: anime.year,
      tags: anime.tags,
      language: "en",
      totalEpisodes: anime.episodes.length,
    };
  }

  async getEpisodes({ externalAnimeId }: ProviderAnimeRef): Promise<EpisodeList> {
    const anime = demoCatalog.find((item) => item.id === externalAnimeId);
    if (!anime) {
      throw new Error(`Unknown demo anime: ${externalAnimeId}`);
    }

    return {
      providerId: this.id,
      externalAnimeId: anime.id,
      episodes: anime.episodes.map((episode) => ({
        providerId: this.id,
        externalAnimeId: anime.id,
        externalEpisodeId: episode.id,
        number: episode.number,
        title: episode.title,
        synopsis: null,
        thumbnail: anime.coverImage,
        durationSeconds: episode.durationSeconds,
        releasedAt: episode.releasedAt,
      })),
    };
  }

  async resolvePlayback({
    externalAnimeId,
    externalEpisodeId,
  }: ProviderEpisodeRef): Promise<PlaybackResolution> {
    const anime = demoCatalog.find((item) => item.id === externalAnimeId);
    const episode = anime?.episodes.find((item) => item.id === externalEpisodeId);

    if (!anime || !episode) {
      throw new Error(`Unknown demo episode: ${externalEpisodeId}`);
    }

    return {
      providerId: this.id,
      externalAnimeId: anime.id,
      externalEpisodeId: episode.id,
      streams: [
        {
          id: `${episode.id}-default`,
          url: episode.streamUrl,
          quality: episode.mimeType === "video/mp4" ? "720p" : "adaptive",
          mimeType: episode.mimeType,
          headers: {},
          isDefault: true,
        },
      ],
      subtitles: [],
      cookies: {},
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async refreshLibraryItem({ externalAnimeId }: ProviderAnimeRef): Promise<LibraryRefreshResult> {
    const anime = demoCatalog.find((item) => item.id === externalAnimeId);
    if (!anime) {
      throw new Error(`Unknown demo anime: ${externalAnimeId}`);
    }

    return {
      providerId: this.id,
      externalAnimeId: anime.id,
      refreshedAt: new Date().toISOString(),
      discoveredEpisodes: anime.episodes.length,
      totalEpisodes: anime.episodes.length,
    };
  }
}
