import { isApiErrorBody, type ApiErrorCode, type AuthResponse } from '@bingo/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

/** A failed API call, carrying the server's stable error code. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields: Record<string, string[]> | undefined;

  constructor(code: ApiErrorCode, status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal ?? null,
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiError(payload.error.code, response.status, payload.error.message, payload.error.fields);
    }
    throw new ApiError('internal_error', response.status, `Request to ${path} failed`);
  }

  return payload as T;
}

/**
 * Token refresh is funnelled through a single in-flight promise so that a
 * burst of parallel calls hitting an expired access token triggers exactly one
 * rotation - the server revokes a refresh token the moment it is used.
 */
let refreshInFlight: Promise<AuthResponse> | null = null;

export interface TokenBroker {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onRefreshed: (response: AuthResponse) => void;
  onRefreshFailed: () => void;
}

let broker: TokenBroker | null = null;

export function configureApi(next: TokenBroker): void {
  broker = next;
}

async function refreshTokens(): Promise<AuthResponse> {
  if (!broker) throw new ApiError('unauthorized', 401, 'API not configured');
  const refreshToken = broker.getRefreshToken();
  if (!refreshToken) throw new ApiError('session_expired', 401, 'No refresh token');

  refreshInFlight ??= rawRequest<AuthResponse>('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  })
    .then((response) => {
      broker?.onRefreshed(response);
      return response;
    })
    .catch((error: unknown) => {
      broker?.onRefreshFailed();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/** Authenticated request with a single transparent retry after a refresh. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const accessToken = options.accessToken ?? broker?.getAccessToken() ?? null;

  try {
    return await rawRequest<T>(path, { ...options, accessToken });
  } catch (error) {
    const expired = error instanceof ApiError && error.code === 'session_expired';
    if (!expired || !broker?.getRefreshToken()) throw error;

    const refreshed = await refreshTokens();
    return rawRequest<T>(path, { ...options, accessToken: refreshed.tokens.accessToken });
  }
}

export const api = {
  register: (body: unknown) =>
    rawRequest<AuthResponse>('/api/auth/register', { method: 'POST', body }),
  login: (body: unknown) => rawRequest<AuthResponse>('/api/auth/login', { method: 'POST', body }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AuthResponse['user']; balance: number }>('/api/auth/me'),
  balance: () => request<{ balance: number; entryCount: number }>('/api/wallet/balance'),
};
