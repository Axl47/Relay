import type { FastifyInstance } from "fastify";
import type { ApiServiceContainer } from "../services";
import { requireUser } from "./guards";

export async function registerTrackerRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.post("/trackers/:trackerId/connect", async (request) => {
    const user = await requireUser(request);
    const trackerId = (request.params as { trackerId: "anilist" | "mal" }).trackerId;
    return services.trackers.createTrackerConnection(user.id, trackerId);
  });

  app.delete("/trackers/:trackerId/connect", async (request) => {
    const user = await requireUser(request);
    const trackerId = (request.params as { trackerId: string }).trackerId;
    await services.trackers.deleteTrackerConnection(user.id, trackerId);
    return { ok: true };
  });

  app.get("/trackers/entries", async (request) => {
    const user = await requireUser(request);
    return services.trackers.getTrackerEntries(user.id);
  });

  app.patch("/trackers/entries/:id", async () => {
    throw Object.assign(
      new Error("Tracker entry updates are scaffolded but not implemented in this pass."),
      { statusCode: 501 },
    );
  });
}
