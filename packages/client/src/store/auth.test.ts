import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { useAuthStore } from './auth';
const mock = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('../lib/api', async (original) => {
  const actual = await original<typeof import('../lib/api')>();
  return {
    ...actual,
    configureApi: vi.fn(),
    api: { ...actual.api, me: mock.me },
  };
});

describe('restoring an existing session', () => {
  beforeEach(() => {
    mock.me.mockReset();
    useAuthStore.setState({
      accessToken: 'kept-access',
      refreshToken: 'kept-refresh',
      status: 'idle',
      error: null,
      balance: 0,
    });
  });
  it('preserves tokens on an unreachable server and offers retry', async () => {
    mock.me.mockRejectedValue(new TypeError('Failed to fetch'));
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'offline',
      accessToken: 'kept-access',
      refreshToken: 'kept-refresh',
    });
    mock.me.mockResolvedValue({ user: null, balance: 15 });
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'ready',
      balance: 15,
      error: null,
    });
  });
  it('clears genuinely expired credentials', async () => {
    mock.me.mockRejectedValue(new ApiError('session_expired', 401, 'expired'));
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'ready',
      accessToken: null,
      refreshToken: null,
    });
  });
});
