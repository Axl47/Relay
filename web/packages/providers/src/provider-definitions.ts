import type { ProviderMetadata } from "@relay/contracts";

export type ProviderOperation = "search" | "anime" | "episodes" | "playback";

type ProviderRuntimePolicy = {
  browser?: {
    ephemeralContext?: boolean;
    resetContextAfter?: ProviderOperation[];
    timeoutMs?: Partial<Record<ProviderOperation, number>>;
    retryAttempts?: number;
  };
  api?: {
    searchTimeoutMs?: number;
    resolutionTimeoutMs?: number;
    catalogTimeoutMs?: number | null;
    playbackCacheTtlMs?: number;
  };
};

export type ProviderDefinition = {
  metadata: ProviderMetadata;
  runtime?: ProviderRuntimePolicy;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const providerDefinitions = {
  "aki-h": {
    metadata: {
      id: "aki-h",
      displayName: "Aki-H",
      baseUrl: "https://aki-h.com",
      contentClass: "hentai",
      executionMode: "browser",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    },
  },
  aniwave: {
    metadata: {
      id: "aniwave",
      displayName: "Aniwave",
      baseUrl: "https://aniwaves.ru",
      contentClass: "anime",
      executionMode: "http",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    },
  },
  animeonsen: {
    metadata: {
      id: "animeonsen",
      displayName: "AnimeOnsen",
      baseUrl: "https://www.animeonsen.xyz",
      contentClass: "anime",
      executionMode: "browser",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    },
  },
  animepahe: {
    metadata: {
      id: "animepahe",
      displayName: "AnimePahe",
      baseUrl: "https://animepahe.si",
      contentClass: "anime",
      executionMode: "browser",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    },
    runtime: {
      browser: {
        timeoutMs: {
          playback: 45_000,
        },
      },
    },
  },
  xtream: {
    metadata: {
      id: "xtream",
      displayName: "Xtream",
      baseUrl: "https://xtream.rip",
      contentClass: "general",
      executionMode: "http",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: true,
    },
  },
  animetake: {
    metadata: {
      id: "animetake",
      displayName: "AnimeTake",
      baseUrl: "https://animetake.com.co",
      contentClass: "anime",
      executionMode: "browser",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    },
    runtime: {
      browser: {
        ephemeralContext: true,
        timeoutMs: {
          search: 45_000,
          anime: 45_000,
          episodes: 45_000,
          playback: 45_000,
        },
      },
      api: {
        searchTimeoutMs: 45_000,
        resolutionTimeoutMs: 45_000,
        catalogTimeoutMs: 6_000,
        playbackCacheTtlMs: FIFTEEN_MINUTES_MS,
      },
    },
  },
  gogoanime: {
    metadata: {
      id: "gogoanime",
      displayName: "Gogoanime",
      baseUrl: "https://gogoanime.by",
      contentClass: "anime",
      executionMode: "http",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    },
  },
  hanime: {
    metadata: {
      id: "hanime",
      displayName: "Hanime",
      baseUrl: "https://hanime.tv",
      contentClass: "hentai",
      executionMode: "browser",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    },
    runtime: {
      browser: {
        timeoutMs: {
          playback: 45_000,
        },
      },
      api: {
        resolutionTimeoutMs: 60_000,
        playbackCacheTtlMs: FIFTEEN_MINUTES_MS,
      },
    },
  },
  hentaihaven: {
    metadata: {
      id: "hentaihaven",
      displayName: "HentaiHaven",
      baseUrl: "https://hentaihaven.xxx",
      contentClass: "hentai",
      executionMode: "browser",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    },
    runtime: {
      browser: {
        ephemeralContext: true,
        resetContextAfter: ["playback"],
        timeoutMs: {
          search: 45_000,
          anime: 45_000,
          episodes: 45_000,
          playback: 45_000,
        },
      },
      api: {
        playbackCacheTtlMs: FIFTEEN_MINUTES_MS,
      },
    },
  },
  hstream: {
    metadata: {
      id: "hstream",
      displayName: "Hstream",
      baseUrl: "https://hstream.moe",
      contentClass: "hentai",
      executionMode: "http",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    },
  },
  javguru: {
    metadata: {
      id: "javguru",
      displayName: "JavGuru",
      baseUrl: "https://jav.guru",
      contentClass: "jav",
      executionMode: "http",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    },
  },
} satisfies Record<string, ProviderDefinition>;

export type ProviderId = keyof typeof providerDefinitions;
const providerDefinitionMap: Record<string, ProviderDefinition> = providerDefinitions;

export const providerDefinitionList = Object.values(providerDefinitions);
export const providerIds = Object.keys(providerDefinitions) as ProviderId[];

export function getProviderDefinition(providerId: string) {
  return providerDefinitionMap[providerId] ?? null;
}

export function getProviderMetadata(providerId: string) {
  return getProviderDefinition(providerId)?.metadata ?? null;
}

export function getProviderBaseUrl(providerId: string) {
  return getProviderMetadata(providerId)?.baseUrl ?? null;
}

export function resolveProviderBaseUrl(providerId: string, overrideBaseUrl?: string) {
  return overrideBaseUrl ?? getProviderBaseUrl(providerId);
}

export function resolveProviderDomain(providerId: string, overrideBaseUrl?: string) {
  const targetUrl = resolveProviderBaseUrl(providerId, overrideBaseUrl);
  if (!targetUrl) {
    return null;
  }

  try {
    return new URL(targetUrl).hostname;
  } catch {
    return null;
  }
}

export function getBrowserExtractionTimeoutMs(
  providerId: string,
  operation: ProviderOperation,
  defaultTimeoutMs: number,
) {
  const configuredTimeoutMs =
    getProviderDefinition(providerId)?.runtime?.browser?.timeoutMs?.[operation];
  return configuredTimeoutMs
    ? Math.max(defaultTimeoutMs, configuredTimeoutMs)
    : defaultTimeoutMs;
}

export function getBrowserExtractionRetryAttempts(providerId: string) {
  return getProviderDefinition(providerId)?.runtime?.browser?.retryAttempts ?? 2;
}

export function shouldUseEphemeralBrowserContext(providerId: string) {
  return getProviderDefinition(providerId)?.runtime?.browser?.ephemeralContext ?? false;
}

export function shouldResetBrowserContextAfterOperation(
  providerId: string,
  operation: ProviderOperation,
) {
  return getProviderDefinition(providerId)?.runtime?.browser?.resetContextAfter?.includes(operation) ?? false;
}

export function getApiPlaybackCacheTtlMs(
  providerId: string,
  executionMode: ProviderMetadata["executionMode"],
) {
  const configuredTtlMs = getProviderDefinition(providerId)?.runtime?.api?.playbackCacheTtlMs;
  if (configuredTtlMs) {
    return configuredTtlMs;
  }

  return executionMode === "browser" ? FIFTEEN_MINUTES_MS : THIRTY_MINUTES_MS;
}

export function getApiSearchTimeoutMs(providerId: string, defaultTimeoutMs: number) {
  return getProviderDefinition(providerId)?.runtime?.api?.searchTimeoutMs ?? defaultTimeoutMs;
}

export function getApiResolutionTimeoutMs(providerId: string, defaultTimeoutMs: number) {
  return getProviderDefinition(providerId)?.runtime?.api?.resolutionTimeoutMs ?? defaultTimeoutMs;
}

export function getApiCatalogTimeoutMs(providerId: string) {
  return getProviderDefinition(providerId)?.runtime?.api?.catalogTimeoutMs ?? null;
}
