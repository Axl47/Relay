import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";

export class AnimeOnsenProvider extends BrowserProtectedProviderBase {
  constructor() {
    super({
      id: "animeonsen",
      displayName: "AnimeOnsen",
      baseUrl: "https://www.animeonsen.xyz",
      contentClass: "anime",
      executionMode: "browser",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    });
  }
}

