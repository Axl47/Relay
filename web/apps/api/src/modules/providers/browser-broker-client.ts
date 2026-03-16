import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { BrowserBrokerClient } from "@relay/provider-sdk";

async function parseBrokerResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } | string; message?: string }
      | null;
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message ?? payload?.message ?? `Browser broker request failed with ${response.status}.`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export class HttpBrowserBrokerClient implements BrowserBrokerClient {
  constructor(private readonly baseUrl: string) {}

  private async post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return parseBrokerResponse<T>(response);
  }

  extractSearch(providerId: string, input: SearchInput, signal?: AbortSignal): Promise<SearchPage> {
    return this.post<SearchPage>("/extract/search", { providerId, input }, signal);
  }

  extractAnime(
    providerId: string,
    input: ProviderAnimeRef,
    signal?: AbortSignal,
  ): Promise<AnimeDetails> {
    return this.post<AnimeDetails>("/extract/anime", { providerId, input }, signal);
  }

  extractEpisodes(
    providerId: string,
    input: ProviderAnimeRef,
    signal?: AbortSignal,
  ): Promise<EpisodeList> {
    return this.post<EpisodeList>("/extract/episodes", { providerId, input }, signal);
  }

  extractPlayback(
    providerId: string,
    input: ProviderEpisodeRef,
    signal?: AbortSignal,
  ): Promise<PlaybackResolution> {
    return this.post<PlaybackResolution>("/extract/playback", { providerId, input }, signal);
  }
}
