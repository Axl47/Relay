"use client";

import { ProviderSettingsPanel } from "../../../../components/provider-settings-panel";
import { AuthRequiredState } from "../../../../components/auth-required-state";
import { useProviderSettings } from "../../../../hooks/use-provider-settings";
import { useRouteAccess } from "../../../../hooks/use-route-access";

export default function ProviderSettingsPage() {
  const access = useRouteAccess();
  const providerSettings = useProviderSettings(access.isAuthenticated);

  if (access.isLoading) {
    return <div className="message">Loading sources...</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to enable, disable, and prioritize the providers Relay should search."
        title="Sources are tied to your account"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to load sources."}
      </div>
    );
  }

  if (providerSettings.providersQuery.isLoading) {
    return <div className="message">Loading sources...</div>;
  }

  if (providerSettings.providersQuery.error) {
    return (
      <div className="message">
        {providerSettings.providersQuery.error instanceof Error
          ? providerSettings.providersQuery.error.message
          : "Unable to load sources."}
      </div>
    );
  }

  const providers = providerSettings.providers;
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const degradedProviders = providers.filter((provider) => provider.health.status !== "healthy");

  return (
    <div className="page-grid sources-page">
      <section className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">Sources</span>
          <h1>Manage provider coverage</h1>
          <p>Choose what Relay searches first, what stays disabled, and which sources need attention.</p>
        </div>
      </section>

      <section className="surface sources-summary-grid">
        <article className="summary-tile">
          <span className="summary-label">Enabled</span>
          <strong>{enabledProviders.length}</strong>
          <p>{providers.length - enabledProviders.length} disabled</p>
        </article>
        <article className="summary-tile">
          <span className="summary-label">Needs review</span>
          <strong>{degradedProviders.length}</strong>
          <p>Degraded or offline health checks</p>
        </article>
        <article className="summary-tile">
          <span className="summary-label">Adult-gated</span>
          <strong>{providers.filter((provider) => provider.requiresAdultGate).length}</strong>
          <p>Controlled by the adult-content preference in Account</p>
        </article>
      </section>

      <section className="surface">
        <div className="section-header">
          <div>
            <h2>Priority and health</h2>
            <p>Drag on desktop or use the move controls to change search order.</p>
          </div>
        </div>

        <ProviderSettingsPanel
          isPending={providerSettings.updateProviderMutation.isPending}
          onMoveProvider={providerSettings.moveProvider}
          onReorderProviders={providerSettings.reorderProviders}
          onToggleProvider={providerSettings.toggleProvider}
          providers={providers}
        />
      </section>

      {providerSettings.message ? <div className="message">{providerSettings.message}</div> : null}
    </div>
  );
}
