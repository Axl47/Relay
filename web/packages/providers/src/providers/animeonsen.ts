import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";
import { getProviderMetadata } from "../provider-definitions";

export class AnimeOnsenProvider extends BrowserProtectedProviderBase {
  constructor() {
    super(getProviderMetadata("animeonsen")!);
  }
}
