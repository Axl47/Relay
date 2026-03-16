import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  providerAnimeRefSchema,
  providerEpisodeRefSchema,
  providerIdSchema,
  searchInputSchema,
} from "@relay/contracts";
import { z } from "zod";
import { appConfig } from "./config";
import { toPublicError } from "./errors";
import { BrowserExtractionService } from "./extraction-service";

const baseExtractionBodySchema = z.object({
  providerId: providerIdSchema,
  baseUrl: z.string().url().optional(),
});

const searchBodySchema = baseExtractionBodySchema.extend({
  input: searchInputSchema,
});

const animeBodySchema = baseExtractionBodySchema.extend({
  input: providerAnimeRefSchema,
});

const episodesBodySchema = baseExtractionBodySchema.extend({
  input: providerAnimeRefSchema,
});

const playbackBodySchema = baseExtractionBodySchema.extend({
  input: providerEpisodeRefSchema,
});

function parseBody<T>(
  schema: z.ZodType<T>,
  request: FastifyRequest,
): T {
  return schema.parse(request.body);
}

export function buildApp(extractionService: BrowserExtractionService) {
  const app = Fastify({
    logger: {
      level: appConfig.LOG_LEVEL,
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toPublicError(error);
    reply.status(statusCode).send(body);
  });

  app.get("/health", async () => ({
    ok: true,
    service: "browser",
  }));

  app.post("/extract/search", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(searchBodySchema, request);
    const payload = await extractionService.search(
      body.providerId,
      {
        query: body.input.query,
        page: body.input.page ?? 1,
        limit: body.input.limit ?? 20,
      },
      body.baseUrl,
    );
    reply.status(200).send(payload);
  });

  app.post("/extract/anime", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(animeBodySchema, request);
    const payload = await extractionService.anime(body.providerId, body.input, body.baseUrl);
    reply.status(200).send(payload);
  });

  app.post("/extract/episodes", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(episodesBodySchema, request);
    const payload = await extractionService.episodes(body.providerId, body.input, body.baseUrl);
    reply.status(200).send(payload);
  });

  app.post("/extract/playback", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(playbackBodySchema, request);
    const payload = await extractionService.playback(body.providerId, body.input, body.baseUrl);
    reply.status(200).send(payload);
  });

  return app;
}
