"use client";

import { ProviderSettingsPanel } from "../../../../components/provider-settings-panel";
import { useProviderSettings } from "../../../../hooks/use-provider-settings";

export default function ProviderSettingsPage() {
  const providerSettings = useProviderSettings();

  if (providerSettings.providersQuery.isLoading) {
    return <div className="message">Loading providers...</div>;
  }

  if (providerSettings.providersQuery.error) {
    return (
      <div className="message">
        {providerSettings.providersQuery.error instanceof Error
          ? providerSettings.providersQuery.error.message
          : "Unable to load providers."}
      </div>
    );
  }

  return (
    <div className="page-grid providers-page">
      <section className="page-heading">
        <h1>Providers</h1>
        <p>Manage enablement, ordering, and health for Relay&apos;s content sources.</p>
      </section>

      <section className="surface">
        <div className="section-header">
          <div>
            <h2>Provider List</h2>
            <p>
              {providerSettings.providers.filter((provider) => provider.enabled).length} enabled,{" "}
              {providerSettings.providers.filter((provider) => !provider.enabled).length} disabled
            </p>
          </div>
        </div>

        <ProviderSettingsPanel
          isPending={providerSettings.updateProviderMutation.isPending}
          onMoveProvider={providerSettings.moveProvider}
          onToggleProvider={providerSettings.toggleProvider}
          providers={providerSettings.providers}
        />
      </section>

      {providerSettings.message ? <div className="message">{providerSettings.message}</div> : null}
    </div>
  );
}
