import type { ProviderMetadata } from "@relay/contracts";
import { RelayProviderBase } from "./relay-provider-base";

export abstract class SsrManifestProviderBase extends RelayProviderBase {
  constructor(metadata: ProviderMetadata) {
    super(metadata);
  }

  protected extractScriptBody(html: string, pattern: RegExp) {
    const match = html.match(pattern);
    return match?.[1] ?? null;
  }
}

