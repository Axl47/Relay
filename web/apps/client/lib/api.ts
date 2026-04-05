import { getApiBaseUrl } from "./api-base-url";

type ApiErrorPayload = {
  error?: string;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  } | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: ApiErrorPayload | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function formatApiError(payload: ApiErrorPayload | null, status: number) {
  const formError = payload?.details?.formErrors?.find(Boolean);
  if (formError) {
    return formError;
  }

  const fieldErrors = payload?.details?.fieldErrors;
  if (fieldErrors) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      const message = messages?.find(Boolean);
      if (message) {
        return `${field}: ${message}`;
      }
    }
  }

  return payload?.error ?? `Request failed with status ${status}`;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAuthenticationError(error: unknown) {
  return isApiError(error) && error.status === 401;
}

export function isAdminAccessError(error: unknown) {
  return isApiError(error) && error.status === 403;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init?.body !== null;

  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    throw new ApiError(formatApiError(payload, response.status), response.status, payload);
  }

  return response.json() as Promise<T>;
}
