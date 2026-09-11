import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BINGO_CLIENT_MESSAGES, BINGO_SERVER_MESSAGES } from '@bingo/shared';
import {
  claimBingo, connectToBingo, leaveBingo, markBingoCell, purchaseBingoCards,
  setBingoReady, startBingoGame, type BingoHandlers,
} from './bingoConnection';

const sdk = vi.hoisted(() => ({ join: vi.fn() }));
const authentication = vi.hoisted(() => ({ me: vi.fn(), accessToken: 'token' as string | null }));
vi.mock('@colyseus/sdk', () => ({ Client: class { joinOrCreate = sdk.join; } }));
vi.mock('../lib/apiOrigin', () => ({ wsOrigin: () => 'ws://test.local' }));
vi.mock('../lib/api', () => ({ api: { me: authentication.me } }));
vi.mock('../store/auth', () => ({ useAuthStore: { getState: () => ({ accessToken: authentication.accessToken }) } }));
vi.mock('./bingoEventBus', () => ({ clearBingoEventSnapshot: vi.fn(), publishBingoEventSnapshot: vi.fn() }));

const ROUND_A = 'd01ecf2a-703b-438f-9bea-8ac059bfcb25';
const ROUND_B = 'ca35a053-fb10-4f61-82fc-6a116b8a96da';

class TestRoom {
  send = vi.fn<(type: string, payload: unknown) => void>();
  leave = vi.fn(async () => undefined);
  messages = new Map<string, (payload: unknown) => void>();
  leaveHandler: ((code: number) => void) | undefined;
  onMessage(type: string, callback: (payload: unknown) => void) { this.messages.set(type, callback); }
  onLeave(callback: (code: number) => void) { this.leaveHandler = callback; }
  emit(type: string, payload: unknown) { this.messages.get(type)?.(payload); }
  snapshot(roundId = ROUND_A, hasCards = false) {
    this.emit(BINGO_SERVER_MESSAGES.snapshot, { roundId, round: 1, phase: 'CARD_PURCHASE', config: {}, players: [], results: [], drawnNumbers: [], seating: [], reservations: [], eventHistory: [], awardedTiers: [], myCards: hasCards ? [{ id: 'card-1', index: 0, cells: [], markedIndices: [] }] : [] });
  }
  lastPurchase() {
    const call = this.purchases().at(-1);
    return call?.[1] as { requestId: string; roundId: string; quantity: number; markingMode: string };
  }
  purchases() { return this.send.mock.calls.filter(([type]) => type === BINGO_CLIENT_MESSAGES.purchaseCards); }
  actions() { return this.send.mock.calls.filter(([type]) => type !== BINGO_CLIENT_MESSAGES.setPreparing); }
}

function handlers(): BingoHandlers {
  return { onConnectionIssue: vi.fn(), onStatus: vi.fn(), onSnapshot: vi.fn(), onBall: vi.fn(), onWinner: vi.fn(), onClaimRejected: vi.fn(), onActionRejected: vi.fn(), onPurchaseConfirmed: vi.fn(), onPurchaseWaiting: vi.fn(), onSeating: vi.fn(), onSeatRejected: vi.fn() };
}

async function join(target = new TestRoom(), events = handlers()) {
  sdk.join.mockResolvedValueOnce(target);
  await connectToBingo('token', 'TESI-2026', events);
  return { target, events };
}

