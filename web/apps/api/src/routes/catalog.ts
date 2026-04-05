import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  catalogAnimeQuerySchema,
  catalogAnimeViewQuerySchema,
  catalogEpisodesQuerySchema,
  mediaProxyQuerySchema,
  searchInputSchema,
} from "@relay/contracts";
import { appConfig } from "../config";
import { getMediaProxyHeaders } from "../streaming/proxy";
import type { ApiServiceContainer } from "../services";
import { requireUser } from "./guards";

async function streamCatalogSearchResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  services: ApiServiceContainer,
) {
  const user = await requireUser(request);
  const query = searchInputSchema.parse(request.query);

  reply.hijack();
  reply.raw.statusCode = 200;
  const originHeader = request.headers.origin;
  const allowAnyOrigin = appConfig.corsOrigins.includes("*");
  const isAllowedOrigin =
    typeof originHeader === "string" &&
    (allowAnyOrigin || appConfig.corsOrigins.includes(originHeader));
  if (isAllowedOrigin && originHeader) {
    reply.raw.setHeader("access-control-allow-origin", originHeader);
    reply.raw.setHeader("access-control-allow-credentials", "true");
    const existingVaryHeader = reply.raw.getHeader("vary");
    const existingVary =
      Array.isArray(existingVaryHeader) ? existingVaryHeader.join(", ") : `${existingVaryHeader ?? ""}`;
    const hasOriginVary = existingVary.toLowerCase().includes("origin");
    reply.raw.setHeader("vary", hasOriginVary ? existingVary : (existingVary ? `${existingVary}, Origin` : "Origin"));
  }
  reply.raw.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  reply.raw.setHeader("cache-control", "no-cache, no-transform");
  reply.raw.setHeader("connection", "keep-alive");
  reply.raw.flushHeaders?.();

  let closed = false;
  request.raw.on("close", () => {
    closed = true;
  });

  const writeEvent = (event: unknown) => {
    if (closed || reply.raw.writableEnded) {
      return;
    }

    reply.raw.write(`${JSON.stringify(event)}\n`);
  };

  try {
    const response = await services.catalog.searchWithProgress(user.id, query, {
      onStart: ({ totalProviders }) => {
        writeEvent({
          type: "start",
          completedProviders: 0,
          totalProviders,
        });
      },
      onProviderResult: ({ completedProviders, totalProviders, providerResult }) => {
        writeEvent({
          type: "progress",
          completedProviders,
          totalProviders,
          provider: {
            providerId: providerResult.providerId,
            status: providerResult.status,
            itemCount: providerResult.items.length,
            latencyMs: providerResult.latencyMs,
          },
        });
      },
    });

    writeEvent({
      type: "done",
      response,
    });
  } catch (error) {
    writeEvent({
      type: "error",
      message: error instanceof Error ? error.message : "Unable to search providers.",
    });
  } finally {
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  }
}

export async function registerCatalogRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.get("/catalog/search", async (request) => {
    const user = await requireUser(request);
    const query = searchInputSchema.parse(request.query);
    return services.catalog.search(user.id, query);
  });

  app.get("/catalog/search/last", async (request, reply) => {
    const user = await requireUser(request);
    reply.header("cache-control", "no-store");
    return services.catalog.getLastCatalogSearch(user.id);
  });

  app.get("/catalog/search/stream", async (request, reply) =>
    streamCatalogSearchResponse(request, reply, services),
  );

  app.get("/catalog/anime", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = catalogAnimeQuerySchema.parse(request.query);
    return services.catalog.getAnime(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/anime/view", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = catalogAnimeViewQuerySchema.parse(request.query);
    return services.catalog.getAnimeDetailView(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/episodes", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = catalogEpisodesQuerySchema.parse(request.query);
    return services.catalog.getEpisodes(user.id, providerId, externalAnimeId);
  });

  app.get("/media/proxy", async (request, reply) => {
    await requireUser(request);
    const { url } = mediaProxyQuerySchema.parse(request.query);
    const targetUrl = new URL(url);
    const upstream = await fetch(targetUrl, {
      headers: getMediaProxyHeaders(targetUrl),
    });

    if (!upstream.ok) {
      throw Object.assign(new Error(`Media proxy request failed with status ${upstream.status}`), {
        statusCode: upstream.status,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const cacheControl = upstream.headers.get("cache-control") ?? "public, max-age=86400";
    const body = Buffer.from(await upstream.arrayBuffer());

    reply.header("content-type", contentType);
    reply.header("cache-control", cacheControl);
    reply.send(body);
  });
}
