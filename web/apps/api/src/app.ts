import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { appConfig } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerCatalogRoutes } from "./routes/catalog";
import { registerCoreRoutes } from "./routes/core";
import { registerHistoryRoutes } from "./routes/history";
import { registerImportRoutes } from "./routes/imports";
import { registerLibraryRoutes } from "./routes/library";
import { registerPlaybackRoutes } from "./routes/playback";
import { registerProviderRoutes } from "./routes/providers";
import { registerTrackerRoutes } from "./routes/trackers";
import type { ApiServiceContainer, SessionUser } from "./services";
import { buildApiServiceContainer } from "./services";

declare module "fastify" {
  interface FastifyRequest {
    sessionUser?: SessionUser | null;
  }
}

export async function buildApi(input?: { services?: ApiServiceContainer }) {
  const app = Fastify({ logger: true });
  const services = input?.services ?? buildApiServiceContainer();
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
    request.sessionUser = await services.auth.getSessionUser(sessionId);
  });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    reply.status(statusCode).send({
      error: error instanceof Error ? error.message : "Unknown error",
      details: (error as { details?: unknown }).details ?? null,
    });
  });

  await registerCoreRoutes(app);
  await registerAuthRoutes(app, services);
  await registerProviderRoutes(app, services);
  await registerCatalogRoutes(app, services);
  await registerLibraryRoutes(app, services);
  await registerPlaybackRoutes(app, services, { compatibilityMp4Jobs });
  await registerHistoryRoutes(app, services);
  await registerTrackerRoutes(app, services);
  await registerImportRoutes(app, services);

  return app;
}
