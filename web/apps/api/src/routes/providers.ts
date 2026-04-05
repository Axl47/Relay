import type { FastifyInstance } from "fastify";
import { updateProviderConfigInputSchema } from "@relay/contracts";
import { parseBody } from "../lib/http";
import type { ApiServiceContainer } from "../services";
import { requireAdmin, requireUser } from "./guards";

export async function registerProviderRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.get("/providers", async (request) => {
    const user = await requireUser(request);
    return services.providers.listProviders(user.id);
  });

  app.patch("/providers/:providerId/config", async (request) => {
    const user = await requireAdmin(request);
    const payload = parseBody(updateProviderConfigInputSchema, request);
    const providerId = (request.params as { providerId: string }).providerId;
    return services.providers.updateProviderConfig(user.id, providerId, payload);
  });
}
