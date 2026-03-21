const RELAY_API_PROXY_PREFIX = "/__relay_api";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configuredBaseUrl) {
    return RELAY_API_PROXY_PREFIX;
  }

  // If the build-time API URL is loopback but the app is opened from another device,
  // use the in-app proxy path so requests route through the host machine instead.
  if (typeof window !== "undefined") {
    try {
      const configuredUrl = new URL(configuredBaseUrl);
      if (isLoopbackHostname(configuredUrl.hostname) && !isLoopbackHostname(window.location.hostname)) {
        return RELAY_API_PROXY_PREFIX;
      }
    } catch {
      return RELAY_API_PROXY_PREFIX;
    }
  }

  return trimTrailingSlash(configuredBaseUrl);
}

export function resolveRelayApiUrlForClient(url?: string | null) {
  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    if (typeof window !== "undefined") {
      const browserHostname = window.location.hostname;
      if (isLoopbackHostname(parsedUrl.hostname) && !isLoopbackHostname(browserHostname)) {
        return `${getApiBaseUrl()}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      }
    }

    return parsedUrl.toString();
  } catch {
    return url;
  }
}
