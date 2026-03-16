import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError, type ZodSchema } from "zod";

export function parseBody<T>(schema: ZodSchema<T>, request: FastifyRequest) {
  try {
    return schema.parse(request.body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw Object.assign(new Error("Invalid request body"), {
        statusCode: 400,
        details: error.flatten(),
      });
    }
    throw error;
  }
}

export function setSessionCookie(reply: FastifyReply, name: string, sessionId: string) {
  reply.setCookie(name, sessionId, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
}
