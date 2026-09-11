import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVER_MESSAGES } from '@bingo/shared';
import {
  connectToHub,
  getRoom,
  leaveHub,
  type HubHandlers,
} from './hubConnection';
const sdk = vi.hoisted(() => ({ join: vi.fn(), reconnect: vi.fn() }));
const auth = vi.hoisted(() => ({ me: vi.fn(), accessToken: 'token' }));
vi.mock('@colyseus/sdk', () => ({
  Client: class {
    joinOrCreate = sdk.join;
    reconnect = sdk.reconnect;
  },
  getStateCallbacks: () => () => ({
    players: { onAdd: vi.fn(), onRemove: vi.fn() },
  }),
}));
vi.mock('../lib/apiOrigin', () => ({ wsOrigin: () => 'ws://test.local' }));
vi.mock('../lib/api', () => ({ api: { me: auth.me } }));
vi.mock('../store/auth', () => ({
  useAuthStore: { getState: () => ({ accessToken: auth.accessToken }) },
}));
class TestRoom {
  state = { players: new Map() };
  reconnectionToken = 'reconnection';
  leave = vi.fn<() => Promise<void>>(async () => undefined);
  messages = new Map<string, (payload: unknown) => void>();
  onMessage(type: string, callback: (payload: unknown) => void) {
    this.messages.set(type, callback);
  }
  onLeave(callback: (code: number) => void) {
    this.left = callback;
  }
  left: ((code: number) => void) | undefined;
}
const handlers = (): HubHandlers => ({
  onStatus: vi.fn(),
  onWelcome: vi.fn(),
  onPlayerAdd: vi.fn(),
  onPlayerRemove: vi.fn(),
  onChat: vi.fn(),
  onChatHistory: vi.fn(),
  onEmote: vi.fn(),
  onTeleport: vi.fn(),
  onRejected: vi.fn(),
});
describe('hub connection lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const storage = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    sdk.join.mockReset();
    sdk.reconnect.mockReset();
    auth.me.mockReset();
    auth.accessToken = 'token';
  });
  afterEach(async () => {
    await leaveHub();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('closes a late join after navigating away, without attaching it', async () => {
    const old = new TestRoom();
    let resolveJoin: ((room: TestRoom) => void) | undefined;
    sdk.join.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveJoin = resolve;
        }),
    );
    const events = handlers();
    const pending = connectToHub('token', events);
    await leaveHub();
    resolveJoin?.(old);
    await pending;
    expect(getRoom()).toBeNull();
    expect(old.leave).toHaveBeenCalledOnce();
    expect(events.onStatus).not.toHaveBeenCalledWith('connected');
  });
  it('does not let completion of an old leave erase the new connection', async () => {
    const old = new TestRoom();
    sdk.join.mockResolvedValueOnce(old);
    await connectToHub('token', handlers());
    let resolveLeave: (() => void) | undefined;
    old.leave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLeave = resolve;
        }),
    );
    const pending = leaveHub();
    const current = new TestRoom();
    sdk.join.mockResolvedValueOnce(current);
    const events = handlers();
    await connectToHub('token', events);
    resolveLeave?.();
    await pending;
    expect(getRoom()).toBe(current);
    old.messages.get(SERVER_MESSAGES.welcome)?.({});
    expect(events.onWelcome).not.toHaveBeenCalled();
    current.messages.get(SERVER_MESSAGES.welcome)?.({});
    expect(events.onWelcome).toHaveBeenCalledOnce();
  });
  it('cancels a scheduled reconnect when leaving the hub', async () => {
    const old = new TestRoom();
    sdk.join.mockResolvedValueOnce(old);
    await connectToHub('token', handlers());
    old.left?.(1006);
    await leaveHub();
    await vi.advanceTimersByTimeAsync(10000);
    expect(sdk.reconnect).not.toHaveBeenCalled();
  });
  it('renews an expired token before retrying the initial join', async () => {
    sdk.join
      .mockRejectedValueOnce({ code: 401 })
      .mockResolvedValueOnce(new TestRoom());
    auth.me.mockImplementation(async () => {
      auth.accessToken = 'fresh';
    });
    const events = handlers();
    await connectToHub('token', events);
    expect(sdk.join.mock.calls.map((call) => call[1].accessToken)).toEqual([
      'token',
      'fresh',
    ]);
    expect(events.onStatus).toHaveBeenLastCalledWith('connected');
  });
});
