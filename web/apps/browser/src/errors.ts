export type ExtractionErrorCode =
  | "challenge_failed"
  | "unimplemented_provider"
  | "invalid_request"
  | "timeout"
  | "upstream_error";

export class BrowserExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly statusCode: number;
  readonly details: unknown;

  constructor(
    code: ExtractionErrorCode,
    message: string,
    options: {
      statusCode?: number;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "BrowserExtractionError";
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details ?? null;

    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isChallengeFailure(error: unknown) {
  return error instanceof BrowserExtractionError && error.code === "challenge_failed";
}

export function toPublicError(error: unknown) {
  if (error instanceof BrowserExtractionError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: error instanceof Error ? error.message : "Unknown extraction error",
      code: "upstream_error",
      details: null,
    },
  };
}
