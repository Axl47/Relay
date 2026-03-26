import {
  getBrowserExtractionRetryAttempts,
  getBrowserExtractionTimeoutMs,
  resolveProviderDomain,
  shouldResetBrowserContextAfterOperation,
} from "@relay/providers";
import { BrowserExtractionError } from "./errors";

export type ExtractionOperation = "search" | "anime" | "episodes" | "playback";

export function resolveProviderDomainOrThrow(providerId: string, baseUrl?: string) {
  const domain = resolveProviderDomain(providerId, baseUrl);
  if (!domain) {
    throw new BrowserExtractionError(
      "invalid_request",
      `Missing domain metadata for provider "${providerId}". Supply baseUrl in request.`,
      { statusCode: 400 },
    );
  }

  return domain;
}

export async function withExtractionTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const taskPromise = task(controller.signal);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BrowserExtractionError(
        "timeout",
        `Extraction exceeded timeout after ${timeoutMs}ms.`,
        { statusCode: 504 },
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BrowserExtractionError(
        "timeout",
        `Extraction exceeded timeout after ${timeoutMs}ms.`,
        { statusCode: 504, cause: error },
      );
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function getExtractionTimeoutMs(
  providerId: string,
  operation: ExtractionOperation,
  defaultTimeoutMs: number,
) {
  return getBrowserExtractionTimeoutMs(providerId, operation, defaultTimeoutMs);
}

export function getExtractionRetryAttempts(providerId: string) {
  return getBrowserExtractionRetryAttempts(providerId);
}

export function shouldResetContextAfterExtraction(providerId: string, operation: ExtractionOperation) {
  return shouldResetBrowserContextAfterOperation(providerId, operation);
}
