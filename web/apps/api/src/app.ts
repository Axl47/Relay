import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
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
import { z } from "zod";
import { appConfig } from "./config";
import { parseBody, setSessionCookie } from "./lib/http";
import { convertSubtitleToVtt } from "./lib/subtitles";
import { RelayService } from "./services/relay-service";

const DEFAULT_STREAM_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const ABSOLUTE_UPSTREAM_PATH_PREFIX = "__upstream__/";
const PROXY_UPSTREAM_ALIAS_SUFFIX = "~relay";
const COMPATIBILITY_MP4_CACHE_DIR = path.join(os.tmpdir(), "relay-compat-mp4");
const COMPATIBILITY_MP4_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function getMediaProxyHeaders(url: URL) {
  const headers: Record<string, string> = {
    "user-agent": DEFAULT_STREAM_USER_AGENT,
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  };

  if (url.hostname === "hanime-cdn.com" || url.hostname.endsWith(".hanime-cdn.com")) {
    headers.referer = "https://hanime.tv/";
    headers.origin = "https://hanime.tv";
  }

  return headers;
}

function getSubtitleProxyHeaders(url: URL) {
  const headers: Record<string, string> = {
    "user-agent": DEFAULT_STREAM_USER_AGENT,
    "accept-language": "en-US,en;q=0.9",
  };

  if (url.hostname === "api.animeonsen.xyz" || url.hostname.endsWith(".animeonsen.xyz")) {
    headers.referer = "https://www.animeonsen.xyz/";
    headers.origin = "https://www.animeonsen.xyz";
  }

  return headers;
}

function getProxyUpstreamAlias(upstreamUrl: string) {
  try {
    const parsedUrl = new URL(upstreamUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (
      hostname === "fdc.anpustream.com" &&
      (/\/snd\/(?:i\.mp4|snd\d+\.jpg)$/i.test(pathname) ||
        /\/(?:i\.mp4|ha\d+\.jpg)$/i.test(pathname))
    ) {
      return `${PROXY_UPSTREAM_ALIAS_SUFFIX}.mp4`;
    }

    if (
      hostname.endsWith(".owocdn.top") &&
      /\/segment-\d+-v\d+-a\d+\.jpg$/i.test(pathname)
    ) {
      return `${PROXY_UPSTREAM_ALIAS_SUFFIX}.ts`;
    }
  } catch {
    return "";
  }

  return "";
}

function buildProxyStreamPath(sessionId: string, upstreamUrl: string) {
  return `/stream/${sessionId}/${ABSOLUTE_UPSTREAM_PATH_PREFIX}${encodeURIComponent(upstreamUrl)}${getProxyUpstreamAlias(upstreamUrl)}`;
}

function rewritePlaylistUri(value: string, baseUrl: string, sessionId: string) {
  const absoluteUrl = new URL(value, baseUrl).toString();
  return buildProxyStreamPath(sessionId, absoluteUrl);
}

function stripHlsSubtitleRenditions(body: string) {
  return body
    .split("\n")
    .filter((line) => !/^#EXT-X-MEDIA:.*TYPE=SUBTITLES/i.test(line.trim()))
    .map((line) => {
      if (!line.startsWith("#EXT-X-STREAM-INF:")) {
        return line;
      }

      return line
        .replace(/,SUBTITLES="[^"]*"/g, "")
        .replace(/SUBTITLES="[^"]*",/g, "");
    })
    .join("\n");
}

function rewriteHlsPlaylist(
  body: string,
  baseUrl: string,
  sessionId: string,
  options?: { stripSubtitleRenditions?: boolean },
) {
  const normalizedBody = options?.stripSubtitleRenditions ? stripHlsSubtitleRenditions(body) : body;

  return normalizedBody
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (!trimmed.startsWith("#")) {
        return rewritePlaylistUri(trimmed, baseUrl, sessionId);
      }

      if (!trimmed.includes('URI="')) {
        return line;
      }

      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) =>
        `URI="${rewritePlaylistUri(uri, baseUrl, sessionId)}"`,
      );
    })
    .join("\n");
}

function shouldRewriteHlsBody(upstreamUrl: string, contentType: string) {
  if (!/mpegurl/i.test(contentType)) {
    return false;
  }

  try {
    const pathname = new URL(upstreamUrl).pathname.toLowerCase();
    return pathname.endsWith(".m3u8") || pathname.endsWith(".m3u");
  } catch {
    return /\.m3u8?(?:\?|$)/i.test(upstreamUrl);
  }
}