describe('Bingo purchase acknowledgements and reconnects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    sdk.join.mockReset();
    authentication.me.mockReset();
    authentication.accessToken = 'token';
  });
  afterEach(async () => {
    await leaveBingo();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });


  it('rejects the legacy production payload before it reaches React or purchase code', async () => {
    const { target, events } = await join();
    expect(events.onStatus).not.toHaveBeenCalledWith('connected');
    target.emit(BINGO_SERVER_MESSAGES.snapshot, { round: 1, myCards: [] });
    expect(events.onConnectionIssue).toHaveBeenCalledWith('outdated_server');
    expect(events.onSnapshot).not.toHaveBeenCalled();
    expect(events.onStatus).toHaveBeenLastCalledWith('failed');
    expect(purchaseBingoCards(1, 'MANUAL')).toBe(false);
    expect(target.leave).toHaveBeenCalledOnce();
    target.snapshot();
    expect(events.onSnapshot).not.toHaveBeenCalled();
  });

  it('reports incomplete data without publishing it', async () => {
    const { target, events } = await join();
    target.emit(BINGO_SERVER_MESSAGES.snapshot, { roundId: ROUND_A, results: [] });
    expect(events.onConnectionIssue).toHaveBeenCalledWith('invalid_snapshot');
    expect(events.onSnapshot).not.toHaveBeenCalled();
  });

  it('ends an open socket that never sends a room, and allows a clean retry', async () => {
    const { target, events } = await join();
    await vi.advanceTimersByTimeAsync(15000);
    expect(events.onConnectionIssue).toHaveBeenCalledWith('snapshot_timeout');
    expect(target.leave).toHaveBeenCalledOnce();
    const retried = await join();
    retried.target.snapshot();
    await vi.advanceTimersByTimeAsync(20000);
    expect(retried.events.onStatus).toHaveBeenLastCalledWith('connected');
    expect(retried.events.onConnectionIssue).not.toHaveBeenCalled();
  });

  it('clears the old snapshot deadline when reconnecting', async () => {
    const { target, events } = await join();
    await vi.advanceTimersByTimeAsync(14900);
    const rejoined = new TestRoom();
    sdk.join.mockResolvedValueOnce(rejoined);
    target.leaveHandler?.(1006);
    await vi.advanceTimersByTimeAsync(750);
    rejoined.snapshot();
    expect(events.onConnectionIssue).not.toHaveBeenCalled();
    expect(events.onStatus).toHaveBeenLastCalledWith('connected');
  });

  it('waits for the round snapshot, then requires an explicit matching acknowledgement', async () => {
    const { target, events } = await join();
    expect(purchaseBingoCards(3, 'AUTOMATIC')).toBe(false);
    target.snapshot();
    expect(purchaseBingoCards(3, 'AUTOMATIC')).toBe(true);
    const request = target.lastPurchase();
    target.snapshot(ROUND_A, true);
    expect(events.onPurchaseConfirmed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(target.lastPurchase()).toEqual(request);
    expect(target.purchases()).toHaveLength(2);
    target.emit(BINGO_SERVER_MESSAGES.purchaseConfirmed, { requestId: 'unrelated', roundId: ROUND_A });
    expect(events.onPurchaseConfirmed).not.toHaveBeenCalled();
    target.emit(BINGO_SERVER_MESSAGES.purchaseConfirmed, { requestId: request.requestId, roundId: ROUND_A, quantity: 3, totalCredits: 30, balance: 970, purchaseId: 'persisted-purchase' });
    expect(events.onPurchaseConfirmed).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(target.purchases()).toHaveLength(2);
  });

  it('keeps the request id and original basket through timeouts and a manual retry', async () => {
    const { target, events } = await join();
    target.snapshot();
    purchaseBingoCards(3, 'MANUAL');
    const original = target.lastPurchase();
    await vi.advanceTimersByTimeAsync(20000);
    expect(target.purchases()).toHaveLength(8);
    expect(events.onPurchaseWaiting).toHaveBeenCalledOnce();
    purchaseBingoCards(6, 'AUTOMATIC');
    expect(target.lastPurchase()).toEqual(original);
    await vi.advanceTimersByTimeAsync(2500);
    expect(target.lastPurchase()).toEqual(original);
  });

  it('ignores rejection of a different purchase while retaining the selected request', async () => {
    const { target, events } = await join();
    target.snapshot();
    purchaseBingoCards(1, 'MANUAL');
    const original = target.lastPurchase();
    target.emit(BINGO_SERVER_MESSAGES.actionRejected, { action: 'purchaseCards', requestId: 'old-request', reason: 'insufficient_credits' });
    expect(events.onActionRejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(target.lastPurchase()).toEqual(original);
    target.emit(BINGO_SERVER_MESSAGES.actionRejected, { action: 'purchaseCards', requestId: original.requestId, reason: 'insufficient_credits' });
    expect(events.onActionRejected).toHaveBeenCalledOnce();
    const calls = target.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(target.send).toHaveBeenCalledTimes(calls);
    purchaseBingoCards(1, 'MANUAL');
    expect(target.lastPurchase().requestId).not.toBe(original.requestId);
  });

  it('keeps retrying purchase_in_progress without clearing the request', async () => {
    const { target } = await join();
    target.snapshot();
    purchaseBingoCards(1, 'MANUAL');
    const original = target.lastPurchase();
    target.emit(BINGO_SERVER_MESSAGES.actionRejected, { action: 'purchaseCards', requestId: original.requestId, reason: 'purchase_in_progress' });
    await vi.advanceTimersByTimeAsync(2500);
    expect(target.lastPurchase()).toEqual(original);
  });

  it('retains the request when the server cannot yet determine whether its transaction committed', async () => {
    const { target } = await join();
    target.snapshot();
    purchaseBingoCards(3, 'AUTOMATIC');
    const original = target.lastPurchase();
    target.emit(BINGO_SERVER_MESSAGES.actionRejected, { action: 'purchaseCards', requestId: original.requestId, reason: 'purchase_failed' });
    // A transport/database failure is ambiguous. A retry must recover the
    // persisted purchase even if its commit response was the packet lost.
    purchaseBingoCards(3, 'AUTOMATIC');
    expect(target.lastPurchase()).toEqual(original);
  });

  it('does not queue claims, ready changes or start commands while disconnected', async () => {
    const { target, events } = await join();
    target.snapshot();
    target.leaveHandler?.(1006);
    claimBingo(1, 'BINGO', 0);
    markBingoCell(1, 0, 1, true);
    setBingoReady(true);
    startBingoGame();
    const rejoined = new TestRoom();
    sdk.join.mockResolvedValueOnce(rejoined);
    await vi.advanceTimersByTimeAsync(750);
    rejoined.snapshot();
    expect(rejoined.actions()).toHaveLength(0);
    expect(events.onStatus).toHaveBeenLastCalledWith('connected');
  });

  it('restores an unacknowledged purchase on reconnect, even after its retry budget expired', async () => {
    const { target, events } = await join();
    target.snapshot();
    purchaseBingoCards(3, 'AUTOMATIC');
    const original = target.lastPurchase();
    await vi.advanceTimersByTimeAsync(20000);
    const rejoined = new TestRoom();
    sdk.join.mockResolvedValueOnce(rejoined);
    target.leaveHandler?.(1006);
    await vi.advanceTimersByTimeAsync(750);
    expect(rejoined.actions()).toHaveLength(0);
    rejoined.snapshot(ROUND_A, true);
    expect(rejoined.lastPurchase()).toEqual(original);
    expect(events.onPurchaseConfirmed).not.toHaveBeenCalled();
    rejoined.emit(BINGO_SERVER_MESSAGES.purchaseConfirmed, { requestId: original.requestId, roundId: ROUND_A, quantity: 3, totalCredits: 30, balance: 970, purchaseId: 'persisted' });
    expect(events.onPurchaseConfirmed).toHaveBeenCalledOnce();
  });

  it('abandons a pending old-round purchase before sending to a replacement room', async () => {
    const { target, events } = await join();
    target.snapshot();
    purchaseBingoCards(1, 'MANUAL');
    const old = target.lastPurchase();
    const rejoined = new TestRoom();
    // Keep initial reconnect pending while the next purchase retry is queued.
    let resolveJoin: ((room: TestRoom) => void) | undefined;
    sdk.join.mockImplementationOnce(() => new Promise<TestRoom>((resolve) => { resolveJoin = resolve; }));
    target.leaveHandler?.(1006);
    await vi.advanceTimersByTimeAsync(3000);
    resolveJoin?.(rejoined);
    await vi.advanceTimersByTimeAsync(0);
    expect(rejoined.actions()).toHaveLength(0);
    rejoined.snapshot(ROUND_B);
    await vi.advanceTimersByTimeAsync(10000);
    expect(rejoined.actions()).toHaveLength(0);
    expect(events.onActionRejected).toHaveBeenCalledWith(expect.objectContaining({ action: 'purchaseCards' }));
    purchaseBingoCards(1, 'MANUAL');
    expect(rejoined.lastPurchase().roundId).toBe(ROUND_B);
    expect(rejoined.lastPurchase().requestId).not.toBe(old.requestId);
  });

  it('ignores messages left over from the previous socket after reconnect', async () => {
    const { target, events } = await join();
    target.snapshot();
    const rejoined = new TestRoom();
    sdk.join.mockResolvedValueOnce(rejoined);
    target.leaveHandler?.(1006);
    await vi.advanceTimersByTimeAsync(750);
    rejoined.snapshot(ROUND_B);
    purchaseBingoCards(1, 'MANUAL');
    const current = rejoined.lastPurchase();
    target.snapshot(ROUND_A);
    target.emit(BINGO_SERVER_MESSAGES.ballCalled, { round: 1, number: 12 });
    target.emit(BINGO_SERVER_MESSAGES.actionRejected, { action: 'purchaseCards', reason: 'wrong_phase' });
    expect(events.onSnapshot).toHaveBeenCalledTimes(2);
    expect(events.onBall).not.toHaveBeenCalled();
    expect(events.onActionRejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(rejoined.lastPurchase()).toEqual(current);
  });

  it('renews expired websocket authorization through the existing HTTP broker', async () => {
    const target = new TestRoom();
    const events = handlers();
    sdk.join.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 401 })).mockResolvedValueOnce(target);
    authentication.me.mockImplementationOnce(async () => { authentication.accessToken = 'fresh-token'; });
    await connectToBingo('token', 'TESI-2026', events);
    expect(authentication.me).toHaveBeenCalledOnce();
    expect(sdk.join.mock.calls.map((call) => call[1].accessToken)).toEqual(['token', 'fresh-token']);
    target.snapshot();
    expect(events.onStatus).toHaveBeenLastCalledWith('connected');
  });

  it('recovers an expired token on automatic reconnect and keeps the pending purchase id', async () => {
    const { target } = await join();
    target.snapshot();
    purchaseBingoCards(3, 'AUTOMATIC');
    const original = target.lastPurchase();
    const rejoined = new TestRoom();
    sdk.join.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 401 })).mockResolvedValueOnce(rejoined);
    authentication.me.mockImplementationOnce(async () => { authentication.accessToken = 'renewed-token'; });
    target.leaveHandler?.(1006);
    await vi.advanceTimersByTimeAsync(750);
    rejoined.snapshot();
    expect(sdk.join.mock.calls.at(-1)?.[1].accessToken).toBe('renewed-token');
    expect(rejoined.lastPurchase()).toEqual(original);
    expect(authentication.me).toHaveBeenCalledOnce();
  });

  it('lets a newer store-driven connection supersede the old token refresh attempt', async () => {
    let finishRefresh: (() => void) | undefined;
    authentication.me.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    sdk.join.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 401 }));
    const oldEvents = handlers();
    const oldConnection = connectToBingo('token', 'TESI-2026', oldEvents);
    await vi.advanceTimersByTimeAsync(0);
    const replacement = new TestRoom();
    sdk.join.mockResolvedValueOnce(replacement);
    authentication.accessToken = 'new-store-token';
    const newEvents = handlers();
    await connectToBingo('new-store-token', 'TESI-2026', newEvents);
    finishRefresh?.();
    await oldConnection;
    expect(sdk.join).toHaveBeenCalledTimes(2);
    expect(oldEvents.onStatus).not.toHaveBeenCalledWith('failed');
    replacement.snapshot();
    expect(newEvents.onStatus).toHaveBeenLastCalledWith('connected');
    expect(replacement.leave).not.toHaveBeenCalled();
  });

  it('stops after a rejected refresh without retrying the expired token', async () => {
    const failure = Object.assign(new Error('refresh revoked'), { status: 401 });
    sdk.join.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 401 }));
    authentication.me.mockRejectedValueOnce(failure);
    const events = handlers();
    await expect(connectToBingo('token', 'TESI-2026', events)).rejects.toBe(failure);
    expect(sdk.join).toHaveBeenCalledOnce();
    expect(authentication.me).toHaveBeenCalledOnce();
    expect(events.onStatus).toHaveBeenLastCalledWith('failed');
  });

  it('does not rotate tokens for a non-authorization network failure', async () => {
    sdk.join.mockRejectedValue(new Error('network unavailable'));
    const rejected = expect(connectToBingo('token', 'TESI-2026', handlers())).rejects.toThrow('network unavailable');
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(authentication.me).not.toHaveBeenCalled();
    expect(sdk.join).toHaveBeenCalledTimes(4);
  });
});
