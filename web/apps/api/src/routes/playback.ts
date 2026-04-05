import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createPlaybackSessionInputSchema,
  updatePlaybackProgressInputSchema,
  watchContextQuerySchema,
} from "@relay/contracts";
import { parseBody } from "../lib/http";
import { convertSubtitleToVtt } from "../lib/subtitles";
import type { ApiServiceContainer } from "../services";
import {
  compatibilityMp4CacheDir,
  createCompatibilityMp4TranscodeJob,
  ensureCompatibilityMp4CacheDir,
  fileExists,
  parseByteRange,
} from "../streaming/compatibility-mp4";
import {
  buildPlaybackRequestHeaders,
  getSubtitleProxyHeaders,
  normalizeStreamContentType,
  rewriteDashManifest,
  rewriteHlsPlaylist,
  shouldRewriteDashBody,
  shouldRewriteHlsBody,
} from "../streaming/proxy";
import { requireUser } from "./guards";

type RegisterPlaybackRoutesOptions = {
  compatibilityMp4Jobs: Map<string, Promise<string>>;
};

async function handleStreamRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  services: ApiServiceContainer,
) {
  const params = request.params as { sessionId: string; "*": string | undefined };
  const target = request.sessionUser
    ? await services.playback.getPlaybackStreamTarget(
        request.sessionUser.id,
        params.sessionId,
        params["*"] ?? null,
      )
    : await services.playback.getPlaybackStreamTargetBySessionId(params.sessionId, params["*"] ?? null);

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

export async function registerPlaybackRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
  options: RegisterPlaybackRoutesOptions,
) {
  app.post("/playback/sessions", async (request, reply) => {
    const user = await requireUser(request);
    const payload = parseBody(createPlaybackSessionInputSchema, request);
    const session = await services.playback.createPlaybackSession(user.id, {
      ...payload,
      libraryItemId: payload.libraryItemId ?? null,
    });
    reply.status(session.status === "ready" ? 201 : 202).send(session);
  });

  app.get("/watch/context", async (request) => {
    const user = await requireUser(request);
    const query = watchContextQuerySchema.parse(request.query);
    return services.playback.getWatchContext(user.id, {
      libraryItemId: query.libraryItemId ?? null,
      providerId: query.providerId,
      externalAnimeId: query.externalAnimeId,
      externalEpisodeId: query.externalEpisodeId,
    });
  });

  app.get("/playback/sessions/:id", async (request) => {
    const user = await requireUser(request);
    const id = (request.params as { id: string }).id;
    return services.playback.getPlaybackSession(user.id, id);
  });

  app.post("/playback/sessions/:id/progress", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updatePlaybackProgressInputSchema, request);
    const id = (request.params as { id: string }).id;
    return services.playback.updatePlaybackProgress(user.id, id, {
      ...payload,
      durationSeconds: payload.durationSeconds ?? null,
    });
  });

  app.get("/playback/sessions/:id/subtitles/:index", async (request, reply) => {
    const params = request.params as { id: string; index: string };
    const index = Number.parseInt(params.index, 10);
    const subtitle = request.sessionUser
      ? await services.playback.getPlaybackSubtitleTrack(request.sessionUser.id, params.id, index)
      : await services.playback.getPlaybackSubtitleTrackBySessionId(params.id, index);

    const subtitleUrl = new URL(subtitle.url);
    const upstream = await fetch(subtitleUrl, {
      headers: getSubtitleProxyHeaders(subtitleUrl),
    });
    if (!upstream.ok) {
      throw Object.assign(new Error(`Subtitle request failed with status ${upstream.status}`), {
        statusCode: 502,
      });
    }

    const body = convertSubtitleToVtt(await upstream.text(), subtitle.format);
    return reply
      .header("cache-control", "private, max-age=300")
      .type("text/vtt; charset=utf-8")
      .send(body);
  });

  app.get("/stream/:sessionId", async (request, reply) =>
    handleStreamRequest(request, reply, services),
  );
  app.get("/stream/:sessionId/*", async (request, reply) =>
    handleStreamRequest(request, reply, services),
  );

  app.get("/playback/sessions/:id/compat.mp4", async (request, reply) => {
    const params = request.params as { id: string };
    const outputPath = path.join(compatibilityMp4CacheDir, `${params.id}.mp4`);
    const session = request.sessionUser
      ? await services.playback.getPlaybackSession(request.sessionUser.id, params.id)
      : await services.playback.getPlaybackSessionBySessionId(params.id);

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
        ? await services.playback.getPlaybackStreamTarget(request.sessionUser.id, params.id, null)
        : await services.playback.getPlaybackStreamTargetBySessionId(params.id, null);
      const existingJob = options.compatibilityMp4Jobs.get(params.id);
      const generationJob =
        existingJob ??
        createCompatibilityMp4TranscodeJob(target, outputPath, (message) => {
          request.log.warn({ playbackSessionId: params.id, providerId: target.providerId }, message);
        }).finally(() => {
          options.compatibilityMp4Jobs.delete(params.id);
        });

      if (!existingJob) {
        options.compatibilityMp4Jobs.set(params.id, generationJob);
      }

      await generationJob;
    }

    const fileDetails = await stat(outputPath);
    const rangeHeader = typeof request.headers.range === "string" ? request.headers.range : null;
    const byteRange = rangeHeader ? parseByteRange(rangeHeader, fileDetails.size) : null;

    if (rangeHeader && !byteRange) {
      return reply.status(416).header("content-range", `bytes */${fileDetails.size}`).send();
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
}
