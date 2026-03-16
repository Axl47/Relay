import type { ProviderMetadata, SearchInput } from "@relay/contracts";
import type { ProviderRequestContext } from "@relay/provider-sdk";
import { RelayProviderBase } from "./relay-provider-base";

export abstract class WordPressMirrorProviderBase extends RelayProviderBase {
  constructor(metadata: ProviderMetadata) {
    super(metadata);
  }

  protected createSearchUrl(input: SearchInput) {
    const url = new URL("/", this.metadata.baseUrl);
    url.searchParams.set("s", input.query);
    return url.toString();
  }

  protected async fetchSearchDocument(input: SearchInput, ctx: ProviderRequestContext) {
    return this.fetchDocument(this.createSearchUrl(input), ctx);
  }
}

