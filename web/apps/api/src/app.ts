import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  assignCategoriesInputSchema,
  authBootstrapInputSchema,
  authLoginInputSchema,
  catalogAnimeQuerySchema,
  catalogAnimeViewQuerySchema,
  catalogEpisodesQuerySchema,
  createCategoryInputSchema,
  createPlaybackSessionInputSchema,
  mediaProxyQuerySchema,
  searchInputSchema,
  updateCategoryInputSchema,
  updateLibraryItemInputSchema,
  updatePlaybackProgressInputSchema,
  updateProviderConfigInputSchema,
  updateUserPreferencesInputSchema,
  upsertLibraryItemInputSchema,
  watchContextQuerySchema,
} from "@relay/contracts";
import { appConfig } from "./config";
import { parseBody, setSessionCookie } from "./lib/http";
import { convertSubtitleToVtt } from "./lib/subtitles";
import { RelayService } from "./services/relay-service";
import {
  compatibilityMp4CacheDir,
  createCompatibilityMp4TranscodeJob,
  ensureCompatibilityMp4CacheDir,
  fileExists,
  parseByteRange,
} from "./streaming/compatibility-mp4";
import {
  buildPlaybackRequestHeaders,
  buildProxyStreamPath,
  getMediaProxyHeaders,
  getSubtitleProxyHeaders,
  normalizeStreamContentType,
  rewriteDashManifest,
  rewriteHlsPlaylist,
  shouldRewriteDashBody,
  shouldRewriteHlsBody,
} from "./streaming/proxy";

declare module "fastify" {
  interface FastifyRequest {
    sessionUser?: Awaited<ReturnType<RelayService["getSessionUser"]>>;
  }
}

