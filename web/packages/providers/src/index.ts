import { ProviderRegistry, assertProviderContract } from "@relay/provider-sdk";
import { DemoProvider } from "./demo-provider";

export const demoProvider = new DemoProvider();

export async function createProviderRegistry() {
  const registry = new ProviderRegistry();
  registry.register(demoProvider);
  return registry;
}

export async function validateBuiltinProviders() {
  await assertProviderContract(demoProvider);
}
