import { afterEach, describe, expect, it, vi } from "vitest";
import { streamCatalogSearch } from "./search-stream";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function createStreamingResponse(chunks: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    },
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  vi.restoreAllMocks();
});

describe("catalog search stream", () => {
  it("parses NDJSON progress and done events across chunk boundaries", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://relay.test";
    const onProgress = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue(
      createStreamingResponse([
        '{"type":"start","completedProviders":0,"totalProviders":2}\n',
        '{"type":"progress","completedProviders":1,',
        '"totalProviders":2,"provider":{"providerId":"animetake","status":"success","itemCount":3,"latencyMs":120}}\n',
        '{"type":"done","response":{"query":"naruto","page":1,"limit":24,"total":1,"items":[],"providers":[]}}\n',
      ]),
    ) as typeof fetch;

    const response = await streamCatalogSearch("naruto", new AbortController().signal, onProgress);

    expect(response.query).toBe("naruto");
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 1, 2);
  });

  it("throws on error events", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://relay.test";
    globalThis.fetch = vi.fn().mockResolvedValue(
      createStreamingResponse([
        '{"type":"error","message":"Provider timeout"}\n',
      ]),
    ) as typeof fetch;

    await expect(
      streamCatalogSearch("naruto", new AbortController().signal, () => undefined),
    ).rejects.toThrow("Provider timeout");
  });
});
