/**
 * Read the useful parts out of an axios error without resorting to `any`.
 *
 * The backend answers failures as { success, message, code?, requiredAny? },
 * so these helpers narrow an unknown caught value down to those fields.
 */

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      message?: string;
      code?: string;
      requiredAny?: string[];
      data?: unknown;
    };
  };
  message?: string;
}

const asApiError = (error: unknown): ApiErrorShape =>
  typeof error === "object" && error !== null ? (error as ApiErrorShape) : {};

/** The server's message, falling back to a caller-supplied default. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const err = asApiError(error);
  return err.response?.data?.message || err.message || fallback;
}

/** The machine-readable error code, e.g. "FORBIDDEN", "OTP_LOGIN_REQUIRED". */
export function getApiErrorCode(error: unknown): string | undefined {
  return asApiError(error).response?.data?.code;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return asApiError(error).response?.status;
}

/** Permissions a 403 said it wanted, when the response carried them. */
export function getApiErrorRequiredAny(error: unknown): string[] | undefined {
  return asApiError(error).response?.data?.requiredAny;
}
