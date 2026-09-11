import {
  isApiErrorBody,
  type ApiErrorCode,
  type AuthResponse,
  type AvatarAppearance,
  type SlotCommitment,
  type SlotConfig,
  type SlotMachineDetail,
  type SlotMachineSummary,
  type SlotSimulationReport,
  type SlotSpinResponse,
} from '@bingo/shared';
import { apiOrigin } from './apiOrigin';

const API_URL = apiOrigin();

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

  // Allow a free Render instance to wake, but never leave a request pending forever.
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Il server non risponde. Riprova.')), 75_000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
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
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        broker?.onRefreshFailed();
      }
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
  avatar: () => request<{ appearance: AvatarAppearance }>('/api/avatar'),
  updateAvatar: (appearance: AvatarAppearance) =>
    request<{ appearance: AvatarAppearance }>('/api/avatar', {
      method: 'PATCH',
      body: appearance,
    }),

  /* --- Slot machines. The client sends configurations and bets, never
     outcomes: every grid, seed and payout in these responses was computed by
     the server. --- */
  slots: (query: { mine?: boolean; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (query.mine) search.set('mine', 'true');
    if (query.limit) search.set('limit', String(query.limit));
    const suffix = search.toString();
    return request<{ machines: SlotMachineSummary[] }>(`/api/slots${suffix ? `?${suffix}` : ''}`);
  },
  slot: (id: string) => request<{ machine: SlotMachineDetail }>(`/api/slots/${id}`),
  createSlot: (body: unknown) =>
    request<{ machine: SlotMachineDetail }>('/api/slots', { method: 'POST', body }),
  updateSlot: (id: string, body: unknown) =>
    request<{ machine: SlotMachineDetail }>(`/api/slots/${id}`, { method: 'PATCH', body }),
  simulateSlot: (config: SlotConfig, spins: number) =>
    request<{ report: SlotSimulationReport }>('/api/slots/simulate', {
      method: 'POST',
      body: { config, spins },
    }),
  publishSlot: (id: string) =>
    request<{ machine: SlotMachineDetail; report: SlotSimulationReport; simulationSpins: number }>(
      `/api/slots/${id}/publish`,
      { method: 'POST' },
    ),
  slotCommitment: (id: string) => request<SlotCommitment>(`/api/slots/${id}/commit`),
  spinSlot: (id: string, betPerLine: number, requestId: string) =>
    request<{ spin: SlotSpinResponse }>(`/api/slots/${id}/spin`, {
      method: 'POST',
      body: { betPerLine, requestId },
    }),
};
