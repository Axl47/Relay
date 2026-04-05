import { assertProviderContract, createProviderRequestContext, ProviderRegistry } from "@relay/provider-sdk";
import type { ProviderRequestContextInput, RelayProvider } from "@relay/provider-sdk";
export * from "./provider-definitions";
import { AniwaveProvider } from "./providers/aniwave";
import { AkiHProvider } from "./providers/aki-h";
import { AnimeOnsenProvider } from "./providers/animeonsen";
import { AnimePaheProvider } from "./providers/animepahe";
import { AnimeTakeProvider } from "./providers/animetake";
import { GogoanimeProvider } from "./providers/gogoanime";
import { HanimeProvider } from "./providers/hanime";
import { HentaiHavenProvider } from "./providers/hentaihaven";
import { HstreamProvider } from "./providers/hstream";
import { JavGuruProvider } from "./providers/javguru";
import { XtreamProvider } from "./providers/xtream";

export {
  AkiHProvider,
  AniwaveProvider,
  AnimeOnsenProvider,
  AnimePaheProvider,
  AnimeTakeProvider,
  GogoanimeProvider,
  HanimeProvider,
  HentaiHavenProvider,
  HstreamProvider,
  JavGuruProvider,
  XtreamProvider,
};

export type CreateProviderRegistryOptions = {
  tmdbApiKey?: string | null;
};

export async function createProviderRegistry(options: CreateProviderRegistryOptions = {}) {
  const registry = new ProviderRegistry();
  const providers: RelayProvider[] = [
    new GogoanimeProvider(),
    new HstreamProvider(),
    new HanimeProvider(),
    new AkiHProvider(),
    new JavGuruProvider(),
    new AniwaveProvider(),
    new AnimePaheProvider(),
    new AnimeOnsenProvider(),
    new AnimeTakeProvider(),
    new HentaiHavenProvider(),
  ];
  if (options.tmdbApiKey) {
    providers.push(new XtreamProvider(options.tmdbApiKey));
  }

  for (const provider of providers) {
    registry.register(provider);
  }

  return registry;
}

export async function validateBuiltinProviders(
  ctxInput: ProviderRequestContextInput = {},
  options: CreateProviderRegistryOptions = {},
) {
  const registry = await createProviderRegistry(options);
  const ctx = createProviderRequestContext(ctxInput);
  for (const provider of registry.list()) {
    await assertProviderContract(provider, ctx);
  }
}