function normalizeStreamContentType(upstreamUrl: string, contentType: string) {
  const normalizedContentType = contentType.trim();

  try {
    const parsedUrl = new URL(upstreamUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (hostname === "fdc.anpustream.com") {
      if (/\/snd\/(?:i\.mp4|snd\d+\.jpg)$/i.test(pathname)) {
        return "audio/mp4";
      }

      if (/\/(?:i\.mp4|ha\d+\.jpg)$/i.test(pathname)) {
        return "video/mp4";
      }
    }

    if (
      hostname.endsWith(".owocdn.top") &&
      /\/segment-\d+-v\d+-a\d+\.jpg$/i.test(pathname)
    ) {
      return "video/mp2t";
    }

    if (/mpegurl/i.test(normalizedContentType) && pathname.endsWith(".mp4")) {
      return "video/mp4";
    }
  } catch {
    if (/mpegurl/i.test(normalizedContentType) && /\.mp4(?:\?|$)/i.test(upstreamUrl)) {
      return "video/mp4";
    }
  }

  return normalizedContentType || "application/octet-stream";
}

function buildPlaybackRequestHeaders(
  target: {
    headers: Record<string, string>;
    cookies: Record<string, string>;
  },
  options?: {
    range?: string | null;
  },
) {
  const cookieHeader = Object.entries(target.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  return {
    "user-agent": target.headers["user-agent"] ?? DEFAULT_STREAM_USER_AGENT,
    "accept-language": target.headers["accept-language"] ?? "en-US,en;q=0.9",
    ...target.headers,
    ...(options?.range ? { range: options.range } : {}),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function buildFfmpegHeaderString(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    const details = await stat(filePath);
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}

async function cleanupCompatibilityMp4Cache() {
  try {
    const entries = await readdir(COMPATIBILITY_MP4_CACHE_DIR, { withFileTypes: true });
    const expirationCutoff = Date.now() - COMPATIBILITY_MP4_CACHE_TTL_MS;

    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const filePath = path.join(COMPATIBILITY_MP4_CACHE_DIR, entry.name);
          const details = await stat(filePath).catch(() => null);
          if (!details || details.mtimeMs >= expirationCutoff) {
            return;
          }

          await rm(filePath, { force: true }).catch(() => undefined);
        }),
    );
  } catch {
    // Best-effort cache cleanup; playback should not fail because cleanup could not run.
  }
}

function createCompatibilityMp4TranscodeJob(
  target: {
    providerId: string;
    upstreamUrl: string;
    headers: Record<string, string>;
    cookies: Record<string, string>;
  },
  outputPath: string,
  onLog: (message: string) => void,
) {
  const ffmpegHeaders = buildFfmpegHeaderString(buildPlaybackRequestHeaders(target));
  const tempOutputPath = `${outputPath}.tmp.mp4`;
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-nostdin",
      "-allowed_extensions",
      "ALL",
      "-extension_picky",
      "0",
      "-headers",
      ffmpegHeaders,
      "-i",
      target.upstreamUrl,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-dn",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-profile:a",
      "aac_low",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      tempOutputPath,
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
  });

  return new Promise<string>((resolve, reject) => {
    ffmpeg.on("error", async (error) => {
      await rm(tempOutputPath, { force: true }).catch(() => undefined);
      reject(error);
    });

    ffmpeg.on("close", async (code) => {
      if (code === 0) {
        await rename(tempOutputPath, outputPath);
        resolve(outputPath);
        return;
      }

      onLog(
        `FFmpeg compatibility transcode failed for provider "${target.providerId}" with code ${code}. ${stderr.trim()}`.trim(),
      );
      await rm(tempOutputPath, { force: true }).catch(() => undefined);
      reject(new Error("Compatibility transcode failed."));
    });
  });
}

function parseByteRange(rangeHeader: string, fileSize: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return null;
  }

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(0, fileSize - suffixLength);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  const requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) {
    return null;
  }

  if (start < 0 || start >= fileSize || requestedEnd < start) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
  };
}

const catalogAnimeQuerySchema = z.object({
  externalAnimeId: z.string().min(1),
});

const mediaProxyQuerySchema = z.object({
  url: z.string().url(),
});

const watchContextQuerySchema = z.object({
  libraryItemId: z.string().uuid().optional(),
  providerId: z.string().min(1),
  externalAnimeId: z.string().min(1),
  externalEpisodeId: z.string().min(1),
});

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
    const { externalAnimeId } = catalogAnimeQuerySchema.parse(request.query);
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
    const { externalAnimeId } = catalogAnimeQuerySchema.parse(request.query);
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
    const passthroughHeaders = willRewriteHls
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

    if (!upstream.body) {
      return reply.send(await upstream.text());
    }

    return reply.send(Readable.fromWeb(upstream.body as never));
  }

  app.get("/stream/:sessionId", handleStreamRequest);
  app.get("/stream/:sessionId/*", handleStreamRequest);

  app.get("/playback/sessions/:id/compat.mp4", async (request, reply) => {
    const params = request.params as { id: string };
    const target = request.sessionUser
      ? await relay.getPlaybackStreamTarget(request.sessionUser.id, params.id, null)
      : await relay.getPlaybackStreamTargetBySessionId(params.id, null);

    if (target.mimeType !== "application/vnd.apple.mpegurl") {
      throw Object.assign(new Error("Compatibility MP4 fallback requires an HLS playback session."), {
        statusCode: 409,
      });
    }

    await mkdir(COMPATIBILITY_MP4_CACHE_DIR, { recursive: true });
    void cleanupCompatibilityMp4Cache();

    const outputPath = path.join(COMPATIBILITY_MP4_CACHE_DIR, `${params.id}.mp4`);
    if (!(await fileExists(outputPath))) {
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
