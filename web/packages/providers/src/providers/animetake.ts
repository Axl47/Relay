import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";

export class AnimeTakeProvider extends BrowserProtectedProviderBase {
  constructor() {
    super({
      id: "animetake",
      displayName: "AnimeTake",
      baseUrl: "https://animetake.com.co",
      contentClass: "anime",
      executionMode: "browser",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    });
  }
}

