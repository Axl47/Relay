import type {
  AnimeDetails,
  ProviderContentClass,
  UserPreferences,
} from "@relay/contracts";
import { userPreferencesSchema } from "@relay/contracts";
import { createProviderRequestContext } from "@relay/provider-sdk";
import type { ProviderRegistry, RelayProvider } from "@relay/provider-sdk";
import {
  createProviderRegistry,
  getApiCatalogTimeoutMs,
  getApiPlaybackCacheTtlMs,
  getApiResolutionTimeoutMs,
  getApiSearchTimeoutMs,
} from "@relay/providers";
import { appConfig } from "../config";
import { HttpBrowserBrokerClient } from "../modules/providers/browser-broker-client";

const SEARCH_TIMEOUT_MS = {
  http: 8_000,
  browser: 20_000,
} as const;

const PROVIDER_RESOLUTION_TIMEOUT_MS = {
  http: 12_000,
  browser: 25_000,
} as const;

const HANIME_PLAYBACK_RESOLUTION_TIMEOUT_MS = 60_000;
const ANIMETAKE_SEARCH_TIMEOUT_MS = 45_000;
const ANIMETAKE_RESOLUTION_TIMEOUT_MS = 45_000;
const ANIMETAKE_CATALOG_TIMEOUT_MS = 6_000;

export const DEFAULT_PREFERENCES: UserPreferences = userPreferencesSchema.parse({});

export class ProviderTimeoutError extends Error {
  constructor(providerId: string, timeoutMs: number) {
    super(`Provider "${providerId}" exceeded timeout after ${timeoutMs}ms.`);
    this.name = "ProviderTimeoutError";
  }
}

export function normalizePreferences(input: Partial<UserPreferences>): UserPreferences {
  const parsed = userPreferencesSchema.parse({
    ...DEFAULT_PREFERENCES,
    ...input,
  });

  const allowed = new Set(parsed.allowedContentClasses);
  allowed.add("anime");
  allowed.add("general");

  if (!parsed.adultContentVisible) {
    return {
      ...parsed,
      adultContentVisible: false,
      allowedContentClasses: ["anime", "general"],
    };
  }

  return {
    ...parsed,
    allowedContentClasses: Array.from(allowed).filter(
      (value): value is ProviderContentClass =>
        value === "anime" || value === "general" || value === "hentai" || value === "jav",
    ),
  };
}

export function isAdultContentClass(contentClass: ProviderContentClass) {
  return contentClass === "hentai" || contentClass === "jav";
}

export function isContentClassAllowed(
  preferences: UserPreferences,
  contentClass: ProviderContentClass,
) {
  if (!preferences.allowedContentClasses.includes(contentClass)) {
    return false;
  }

  if (isAdultContentClass(contentClass) && !preferences.adultContentVisible) {
    return false;
  }

  return true;
}

export function humanizeAnimeId(externalAnimeId: string) {
  return externalAnimeId
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export function buildAnimetakeFallbackAnimeDetails(
  provider: RelayProvider,
  providerId: string,
  externalAnimeId: string,
): AnimeDetails {
  return {
    providerId,
    providerDisplayName: provider.metadata.displayName,
    externalAnimeId,
    title: humanizeAnimeId(externalAnimeId) || externalAnimeId,
    synopsis: null,
    coverImage: null,
    bannerImage: null,
    status: "unknown",
    year: null,
    kind: "unknown",
    tags: [],
    language: "en",
    totalEpisodes: null,
    contentClass: provider.metadata.contentClass,
    requiresAdultGate: provider.metadata.requiresAdultGate,
  };
}

export class ProviderRuntime {
  private readonly registryPromise: Promise<ProviderRegistry>;
  private readonly browserBroker = new HttpBrowserBrokerClient(appConfig.BROWSER_SERVICE_URL);

  constructor() {
    this.registryPromise = createProviderRegistry({
      tmdbApiKey: appConfig.TMDB_API_KEY ?? null,
    });
  }

  registry() {
    return this.registryPromise;
  }

  async getProviderOrThrow(providerId: string): Promise<RelayProvider> {
    const provider = (await this.registry()).get(providerId);
    if (!provider) {
      throw Object.assign(new Error(`Unknown provider: ${providerId}`), { statusCode: 404 });
    }
    return provider;
  }

  createProviderContext(signal?: AbortSignal) {
    return createProviderRequestContext({
      signal,
      browser: this.browserBroker,
    });
  }

  async withProviderTimeout<T>(
    provider: RelayProvider,
    timeoutMs: number,
    executor: (provider: RelayProvider, signal: AbortSignal) => Promise<T>,
  ) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const task = executor(provider, controller.signal);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new ProviderTimeoutError(provider.metadata.id, timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([task, timeoutPromise]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderTimeoutError(provider.metadata.id, timeoutMs);
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  getPlaybackCacheTtlMs(provider: RelayProvider) {
    return getApiPlaybackCacheTtlMs(provider.metadata.id, provider.metadata.executionMode);
  }

  getProviderSearchTimeout(provider: RelayProvider) {
    return getApiSearchTimeoutMs(
      provider.metadata.id,
      provider.metadata.id === "animetake"
        ? ANIMETAKE_SEARCH_TIMEOUT_MS
        : SEARCH_TIMEOUT_MS[provider.metadata.executionMode],
    );
  }

  getProviderResolutionTimeout(provider: RelayProvider) {
    return getApiResolutionTimeoutMs(
      provider.metadata.id,
      provider.metadata.id === "hanime"
        ? HANIME_PLAYBACK_RESOLUTION_TIMEOUT_MS
        : provider.metadata.id === "animetake"
          ? ANIMETAKE_RESOLUTION_TIMEOUT_MS
          : PROVIDER_RESOLUTION_TIMEOUT_MS[provider.metadata.executionMode],
    );
  }

  getProviderCatalogTimeout(provider: RelayProvider) {
    if (provider.metadata.id === "animetake") {
      return getApiCatalogTimeoutMs(provider.metadata.id) ?? ANIMETAKE_CATALOG_TIMEOUT_MS;
    }

    return getApiCatalogTimeoutMs(provider.metadata.id) ?? null;
  }
}
