import { z } from "zod";
import { providerHealthSchema, providerMetadataSchema } from "./common";

export const providerSummarySchema = providerMetadataSchema.extend({
  enabled: z.boolean(),
  priority: z.number().int().min(0),
  health: providerHealthSchema,
});

export const updateProviderConfigInputSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

export type ProviderSummary = z.infer<typeof providerSummarySchema>;
export type UpdateProviderConfigInput = z.infer<typeof updateProviderConfigInputSchema>;
