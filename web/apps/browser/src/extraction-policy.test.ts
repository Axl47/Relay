import { describe, expect, it } from "vitest";
import {
  getExtractionRetryAttempts,
  getExtractionTimeoutMs,
  resolveProviderDomainOrThrow,
  shouldResetContextAfterExtraction,
} from "./extraction-policy";

describe("browser extraction policy", () => {
  it("resolves provider domains from shared provider definitions", () => {
    expect(resolveProviderDomainOrThrow("animetake")).toBe("animetake.com.co");
  });

  it("uses provider-specific timeout overrides and retry defaults", () => {
    expect(getExtractionTimeoutMs("animetake", "search", 15_000)).toBe(45_000);
    expect(getExtractionRetryAttempts("unknown-provider")).toBe(2);
  });

  it("exposes context reset policies", () => {
    expect(shouldResetContextAfterExtraction("hentaihaven", "playback")).toBe(true);
    expect(shouldResetContextAfterExtraction("hentaihaven", "search")).toBe(false);
  });
});
