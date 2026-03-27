import type { FastifyRequest } from "fastify";
import type { SessionUser } from "../services";

export async function requireUser(request: FastifyRequest): Promise<SessionUser> {
  if (!request.sessionUser) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }

  return request.sessionUser;
}

export async function requireAdmin(request: FastifyRequest): Promise<SessionUser> {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    throw Object.assign(new Error("Admin access required"), { statusCode: 403 });
  }

  return user;
}
