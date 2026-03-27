import type { FastifyInstance } from "fastify";

export async function registerCoreRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));
}
