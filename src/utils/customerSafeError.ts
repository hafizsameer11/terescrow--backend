import ApiError from './ApiError';

/** Generic message for customer/mobile APIs — never expose provider internals. */
export const CUSTOMER_GENERIC_ERROR_MESSAGE =
  'Something went wrong. Please try again later.';

/**
 * Log the real error server-side; return a safe ApiError for the client.
 * Re-throws existing ApiError (validation, auth, limits, etc.) unchanged.
 */
export function toCustomerSafeError(error: unknown, logLabel?: string): ApiError {
  if (logLabel) {
    console.error(logLabel, error);
  } else if (!(error instanceof ApiError)) {
    console.error(error);
  }
  if (error instanceof ApiError) {
    return error;
  }
  return ApiError.internal(CUSTOMER_GENERIC_ERROR_MESSAGE);
}
