"use client";

import { isAuthenticationError } from "../lib/api";
import { useSessionQuery } from "./use-session-query";

export function useRouteAccess() {
  const sessionQuery = useSessionQuery();

  return {
    sessionQuery,
    session: sessionQuery.data ?? null,
    isLoading: sessionQuery.isLoading,
    isAuthenticated: Boolean(sessionQuery.data),
    isUnauthenticated: isAuthenticationError(sessionQuery.error),
    error: sessionQuery.error,
  };
}
