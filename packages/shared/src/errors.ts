/** Normalized error codes returned by the platform and the gateway. */
export const ERROR_CODES = {
  BAD_REQUEST: { status: 400, message: 'The request is invalid.' },
  VALIDATION_FAILED: { status: 400, message: 'Request validation failed.' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication required.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password.' },
  MFA_REQUIRED: { status: 401, message: 'A multi-factor authentication code is required.' },
  ACCOUNT_LOCKED: {
    status: 423,
    message: 'Account temporarily locked due to failed login attempts.',
  },
  CSRF_FAILED: { status: 403, message: 'CSRF token missing or invalid.' },
  INVALID_API_KEY: {
    status: 401,
    message: 'The API key is missing, invalid, revoked, or expired.',
  },
  FORBIDDEN: { status: 403, message: 'You do not have permission to perform this action.' },
  API_NOT_IN_KEY_SCOPE: { status: 403, message: 'This API key is not permitted to call this API.' },
  IP_NOT_ALLOWED: {
    status: 403,
    message: 'Requests from this IP address are not allowed for this key.',
  },
  ORGANIZATION_SUSPENDED: { status: 403, message: 'The organization is suspended.' },
  SUBSCRIPTION_REQUIRED: {
    status: 402,
    message: 'An active subscription is required for this API.',
  },
  INSUFFICIENT_BALANCE: { status: 402, message: 'Insufficient wallet balance.' },
  SPENDING_LIMIT_REACHED: {
    status: 402,
    message: 'The monthly spending limit for this account has been reached.',
  },
  NOT_FOUND: { status: 404, message: 'Resource not found.' },
  API_NOT_FOUND: { status: 404, message: 'No published API matches this route.' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed for this endpoint.' },
  LICENSE_REQUIRED: {
    status: 409,
    message: 'A verified redistribution license is required before this action.',
  },
  CONFLICT: { status: 409, message: 'The request conflicts with the current state.' },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: 'This idempotency key was already used with different parameters.',
  },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request payload too large.' },
  RATE_LIMITED: { status: 429, message: 'Rate limit exceeded. Retry later.' },
  INTERNAL_ERROR: { status: 500, message: 'An internal error occurred.' },
  UPSTREAM_ERROR: { status: 502, message: 'The upstream provider returned an error.' },
  UPSTREAM_UNAVAILABLE: {
    status: 503,
    message: 'The upstream provider is temporarily unavailable.',
  },
  API_UNAVAILABLE: { status: 503, message: 'This API is not currently available.' },
  UPSTREAM_TIMEOUT: { status: 504, message: 'The upstream provider timed out.' },
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

export interface ErrorEnvelope {
  error: { code: ErrorCode | string; message: string; details?: unknown; requestId?: string };
}
