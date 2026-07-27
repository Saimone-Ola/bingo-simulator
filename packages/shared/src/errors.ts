/**
 * Stable error codes returned by the API. The client maps them to Italian
 * copy; never render a raw server message to the player.
 */
export const API_ERROR_CODES = [
  'validation_error',
  'invalid_credentials',
  'email_already_used',
  'display_name_already_used',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'insufficient_funds',
  'account_suspended',
  'session_expired',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Developer-facing English text. Not for display. */
    message: string;
    /** Field-level detail for `validation_error`. */
    fields?: Record<string, string[]>;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { code?: unknown }).code === 'string';
}
