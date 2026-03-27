import type { FastifyInstance } from "fastify";
import type { ApiServiceContainer } from "../services";
import { requireAdmin, requireUser } from "./guards";

export async function registerImportRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.post("/imports/android-backup", async (request) => {
    const user = await requireAdmin(request);
    return services.imports.createImportJob(user.id);
  });

  app.get("/imports/:jobId", async (request) => {
    const user = await requireUser(request);
    const jobId = (request.params as { jobId: string }).jobId;
    return services.imports.getImportJob(user.id, jobId);
  });
}
