import type { ProviderSummary } from "@relay/contracts";

export function statusTone(status: ProviderSummary["health"]["status"]) {
  if (status === "healthy") {
    return "healthy";
  }

  if (status === "degraded") {
    return "warn";
  }

  return "danger";
}
