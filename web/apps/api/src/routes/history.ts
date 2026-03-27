import type { FastifyInstance } from "fastify";
import type { ApiServiceContainer } from "../services";
import { requireUser } from "./guards";

export async function registerHistoryRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.get("/history", async (request) => {
    const user = await requireUser(request);
    return services.history.getHistory(user.id);
  });

  app.get("/history/grouped", async (request) => {
    const user = await requireUser(request);
    return services.history.getGroupedHistory(user.id);
  });

  app.get("/updates", async (request) => {
    const user = await requireUser(request);
    return services.history.getUpdates(user.id);
  });
}
