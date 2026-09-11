import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, configureApi, request } from './api';
vi.mock('./apiOrigin', () => ({ apiOrigin: () => 'http://test.local' }));
const fetchMock = vi.fn();
const refreshed = vi.fn();
const failed = vi.fn();
const expired = () =>
  new Response(
    JSON.stringify({ error: { code: 'session_expired', message: 'expired' } }),
    { status: 401 },
  );
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe('bounded API requests and session recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    refreshed.mockReset();
    failed.mockReset();
    configureApi({
      getAccessToken: () => 'access',
      getRefreshToken: () => 'refresh',
      onRefreshed: refreshed,
      onRefreshFailed: failed,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bounds a stalled request and clears its timeout after failure', async () => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(options.signal.reason),
          );
        }),
    );
    const pending = expect(api.me()).rejects.toThrow('Il server non risponde');
    await vi.advanceTimersByTimeAsync(75_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    expect(failed).not.toHaveBeenCalled();
  });
  it('clears the timeout when a response arrives', async () => {
    fetchMock.mockResolvedValue(ok({ balance: 10 }));
    expect(await api.balance()).toEqual({ balance: 10 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('forwards cancellation without logging the player out', async () => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(options.signal.reason),
          );
        }),
    );
    const controller = new AbortController();
    const pending = expect(
      request('/api/auth/me', { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    expect(failed).not.toHaveBeenCalled();
  });
  it.each([503, 429])(
    'preserves refresh credentials on temporary HTTP %s',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(new Response('{}', { status }));
      await expect(api.me()).rejects.toMatchObject({ status });
      expect(failed).not.toHaveBeenCalled();
    },
  );
  it('preserves refresh credentials after network loss', async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockRejectedValueOnce(new TypeError('network'));
    await expect(api.me()).rejects.toThrow('network');
    expect(failed).not.toHaveBeenCalled();
  });
  it('clears a session only when refresh is rejected by the server', async () => {
    fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired());
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(failed).toHaveBeenCalledOnce();
  });
  it('shares one token rotation between concurrent expired requests', async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/refresh'))
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      return Promise.resolve(
        options.headers.authorization === 'Bearer fresh'
          ? ok({ balance: 20 })
          : expired(),
      );
    });
    const first = api.me();
    const second = api.balance();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith('/refresh')),
    ).toHaveLength(1);
    resolveRefresh?.(
      ok({ tokens: { accessToken: 'fresh', refreshToken: 'rotated' } }),
    );
    await Promise.all([first, second]);
    expect(refreshed).toHaveBeenCalledOnce();
  });
});
