import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";
import { getProviderMetadata } from "../provider-definitions";

export class AnimeTakeProvider extends BrowserProtectedProviderBase {
  constructor() {
    super(getProviderMetadata("animetake")!);
  }
}
