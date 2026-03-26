import { describe, expect, it } from "vitest";
import { relayImportsQueueName, relayPlaybackResolutionQueueName, relayProviderRefreshQueueName } from "@relay/contracts";
import { handleImportsJob } from "./imports";
import { handlePlaybackResolutionJob } from "./playback-resolution";
import { handleProviderRefreshJob } from "./provider-refresh";

function createJob(id: string, data: Record<string, unknown> = {}) {
  return {
    id,
    data,
  };
}

describe("worker job handlers", () => {
  it("returns validated import results", async () => {
    await expect(handleImportsJob(createJob("job-1") as never)).resolves.toMatchObject({
      status: "completed",
      imported: 0,
    });
    expect(relayImportsQueueName).toBe("relay-imports");
  });

  it("returns validated provider refresh and playback resolution results", async () => {
    await expect(handleProviderRefreshJob(createJob("job-2") as never)).resolves.toHaveProperty(
      "refreshedAt",
    );
    await expect(handlePlaybackResolutionJob(createJob("job-3") as never)).resolves.toHaveProperty(
      "resolvedAt",
    );
    expect(relayProviderRefreshQueueName).toBe("relay-provider-refresh");
    expect(relayPlaybackResolutionQueueName).toBe("relay-playback-resolution");
  });
});
