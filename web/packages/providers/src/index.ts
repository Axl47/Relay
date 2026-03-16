import { assertProviderContract, createProviderRequestContext, ProviderRegistry } from "@relay/provider-sdk";
import type { ProviderRequestContextInput } from "@relay/provider-sdk";
import { AniwaveProvider } from "./providers/aniwave";
import { AnimeOnsenProvider } from "./providers/animeonsen";
import { AnimePaheProvider } from "./providers/animepahe";
import { AnimeTakeProvider } from "./providers/animetake";
import { GogoanimeProvider } from "./providers/gogoanime";
import { HanimeProvider } from "./providers/hanime";
import { HentaiHavenProvider } from "./providers/hentaihaven";
import { HstreamProvider } from "./providers/hstream";
import { JavGuruProvider } from "./providers/javguru";

export {
  AniwaveProvider,
  AnimeOnsenProvider,
  AnimePaheProvider,
  AnimeTakeProvider,
  GogoanimeProvider,
  HanimeProvider,
  HentaiHavenProvider,
  HstreamProvider,
  JavGuruProvider,
};

export async function createProviderRegistry() {
  const registry = new ProviderRegistry();
  const providers = [
    new GogoanimeProvider(),
    new HstreamProvider(),
    new HanimeProvider(),
    new JavGuruProvider(),
    new AniwaveProvider(),
    new AnimePaheProvider(),
    new AnimeOnsenProvider(),
    new AnimeTakeProvider(),
    new HentaiHavenProvider(),
  ];

  for (const provider of providers) {
    registry.register(provider);
  }

  return registry;
}

export async function validateBuiltinProviders(ctxInput: ProviderRequestContextInput = {}) {
  const registry = await createProviderRegistry();
  const ctx = createProviderRequestContext(ctxInput);
  for (const provider of registry.list()) {
    await assertProviderContract(provider, ctx);
  }
}
