import type {
  CatalogSearchResponse,
  CatalogSearchStreamEvent,
} from "@relay/contracts";
import { catalogSearchStreamEventSchema } from "@relay/contracts";
import { getApiBaseUrl } from "./api-base-url";

export async function streamCatalogSearch(
  searchTerm: string,
  signal: AbortSignal,
  onProgress: (completedProviders: number, totalProviders: number) => void,
): Promise<CatalogSearchResponse> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(
    `${baseUrl}/catalog/search/stream?query=${encodeURIComponent(searchTerm)}&page=1&limit=24`,
    {
      cache: "no-store",
      credentials: "include",
      signal,
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Search failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Search stream did not return a readable response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let finalResponse: CatalogSearchResponse | null = null;

  const processLine = (line: string) => {
    const event = catalogSearchStreamEventSchema.parse(
      JSON.parse(line) as CatalogSearchStreamEvent,
    );
    if (event.type === "start" || event.type === "progress") {
      onProgress(event.completedProviders, event.totalProviders);
      return;
    }

    if (event.type === "done") {
      finalResponse = event.response;
      return;
    }

    throw new Error(event.message || "Unable to search providers.");
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });

    while (true) {
      const lineBreakIndex = buffered.indexOf("\n");
      if (lineBreakIndex < 0) {
        break;
      }

      const line = buffered.slice(0, lineBreakIndex).trim();
      buffered = buffered.slice(lineBreakIndex + 1);
      if (line.length === 0) {
        continue;
      }
      processLine(line);
    }
  }

  const trailing = buffered.trim();
  if (trailing.length > 0) {
    processLine(trailing);
  }

  if (finalResponse) {
    return finalResponse;
  }

  throw new Error("Search stream ended before completion.");
}
