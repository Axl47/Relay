type ApiErrorPayload = {
  error?: string;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  } | null;
};

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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    throw new Error(formatApiError(payload, response.status));
  }

  return response.json() as Promise<T>;
}
