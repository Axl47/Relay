import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";
import { getProviderMetadata } from "../provider-definitions";

export class AnimePaheProvider extends BrowserProtectedProviderBase {
  constructor() {
    super(getProviderMetadata("animepahe")!);
  }
}
