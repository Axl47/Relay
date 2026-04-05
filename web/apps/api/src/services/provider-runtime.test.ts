import { describe, expect, it } from "vitest";
import { normalizePreferences } from "./provider-runtime";

describe("normalizePreferences", () => {
  it("includes general content by default when adult content is disabled", () => {
    const preferences = normalizePreferences({
      adultContentVisible: false,
      allowedContentClasses: ["anime"],
    });

    expect(preferences.allowedContentClasses).toEqual(["anime", "general"]);
  });

  it("retains general alongside adult classes when adult content is enabled", () => {
    const preferences = normalizePreferences({
      adultContentVisible: true,
      allowedContentClasses: ["anime", "hentai"],
    });

    expect(preferences.allowedContentClasses).toEqual(
      expect.arrayContaining(["anime", "general", "hentai"]),
    );
  });
});
