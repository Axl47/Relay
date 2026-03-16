import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";

export class HentaiHavenProvider extends BrowserProtectedProviderBase {
  constructor() {
    super({
      id: "hentaihaven",
      displayName: "HentaiHaven",
      baseUrl: "https://hentaihaven.xxx",
      contentClass: "hentai",
      executionMode: "browser",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    });
  }
}

