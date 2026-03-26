import { describe, expect, it } from "vitest";
import {
  catalogAnimeQuerySchema,
  catalogSearchStreamEventSchema,
} from "./catalog";

describe("catalog contracts", () => {
  it("validates canonical query-based anime lookups", () => {
    expect(
      catalogAnimeQuerySchema.parse({
        providerId: "javguru",
        externalAnimeId: "123/slug",
      }),
    ).toEqual({
      providerId: "javguru",
      externalAnimeId: "123/slug",
    });
  });

  it("validates NDJSON stream events shared by API and client", () => {
    expect(
      catalogSearchStreamEventSchema.parse({
        type: "progress",
        completedProviders: 1,
        totalProviders: 3,
        provider: {
          providerId: "animetake",
          status: "success",
          itemCount: 4,
          latencyMs: 150,
        },
      }),
    ).toMatchObject({
      type: "progress",
      completedProviders: 1,
      totalProviders: 3,
    });
  });
});
