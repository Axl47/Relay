import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";

export class AnimePaheProvider extends BrowserProtectedProviderBase {
  constructor() {
    super({
      id: "animepahe",
      displayName: "AnimePahe",
      baseUrl: "https://animepahe.si",
      contentClass: "anime",
      executionMode: "browser",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    });
  }
}

