import { z } from "zod";

export const relayImportsQueueName = "relay-imports";
export const relayProviderRefreshQueueName = "relay-provider-refresh";
export const relayPlaybackResolutionQueueName = "relay-playback-resolution";

export const relayQueueNameSchema = z.enum([
  relayImportsQueueName,
  relayProviderRefreshQueueName,
  relayPlaybackResolutionQueueName,
]);

export const relayImportsJobResultSchema = z.object({
  status: z.literal("completed"),
  imported: z.number().int().nonnegative(),
  skipped: z.array(z.string()).default([]),
});

export const relayProviderRefreshJobResultSchema = z.object({
  refreshedAt: z.string(),
});

export const relayPlaybackResolutionJobResultSchema = z.object({
  resolvedAt: z.string(),
});

export type RelayQueueName = z.infer<typeof relayQueueNameSchema>;
export type RelayImportsJobResult = z.infer<typeof relayImportsJobResultSchema>;
export type RelayProviderRefreshJobResult = z.infer<
  typeof relayProviderRefreshJobResultSchema
>;
export type RelayPlaybackResolutionJobResult = z.infer<
  typeof relayPlaybackResolutionJobResultSchema
>;
