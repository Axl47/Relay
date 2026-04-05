import type { FastifyInstance } from "fastify";
import {
  assignCategoriesInputSchema,
  createCategoryInputSchema,
  updateCategoryInputSchema,
  updateLibraryItemInputSchema,
  upsertLibraryItemInputSchema,
} from "@relay/contracts";
import { parseBody } from "../lib/http";
import type { ApiServiceContainer } from "../services";
import { requireUser } from "./guards";

export async function registerLibraryRoutes(
  app: FastifyInstance,
  services: ApiServiceContainer,
) {
  app.get("/library", async (request) => {
    const user = await requireUser(request);
    const [items, categories] = await Promise.all([
      services.library.listLibrary(user.id),
      services.library.listCategories(user.id),
    ]);
    return { items, categories };
  });

  app.get("/library/dashboard", async (request) => {
    const user = await requireUser(request);
    return services.library.getLibraryDashboard(user.id);
  });

  app.post("/library/items", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(upsertLibraryItemInputSchema, request);
    return services.library.addLibraryItem(user.id, {
      ...payload,
      status: payload.status ?? "watching",
      coverImage: payload.coverImage ?? null,
      kind: payload.kind ?? "unknown",
    });
  });

  app.patch("/library/items/:id", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updateLibraryItemInputSchema, request);
    const id = (request.params as { id: string }).id;
    return services.library.updateLibraryItem(user.id, id, payload);
  });

  app.delete("/library/items/:id", async (request) => {
    const user = await requireUser(request);
    const id = (request.params as { id: string }).id;
    await services.library.deleteLibraryItem(user.id, id);
    return { ok: true };
  });

  app.post("/library/categories", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(createCategoryInputSchema, request);
    return services.library.createCategory(user.id, payload);
  });

  app.patch("/library/categories/:id", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(updateCategoryInputSchema, request);
    const id = (request.params as { id: string }).id;
    return services.library.updateCategory(user.id, id, payload);
  });

  app.post("/library/items/:id/categories", async (request) => {
    const user = await requireUser(request);
    const payload = parseBody(assignCategoriesInputSchema, request);
    const id = (request.params as { id: string }).id;
    await services.library.assignCategories(user.id, id, payload);
    return { ok: true };
  });
}
