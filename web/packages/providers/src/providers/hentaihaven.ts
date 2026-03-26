import { BrowserProtectedProviderBase } from "../base/browser-protected-provider-base";
import { getProviderMetadata } from "../provider-definitions";

export class HentaiHavenProvider extends BrowserProtectedProviderBase {
  constructor() {
    super(getProviderMetadata("hentaihaven")!);
  }
}
