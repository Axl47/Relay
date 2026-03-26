import { describe, expect, it } from "vitest";
import {
  relayImportsJobResultSchema,
  relayPlaybackResolutionQueueName,
  relayProviderRefreshQueueName,
  relayQueueNameSchema,
} from "./worker";

describe("worker contracts", () => {
  it("exposes the shared queue names", () => {
    expect(relayQueueNameSchema.parse(relayProviderRefreshQueueName)).toBe(
      relayProviderRefreshQueueName,
    );
    expect(relayQueueNameSchema.parse(relayPlaybackResolutionQueueName)).toBe(
      relayPlaybackResolutionQueueName,
    );
  });

  it("validates worker result payloads", () => {
    expect(
      relayImportsJobResultSchema.parse({
        status: "completed",
        imported: 2,
        skipped: ["duplicate-entry"],
      }),
    ).toEqual({
      status: "completed",
      imported: 2,
      skipped: ["duplicate-entry"],
    });
  });
});
