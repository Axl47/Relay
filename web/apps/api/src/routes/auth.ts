import type { FastifyInstance } from "fastify";
import {
  authBootstrapInputSchema,
  authLoginInputSchema,
  updateUserPreferencesInputSchema,
} from "@relay/contracts";
import { appConfig } from "../config";
import { parseBody, setSessionCookie } from "../lib/http";
import type { ApiServiceContainer } from "../services";
import { requireUser } from "./guards";

export async function registerAuthRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.post("/auth/bootstrap", async (request, reply) => {
    const payload = parseBody(authBootstrapInputSchema, request);
    const response = await services.auth.bootstrap(payload);
    setSessionCookie(reply, appConfig.SESSION_COOKIE_NAME, response.sessionId);
    return response;
  });

  app.post("/auth/login", async (request, reply) => {
    const payload = parseBody(authLoginInputSchema, request);
    const response = await services.auth.login(payload);
    setSessionCookie(reply, appConfig.SESSION_COOKIE_NAME, response.sessionId);
    return response;
  });

  app.post("/auth/logout", async (request, reply) => {
    const sessionId = request.cookies[appConfig.SESSION_COOKIE_NAME];
    if (sessionId) {
      await services.auth.logout(sessionId);
    }
    reply.clearCookie(appConfig.SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/me", async (request) => {
    const user = await requireUser(request);
    const preferences = await services.auth.getPreferences(user.id);
    return { user, preferences };
  });

  app.patch("/me/preferences", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updateUserPreferencesInputSchema, request);
    return services.auth.updatePreferences(user.id, payload);
  });
}
