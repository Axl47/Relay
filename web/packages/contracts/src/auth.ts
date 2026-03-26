import { z } from "zod";
import { userPreferencesSchema } from "./library";

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  isAdmin: z.boolean(),
});

export const meResponseSchema = z.object({
  user: sessionUserSchema,
  preferences: userPreferencesSchema,
});

export const authBootstrapInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  displayName: z.string().min(1),
});

export const authLoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authResponseSchema = z.object({
  user: sessionUserSchema,
  sessionId: z.string().uuid(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type AuthBootstrapInput = z.infer<typeof authBootstrapInputSchema>;
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
