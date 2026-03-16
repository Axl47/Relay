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
  createCategoryInputSchema,
  createPlaybackSessionInputSchema,
  searchInputSchema,
  updateCategoryInputSchema,
  updateLibraryItemInputSchema,
  updatePlaybackProgressInputSchema,
  updateProviderConfigInputSchema,
  updateUserPreferencesInputSchema,
  upsertLibraryItemInputSchema,
} from "@relay/contracts";
import { appConfig } from "./config";
import { parseBody, setSessionCookie } from "./lib/http";
import { convertSubtitleToVtt } from "./lib/subtitles";
import { RelayService } from "./services/relay-service";

const DEFAULT_STREAM_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

declare module "fastify" {
  interface FastifyRequest {
    sessionUser?: Awaited<ReturnType<RelayService["getSessionUser"]>>;
  }
}

export async function buildApi() {
  const app = Fastify({ logger: true });
  const relay = new RelayService();

  await app.register(cors, {
    origin: appConfig.CORS_ORIGIN,
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

  app.get("/catalog/:providerId/anime/:externalAnimeId", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = request.params as {
      providerId: string;
      externalAnimeId: string;
    };
    return relay.getAnime(user.id, providerId, externalAnimeId);
  });

  app.get("/catalog/:providerId/anime/:externalAnimeId/episodes", async (request) => {
    const user = await requireUser(request);
    const { providerId, externalAnimeId } = request.params as {
      providerId: string;
      externalAnimeId: string;
    };
    return relay.getEpisodes(user.id, providerId, externalAnimeId);
  });

  app.get("/library", async (request) => {
    const user = await requireUser(request);
    const [items, categories] = await Promise.all([
      relay.listLibrary(user.id),
      relay.listCategories(user.id),
    ]);
    return { items, categories };
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

    const upstream = await fetch(subtitle.url, {
      headers: {
        "user-agent": DEFAULT_STREAM_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
      },
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
    const cookieHeader = Object.entries(target.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");

    if (
      target.proxyMode === "redirect" &&
      Object.keys(target.headers).length === 0 &&
      Object.keys(target.cookies).length === 0
    ) {
      return reply.redirect(target.upstreamUrl);
    }

    const upstream = await fetch(target.upstreamUrl, {
      headers: {
        "user-agent": target.headers["user-agent"] ?? DEFAULT_STREAM_USER_AGENT,
        "accept-language": target.headers["accept-language"] ?? "en-US,en;q=0.9",
        ...target.headers,
        ...(typeof request.headers.range === "string" ? { range: request.headers.range } : {}),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });

    reply.status(upstream.status);

    const passthroughHeaders = [
      "content-type",
      "content-length",
      "cache-control",
      "accept-ranges",
      "content-range",
    ];
    for (const headerName of passthroughHeaders) {
      const value = upstream.headers.get(headerName);
      if (value) {
        reply.header(headerName, value);
      }
    }

    if (!upstream.body) {
      return reply.send(await upstream.text());
    }

    return reply.send(Readable.fromWeb(upstream.body as never));
  }

  app.get("/stream/:sessionId", handleStreamRequest);
  app.get("/stream/:sessionId/*", handleStreamRequest);

  app.get("/history", async (request) => {
    const user = await requireUser(request);
    return relay.getHistory(user.id);
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
