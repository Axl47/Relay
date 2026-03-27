import type { ProviderHealth, ProviderSummary, UpdateProviderConfigInput } from "@relay/contracts";
import { createHealthyProviderHealth } from "@relay/provider-sdk";
import type { RelayProvider } from "@relay/provider-sdk";
import { ProviderRepository } from "../repositories/provider-repository";
import { UserRepository } from "../repositories/user-repository";
import {
  DEFAULT_PREFERENCES,
  isContentClassAllowed,
  normalizePreferences,
  ProviderRuntime,
} from "./provider-runtime";

export class ProviderService {
  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly userRepository: UserRepository,
    private readonly runtime: ProviderRuntime,
  ) {}

  ensureProvidersSeeded(): Promise<void> {
    return this.doEnsureProvidersSeeded();
  }

  listProviders(userId: string): Promise<ProviderSummary[]> {
    return this.doListProviders(userId);
  }

  updateProviderConfig(userId: string, providerId: string, input: UpdateProviderConfigInput) {
    return this.doUpdateProviderConfig(userId, providerId, input);
  }

  recordProviderHealth(
    providerId: string,
    status: ProviderHealth["status"],
    reason: ProviderHealth["reason"],
    message?: string,
  ): Promise<void> {
    return this.doRecordProviderHealth({
      providerId,
      status,
      reason,
      message,
    });
  }

  async seedUserProviderConfigs(userId: string) {
    const registry = await this.runtime.registry();
    await Promise.all(
      registry.list().map((provider, priority) =>
        this.providerRepository.insertProviderConfigIfMissing({
          userId,
          providerId: provider.metadata.id,
          enabled: provider.metadata.defaultEnabled,
          priority,
        }),
      ),
    );
  }

  async getProviderOrThrow(providerId: string) {
    return this.runtime.getProviderOrThrow(providerId);
  }

  async getPreferences(userId: string) {
    const value = await this.userRepository.findPreferences(userId);
    return normalizePreferences((value as Record<string, unknown>) ?? DEFAULT_PREFERENCES);
  }

  async getAllowedProviderIdsForUser(userId: string) {
    const preferences = await this.getPreferences(userId);
    const rows = await this.providerRepository.listProviders();

    return rows
      .filter((providerRow) => isContentClassAllowed(preferences, providerRow.contentClass as ProviderSummary["contentClass"]))
      .map((providerRow) => providerRow.id);
  }

  async getProviderWithPreferences(
    userId: string,
    providerId: string,
  ): Promise<{ provider: RelayProvider; preferences: Awaited<ReturnType<ProviderService["getPreferences"]>> }> {
    const [provider, preferences] = await Promise.all([
      this.getProviderOrThrow(providerId),
      this.getPreferences(userId),
    ]);

    if (!isContentClassAllowed(preferences, provider.metadata.contentClass)) {
      throw Object.assign(new Error("Adult provider access is disabled for this account."), {
        statusCode: 403,
      });
    }

    return { provider, preferences };
  }

  private async buildProviderHealthMap() {
    const rows = await this.providerRepository.listHealthEvents();
    const healthByProvider = new Map<string, ProviderHealth>();
    for (const row of rows) {
      if (healthByProvider.has(row.providerId)) {
        continue;
      }

      healthByProvider.set(row.providerId, {
        providerId: row.providerId,
        status: row.status as ProviderHealth["status"],
        reason: row.reason as ProviderHealth["reason"],
        checkedAt: row.createdAt.toISOString(),
      });
    }

    return healthByProvider;
  }

  private async doEnsureProvidersSeeded() {
    const registry = await this.runtime.registry();
    await Promise.all(
      registry.list().map((provider) =>
        this.providerRepository.upsertProvider({
          id: provider.metadata.id,
          displayName: provider.metadata.displayName,
          baseUrl: provider.metadata.baseUrl,
          contentClass: provider.metadata.contentClass,
          executionMode: provider.metadata.executionMode,
          requiresAdultGate: provider.metadata.requiresAdultGate,
          supportsSearch: provider.metadata.supportsSearch,
          supportsTrackerSync: provider.metadata.supportsTrackerSync,
          defaultEnabled: provider.metadata.defaultEnabled,
        }),
      ),
    );
  }

  private async doListProviders(userId: string): Promise<ProviderSummary[]> {
    await this.doEnsureProvidersSeeded();

    const [preferences, registry, providerRows, configRows, healthByProvider] = await Promise.all([
      this.getPreferences(userId),
      this.runtime.registry(),
      this.providerRepository.listProviders(),
      this.providerRepository.listProviderConfigs(userId),
      this.buildProviderHealthMap(),
    ]);

    const configByProvider = new Map(configRows.map((row) => [row.providerId, row]));
    const orderByProvider = new Map(registry.list().map((provider, index) => [provider.metadata.id, index]));

    return providerRows
      .filter((providerRow) =>
        isContentClassAllowed(preferences, providerRow.contentClass as ProviderSummary["contentClass"]),
      )
      .map((providerRow) => {
        const config = configByProvider.get(providerRow.id);
        return {
          id: providerRow.id,
          displayName: providerRow.displayName,
          baseUrl: providerRow.baseUrl,
          contentClass: providerRow.contentClass as ProviderSummary["contentClass"],
          executionMode: providerRow.executionMode as ProviderSummary["executionMode"],
          requiresAdultGate: providerRow.requiresAdultGate,
          supportsSearch: providerRow.supportsSearch,
          supportsTrackerSync: providerRow.supportsTrackerSync,
          defaultEnabled: providerRow.defaultEnabled,
          enabled: config?.enabled ?? providerRow.defaultEnabled,
          priority: config?.priority ?? orderByProvider.get(providerRow.id) ?? 0,
          health:
            healthByProvider.get(providerRow.id) ?? createHealthyProviderHealth(providerRow.id),
        };
      })
      .sort((left, right) => left.priority - right.priority);
  }

  private async doUpdateProviderConfig(
    userId: string,
    providerId: string,
    input: UpdateProviderConfigInput,
  ) {
    await this.doEnsureProvidersSeeded();

    const [provider, preferences, existing] = await Promise.all([
      this.getProviderOrThrow(providerId),
      this.getPreferences(userId),
      this.providerRepository.findProviderConfig(userId, providerId),
    ]);

    if (
      provider.metadata.requiresAdultGate &&
      input.enabled === true &&
      !preferences.adultContentVisible
    ) {
      throw Object.assign(
        new Error("Enable adult content in settings before turning on adult providers."),
        { statusCode: 403 },
      );
    }

    return this.providerRepository.upsertProviderConfig({
      userId,
      providerId,
      enabled: input.enabled ?? existing?.enabled ?? provider.metadata.defaultEnabled,
      priority: input.priority ?? existing?.priority ?? 0,
    });
  }

  private async doRecordProviderHealth(input: {
    providerId: string;
    status: ProviderHealth["status"];
    reason: ProviderHealth["reason"];
    message?: string;
  }) {
    await this.providerRepository.insertHealthEvent(input);
  }
}