export async function buildApi() {
  const app = Fastify({ logger: true });
  const relay = new RelayService();
  const compatibilityMp4Jobs = new Map<string, Promise<string>>();

  await app.register(cors, {
    origin: appConfig.corsOrigins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart);

  app.decorateRequest("sessionUser", null);

  app.addHook("preHandler", async (request) => {
    const sessionId =
      request.cookies[appConfig.SESSION_COOKIE_NAME] ??
      request.headers["x-relay-session"]?.toString() ??
      null;
    request.sessionUser = await relay.getSessionUser(sessionId);
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    reply.status(statusCode).send({
      error: error instanceof Error ? error.message : "Unknown error",
      details: (error as { details?: unknown }).details ?? null,
    });
  });

  async function requireUser(request: FastifyRequest) {
    if (!request.sessionUser) {
      throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
    }
    return request.sessionUser;
  }

  async function requireAdmin(request: FastifyRequest) {
    const user = await requireUser(request);
    if (!user.isAdmin) {
      throw Object.assign(new Error("Admin access required"), { statusCode: 403 });
    }
    return user;
  }

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/bootstrap", async (request, reply) => {
    const payload = parseBody(authBootstrapInputSchema, request);
    const response = await relay.bootstrap(payload);
    setSessionCookie(reply, appConfig.SESSION_COOKIE_NAME, response.sessionId);
    return response;
  });

  app.post("/auth/login", async (request, reply) => {
    const payload = parseBody(authLoginInputSchema, request);
    const response = await relay.login(payload);
    setSessionCookie(reply, appConfig.SESSION_COOKIE_NAME, response.sessionId);
    return response;
  });

  app.post("/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[appConfig.SESSION_COOKIE_NAME];
    if (sessionId) {
      await relay.logout(sessionId);
    }
    reply.clearCookie(appConfig.SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/me", async (request) => {
    const user = await requireUser(request);
    const preferences = await relay.getPreferences(user.id);
    return { user, preferences };
  });

  app.patch("/me/preferences", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updateUserPreferencesInputSchema, request);
    return relay.updatePreferences(user.id, payload);
  });

  app.get("/providers", async (request) => {
    const user = await requireUser(request);
    return relay.listProviders(user.id);
  });

  app.patch("/providers/:providerId/config", async (request) => {
    const user = await requireAdmin(request);
    const payload = parseBody(updateProviderConfigInputSchema, request);
    const providerId = (request.params as { providerId: string }).providerId;
    return relay.updateProviderConfig(user.id, providerId, payload);
  });

  app.get("/catalog/search", async (request) => {
    const user = await requireUser(request);
    const query = searchInputSchema.parse(request.query);
    return relay.search(user.id, query);
  });

  app.get("/catalog/search/last", async (request, reply) => {
    const user = await requireUser(request);
    reply.header("cache-control", "no-store");
    return relay.getLastCatalogSearch(user.id);
  });

  async function streamCatalogSearchResponse(request: FastifyRequest, reply: FastifyReply) {
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
      const response = await relay.searchWithProgress(user.id, query, {
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

  app.get("/catalog/search/stream", streamCatalogSearchResponse);
  // Compatibility path for older client builds that still call `/stream?query=...`.
  app.get("/stream", streamCatalogSearchResponse);

  app.get("/catalog/anime", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = catalogAnimeQuerySchema.parse(request.query);
    return relay.getAnime(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/anime/view", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = catalogAnimeViewQuerySchema.parse(request.query);
    return relay.getAnimeDetailView(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/episodes", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = catalogEpisodesQuerySchema.parse(request.query);
    return relay.getEpisodes(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/:providerId/anime/:externalAnimeId", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = request.params as {
      providerId: string;
      externalAnimeId: string;
    };
    return relay.getAnime(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/:providerId/anime", async (request) => {
    const user = await requireUser(request);
    const providerId = (request.params as { providerId: string }).providerId;
    const { externalAnimeId } = catalogAnimeQuerySchema.parse({
      providerId,
      ...(request.query as Record<string, unknown>),
    });
    return relay.getAnime(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/:providerId/anime/:externalAnimeId/view", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = request.params as {
      providerId: string;
      externalAnimeId: string;
    };
    return relay.getAnimeDetailView(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/:providerId/anime/:externalAnimeId/episodes", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = request.params as {
      providerId: string;
      externalAnimeId: string;
    };
    return relay.getEpisodes(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/:providerId/episodes", async (request) => {
    const user = await requireUser(request);
    const providerId = (request.params as { providerId: string }).providerId;
    const { externalAnimeId } = catalogEpisodesQuerySchema.parse({
      providerId,
      ...(request.query as Record<string, unknown>),
    });
    return relay.getEpisodes(user.id, providerId, externalAnimeId);
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

  app.get("/library", async (request) => {
    const user = await requireUser(request);
    const [items, categories] = await Promise.all([
      relay.listLibrary(user.id),
      relay.listCategories(user.id),
    ]);
    return { items, categories };
  });

  app.get("/library/dashboard", async (request) => {
    const user = await requireUser(request);
    return relay.getLibraryDashboard(user.id);
  });

  app.post("/library/items", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(upsertLibraryItemInputSchema, request);
    return relay.addLibraryItem(user.id, {
      ...payload,
      status: payload.status ?? "watching",
      coverImage: payload.coverImage ?? null,
    });
  });

  app.patch("/library/items/:id", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updateLibraryItemInputSchema, request);
    const id = (request.params as { id: string }).id;
    return relay.updateLibraryItem(user.id, id, payload);
  });

  app.delete("/library/items/:id", async (request) => {
    const user = await requireUser(request);
    const id = (request.params as { id: string }).id;
    await relay.deleteLibraryItem(user.id, id);
    return { ok: true };
  });

  app.post("/library/categories", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(createCategoryInputSchema, request);
    return relay.createCategory(user.id, payload);
  });

  app.patch("/library/categories/:id", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updateCategoryInputSchema, request);
    const id = (request.params as { id: string }).id;
    return relay.updateCategory(user.id, id, payload);
  });

  app.post("/library/items/:id/categories", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(assignCategoriesInputSchema, request);
    const id = (request.params as { id: string }).id;
    await relay.assignCategories(user.id, id, payload);
    return { ok: true };
  });

  app.post("/playback/sessions", async (request, reply) => {
    const user = await requireUser(request);
    const payload = parseBody(createPlaybackSessionInputSchema, request);
    const session = await relay.createPlaybackSession(user.id, {
      ...payload,
      libraryItemId: payload.libraryItemId ?? null,
    });
    reply
      .status(session.status === "ready" ? 201 : 202)
      .send(session);
  });

  app.get("/watch/context", async (request) => {
    const user = await requireUser(request);
    const query = watchContextQuerySchema.parse(request.query);
    return relay.getWatchContext(user.id, {
      libraryItemId: query.libraryItemId ?? null,
      providerId: query.providerId,
      externalAnimeId: query.externalAnimeId,
      externalEpisodeId: query.externalEpisodeId,
    });
  });

  app.get("/playback/sessions/:id", async (request) => {
    const user = await requireUser(request);
    const id = (request.params as { id: string }).id;
    return relay.getPlaybackSession(user.id, id);
  });

  app.post("/playback/sessions/:id/progress", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updatePlaybackProgressInputSchema, request);
    const id = (request.params as { id: string }).id;
    return relay.updatePlaybackProgress(user.id, id, {
      ...payload,
      durationSeconds: payload.durationSeconds ?? null,
    });
  });

  app.get("/playback/sessions/:id/subtitles/:index", async (request, reply) => {
    const params = request.params as { id: string; index: string };
    const index = Number.parseInt(params.index, 10);
    const subtitle = request.sessionUser
      ? await relay.getPlaybackSubtitleTrack(request.sessionUser.id, params.id, index)
      : await relay.getPlaybackSubtitleTrackBySessionId(params.id, index);

    const subtitleUrl = new URL(subtitle.url);
    const upstream = await fetch(subtitleUrl, {
      headers: getSubtitleProxyHeaders(subtitleUrl),
    });
    if (!upstream.ok) {
      throw Object.assign(
        new Error(`Subtitle request failed with status ${upstream.status}`),
        { statusCode: 502 },
      );
    }

    const body = convertSubtitleToVtt(await upstream.text(), subtitle.format);
    return reply
      .header("cache-control", "private, max-age=300")
      .type("text/vtt; charset=utf-8")
      .send(body);
  });

  async function handleStreamRequest(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as { sessionId: string; "*": string | undefined };
    const target = request.sessionUser
      ? await relay.getPlaybackStreamTarget(
          request.sessionUser.id,
          params.sessionId,
          params["*"] ?? null,
        )
      : await relay.getPlaybackStreamTargetBySessionId(params.sessionId, params["*"] ?? null);

    if (
      target.proxyMode === "redirect" &&
      Object.keys(target.headers).length === 0 &&
      Object.keys(target.cookies).length === 0
    ) {
      return reply.redirect(target.upstreamUrl);
    }

    const upstream = await fetch(target.upstreamUrl, {
      headers: buildPlaybackRequestHeaders(target, {
        range: typeof request.headers.range === "string" ? request.headers.range : null,
      }),
    });

    reply.status(upstream.status);

    const upstreamContentType = upstream.headers.get("content-type") ?? "";
    const responseContentType = normalizeStreamContentType(target.upstreamUrl, upstreamContentType);
    const willRewriteHls = shouldRewriteHlsBody(target.upstreamUrl, upstreamContentType);
    const willRewriteDash = shouldRewriteDashBody(target.upstreamUrl, upstreamContentType);
    const willRewriteManifest = willRewriteHls || willRewriteDash;
    const passthroughHeaders = willRewriteManifest
      ? ["cache-control"]
      : ["content-length", "cache-control", "accept-ranges", "content-range"];
    for (const headerName of passthroughHeaders) {
      const value = upstream.headers.get(headerName);
      if (value) {
        reply.header(headerName, value);
      }
    }
    reply.header("content-type", responseContentType);

    if (willRewriteHls) {
      const playlist = await upstream.text();
      reply.type(responseContentType);
      return reply.send(
        rewriteHlsPlaylist(playlist, target.upstreamUrl, target.sessionId, {
          stripSubtitleRenditions:
            target.providerId === "hentaihaven" && playlist.includes("#EXT-X-STREAM-INF:"),
        }),
      );
    }

    if (willRewriteDash) {
      const manifest = await upstream.text();
      reply.type(responseContentType);
      return reply.send(rewriteDashManifest(manifest, target.upstreamUrl, target.sessionId));
    }

    if (!upstream.body) {
      return reply.send(await upstream.text());
    }

    return reply.send(Readable.fromWeb(upstream.body as never));
  }

  app.get("/stream/:sessionId", handleStreamRequest);
  app.get("/stream/:sessionId/*", handleStreamRequest);

  app.get("/playback/sessions/:id/compat.mp4", async (request, reply) => {
    const params = request.params as { id: string };
    const outputPath = path.join(compatibilityMp4CacheDir, `${params.id}.mp4`);
    const session = request.sessionUser
      ? await relay.getPlaybackSession(request.sessionUser.id, params.id)
      : await relay.getPlaybackSessionBySessionId(params.id);

    if (!session) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    if (session.mimeType !== "application/vnd.apple.mpegurl") {
      throw Object.assign(new Error("Compatibility MP4 fallback requires an HLS playback session."), {
        statusCode: 409,
      });
    }

    await ensureCompatibilityMp4CacheDir();
    if (!(await fileExists(outputPath))) {
      if (session.status !== "ready") {
        throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
      }

      const target = request.sessionUser
        ? await relay.getPlaybackStreamTarget(request.sessionUser.id, params.id, null)
        : await relay.getPlaybackStreamTargetBySessionId(params.id, null);
      const existingJob = compatibilityMp4Jobs.get(params.id);
      const generationJob =
        existingJob ??
        createCompatibilityMp4TranscodeJob(target, outputPath, (message) => {
          request.log.warn({ playbackSessionId: params.id, providerId: target.providerId }, message);
        }).finally(() => {
          compatibilityMp4Jobs.delete(params.id);
        });

      if (!existingJob) {
        compatibilityMp4Jobs.set(params.id, generationJob);
      }

      await generationJob;
    }

    const fileDetails = await stat(outputPath);
    const rangeHeader = typeof request.headers.range === "string" ? request.headers.range : null;
    const byteRange = rangeHeader ? parseByteRange(rangeHeader, fileDetails.size) : null;

    if (rangeHeader && !byteRange) {
      return reply
        .status(416)
        .header("content-range", `bytes */${fileDetails.size}`)
        .send();
    }

    const start = byteRange?.start ?? 0;
    const end = byteRange?.end ?? fileDetails.size - 1;
    const chunkSize = end - start + 1;
    const statusCode = byteRange ? 206 : 200;

    reply.status(statusCode);
    reply.header("accept-ranges", "bytes");
    reply.header("cache-control", "private, max-age=300");
    reply.header("content-length", chunkSize);
    reply.header("content-type", "video/mp4");
    if (byteRange) {
      reply.header("content-range", `bytes ${start}-${end}/${fileDetails.size}`);
    }

    if (request.method === "HEAD") {
      return reply.send();
    }

    return reply.send(createReadStream(outputPath, { start, end }));
  });

  app.get("/history", async (request) => {
    const user = await requireUser(request);
    return relay.getHistory(user.id);
  });

  app.get("/history/grouped", async (request) => {
    const user = await requireUser(request);
    return relay.getGroupedHistory(user.id);
  });

  app.get("/updates", async (request) => {
    const user = await requireUser(request);
    return relay.getUpdates(user.id);
  });

  app.post("/trackers/:trackerId/connect", async (request) => {
    const user = await requireUser(request);
    const trackerId = (request.params as { trackerId: "anilist" | "mal" }).trackerId;
    return relay.createTrackerConnection(user.id, trackerId);
  });

  app.delete("/trackers/:trackerId/connect", async (request) => {
    const user = await requireUser(request);
    const trackerId = (request.params as { trackerId: string }).trackerId;
    await relay.deleteTrackerConnection(user.id, trackerId);
    return { ok: true };
  });

  app.get("/trackers/entries", async (request) => {
    const user = await requireUser(request);
    return relay.getTrackerEntries(user.id);
  });

  app.patch("/trackers/entries/:id", async () => {
    throw Object.assign(
      new Error("Tracker entry updates are scaffolded but not implemented in this pass."),
      { statusCode: 501 },
    );
  });

  app.post("/imports/android-backup", async (request) => {
    const user = await requireAdmin(request);
    return relay.createImportJob(user.id);
  });

  app.get("/imports/:jobId", async (request) => {
    const user = await requireUser(request);
    const jobId = (request.params as { jobId: string }).jobId;
    return relay.getImportJob(user.id, jobId);
  });

  return app;
}
