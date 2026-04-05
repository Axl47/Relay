import { describe, expect, it } from "vitest";
import { ProviderService } from "./provider-service";

describe("ProviderService", () => {
  it("hides providers that are not registered in the active runtime", async () => {
    const service = new ProviderService(
      {
        async listProviders() {
          return [
            {
              id: "animetake",
              displayName: "AnimeTake",
              baseUrl: "https://animetake.com.co",
              contentClass: "anime",
              executionMode: "browser",
              requiresAdultGate: false,
              supportsSearch: true,
              supportsTrackerSync: false,
              defaultEnabled: true,
            },
            {
              id: "xtream",
              displayName: "Xtream",
              baseUrl: "https://xtream.rip",
              contentClass: "general",
              executionMode: "http",
              requiresAdultGate: false,
              supportsSearch: true,
              supportsTrackerSync: false,
              defaultEnabled: true,
            },
          ];
        },
        async listProviderConfigs() {
          return [];
        },
        async listHealthEvents() {
          return [];
        },
        async upsertProvider() {},
        async findProviderConfig() {
          return null;
        },
        async upsertProviderConfig() {
          throw new Error("not used");
        },
        async insertHealthEvent() {},
        async insertProviderConfigIfMissing() {},
      } as never,
      {
        async findPreferences() {
          return {
            adultContentVisible: false,
            allowedContentClasses: ["anime"],
          };
        },
      } as never,
      {
        async registry() {
          return {
            list() {
              return [
                {
                  metadata: {
                    id: "animetake",
                    contentClass: "anime",
                    executionMode: "browser",
                    defaultEnabled: true,
                    displayName: "AnimeTake",
                    baseUrl: "https://animetake.com.co",
                    requiresAdultGate: false,
                    supportsSearch: true,
                    supportsTrackerSync: false,
                  },
                },
              ];
            },
            get() {
              return null;
            },
          };
        },
        async getProviderOrThrow() {
          throw new Error("not used");
        },
      } as never,
    );

    const providers = await service.listProviders("user-1");
    expect(providers.map((provider) => provider.id)).toEqual(["animetake"]);
  });
});
