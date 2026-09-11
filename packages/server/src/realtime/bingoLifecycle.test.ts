import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'colyseus';
import { BINGO_SERVER_MESSAGES, DEFAULT_AVATAR_APPEARANCE, type ActiveBingoEvent, type BingoEventDirector, type BingoMarkingMode, type BingoRoundResult, type BingoSnapshotPayload, type ItalianBingoCard, type RoomBingoConfig } from '@bingo/shared';
import { BingoRoom } from './bingoRoom';
import { cardNumbers, createPurchaseCards, createUniqueItalianCards } from './bingoRules';
import { LobbyStateMachine } from './lobbyStateMachine';
import type { PurchaseBingoCardsInput, QueueBingoAwardsInput } from '../services/bingoEconomy';
import { AppError } from '../errors';

const economy = vi.hoisted(() => ({ ensure: vi.fn(), purchase: vi.fn(), load: vi.fn(), queue: vi.fn(), settle: vi.fn(), finish: vi.fn(), cancel: vi.fn() }));
vi.mock('../services/bingoEconomy', () => ({ ensureBingoRound: economy.ensure, purchaseBingoCards: economy.purchase, loadBingoPurchase: economy.load,
  queueBingoAwards: economy.queue, settleBingoAward: economy.settle, finishBingoRound: economy.finish, cancelBingoRound: economy.cancel }));
vi.mock('../db/client', () => ({ db: {} }));
vi.mock('../services/ledger', () => ({ getWalletState: vi.fn(async () => ({ balance: 100 })) }));
vi.mock('../auth/tokens', () => ({ verifyAccessToken: vi.fn() }));
vi.mock('../services/players', () => ({ loadPlayerProfile: vi.fn() }));

interface Participant {
  sessionId: string; userId: string; displayName: string; level: number; ready: boolean;
  markingMode: BingoMarkingMode; appearance: typeof DEFAULT_AVATAR_APPEARANCE; isHost: boolean;
  connected: boolean; loading: boolean; balance: number; cards: ItalianBingoCard[]; purchaseInProgress: boolean;
  purchaseRequestId?: string; purchaseId?: string;
}
type Harness = {
  phases: LobbyStateMachine; participants: Map<string, Participant>; byUser: Map<string, string>;
  hostSessionId: string; roundId: string; round: number; config: RoomBingoConfig; nextRoundConfig: RoomBingoConfig | null;
  cardsSold: number; potCredits: number; countdownEndsAt: number | null; preparationEndsAt: number | null;
  drawnNumbers: number[]; drawPool: number[]; nextDrawAt: number | null; claimWindow: { closesAt: number } | null;
  results: BingoRoundResult[]; awardedTiers: Set<string>; roundPersistedFinished: boolean;
  roundInitialized: Promise<void> | null; eventDirector: BingoEventDirector; activeEvent: ActiveBingoEvent | null;
  pendingPurchases: Set<Promise<void>>; pendingCancellation: Promise<void> | null;
  tryStartEvent(now: number): boolean; finishEvent(now: number): void;
  purchaseCards(client: Client, request: { quantity: number; markingMode: BingoMarkingMode; requestId: string; roundId?: string }): Promise<void>;
  issueCards: (participant: Participant, quantity: number, requestId: string) => ItalianBingoCard[];
  updateConfig(client: Client, config: Pick<RoomBingoConfig, 'startMode' | 'countdownSeconds' | 'numberCallInterval' | 'crowdDensity' | 'tier' | 'chaosLevel' | 'training'>): void;
  snapshotFor(participant: Participant): BingoSnapshotPayload;
  requestStart(client: Client): void; setReady(client: Client, ready: boolean): void; cancelStart(client: Client): void;
  setPreparing(client: Client, preparing: boolean): void;
  evaluateAutomaticStart(): void; startPlaying(): void; tick(): void; prepareNextRound(): void;
  markCell(client: Client, request: { round: number; cardIndex: number; cellIndex: number; marked: boolean; roundId?: string }): void;
  drawNumber(): void; completeRound(now: number): Promise<void>;
  handleClaim(client: Client, request: { round: number; tier: 'CINQUINA' | 'BINGO'; cardIndex: number; requestId: string; roundId?: string }): Promise<void>;
  settleClaimWindow(): Promise<void>; retryPayouts(): Promise<void>; cancelPurchasedRound(client: Client): Promise<void>;
};

function harness() {
  const room = new BingoRoom();
  room.broadcast = vi.fn();
  const state = room as unknown as Harness;
  state.phases.transition('CARD_PURCHASE');
  state.config.crowdDensity = 0;
  function add(id: string, cards = false) {
    const participant: Participant = { sessionId: id, userId: id, displayName: id, level: 1, ready: false,
      markingMode: 'MANUAL', appearance: DEFAULT_AVATAR_APPEARANCE, isHost: !state.hostSessionId,
      connected: true, loading: false, balance: 100, cards: cards ? createUniqueItalianCards(1, id, id) : [], purchaseInProgress: false };
    const client = { sessionId: id, send: vi.fn(), leave: vi.fn(), auth: { userId: id, balance: 100,
      profile: { displayName: id, level: 1, appearance: DEFAULT_AVATAR_APPEARANCE } } } as unknown as Client;
    room.clients.push(client);
    state.participants.set(id, participant);
    state.byUser.set(id, id);
    if (!state.hostSessionId) state.hostSessionId = id;
    return { participant, client };
  }
  return { room, state, add };
}
const purchase = { quantity: 1, markingMode: 'MANUAL' as const, requestId: 'purchase-1234' };
function changedConfig(config: RoomBingoConfig) {
  return { startMode: config.startMode, countdownSeconds: config.countdownSeconds,
    numberCallInterval: config.numberCallInterval, crowdDensity: config.crowdDensity,
    tier: 'PREMIUM' as const, chaosLevel: config.chaosLevel, training: config.training };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(100_000);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  economy.ensure.mockResolvedValue(undefined);
  economy.load.mockResolvedValue(null);
  economy.purchase.mockImplementation(async (input: PurchaseBingoCardsInput) => ({ purchaseId: 'purchase-id', cards: input.cards,
    balance: 100 - input.cards.length * input.cardPrice, cardsSold: input.cards.length, potCredits: input.cards.length * input.cardPrice, replayed: false }));
  economy.queue.mockImplementation(async (input: QueueBingoAwardsInput) => input.awards.map((award) => ({ ...award, id: `award-${input.tier}-${award.cardId}` })));
  economy.settle.mockResolvedValue({ balance: 105, paid: true, replayed: false });
  economy.finish.mockResolvedValue(undefined);
  economy.cancel.mockResolvedValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Bingo authoritative purchase lifecycle', () => {
  it('freezes economics before the debit awaits, blocks start and keeps edited settings for next round', async () => {
    const { state, add } = harness();
    const { participant, client } = add('host');
    let finish!: () => void;
    economy.ensure.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = state.purchaseCards(client, purchase);
    expect(participant.purchaseInProgress).toBe(true);
    state.updateConfig(client, changedConfig(state.config));
    expect(state.config.cardPrice).toBe(10);
    expect(state.nextRoundConfig?.cardPrice).toBe(25);
    state.requestStart(client);
    expect(client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.actionRejected, expect.objectContaining({ reason: 'purchase_in_progress' }));
    finish(); await pending;
    expect(state.snapshotFor(participant).prizePool.takingsCredits).toBe(10);
    expect(economy.purchase).toHaveBeenCalledWith(expect.objectContaining({ cardPrice: 10, gameId: state.roundId }));
    expect(client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.purchaseConfirmed, expect.objectContaining({ totalCredits: 10 }));
  });

  it('does not charge if card emission fails and reports a recoverable failure', async () => {
    const { state, add } = harness(); const { client, participant } = add('host');
    vi.spyOn(state, 'issueCards').mockImplementationOnce(() => { throw new Error('generation failed'); });
    await state.purchaseCards(client, purchase);
    expect(economy.purchase).not.toHaveBeenCalled();
    expect(participant.cards).toHaveLength(0);
    expect(participant.purchaseInProgress).toBe(false);
    expect(client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.actionRejected, { action: 'purchaseCards', reason: 'purchase_failed', requestId: purchase.requestId });
  });

  it('replays a confirmed request without a second debit and refuses a different purchase', async () => {
    const { state, add } = harness(); const { client, participant } = add('host');
    await state.purchaseCards(client, purchase);
    const ids = participant.cards.map((card) => card.id);
    await state.purchaseCards(client, purchase);
    await state.purchaseCards(client, { ...purchase, requestId: 'different-id' });
    expect(economy.purchase).toHaveBeenCalledTimes(1);
    expect(participant.cards.map((card) => card.id)).toEqual(ids);
    expect(client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.actionRejected, expect.objectContaining({ reason: 'already_purchased' }));
  });

  it('recovers the committed cards and totals when the debit response is lost', async () => {
    const { state, add } = harness(); const { client, participant } = add('host');
    const originalCards = createPurchaseCards(1, 'committed-but-response-lost', 'saved-card');
    economy.purchase.mockRejectedValueOnce(new Error('connection closed after COMMIT'));
    economy.load.mockResolvedValueOnce({ id: 'original-purchase-id', requestId: purchase.requestId, quantity: 1,
      markingMode: 'MANUAL', cards: originalCards, balance: 90, cardsSold: 4, potCredits: 40 });
    await state.purchaseCards(client, purchase);
    expect(participant.cards).toEqual(originalCards);
    expect(participant.purchaseId).toBe('original-purchase-id');
    expect(state.cardsSold).toBe(4); expect(state.potCredits).toBe(40);
    expect(client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.purchaseConfirmed, expect.objectContaining({ purchaseId: 'original-purchase-id' }));
    expect(client.send).not.toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.actionRejected, expect.anything());
  });

  it('keeps an uncertain purchase enrolled and blocks start until its original transaction is resolved', async () => {
    const { state, add } = harness(); const host = add('host', true); add('second', true); const buyer = add('buyer');
    state.config.startMode = 'HOST';
    economy.purchase.mockRejectedValueOnce(new Error('connection closed after COMMIT'));
    economy.load.mockRejectedValueOnce(new Error('database unavailable during recovery'));
    await state.purchaseCards(buyer.client, purchase);
    expect(buyer.participant.purchaseInProgress).toBe(true);
    expect(buyer.participant.cards).toHaveLength(0);
    state.requestStart(host.client);
    expect(state.phases.phase).toBe('CARD_PURCHASE');
    expect(state.snapshotFor(host.participant).startBlockedReason).toBe('purchase_in_progress');
    const original = economy.purchase.mock.calls[0]![0] as PurchaseBingoCardsInput;
    economy.purchase.mockResolvedValueOnce({ purchaseId: 'committed-original', cards: original.cards, balance: 90, cardsSold: 3, potCredits: 30, replayed: true });
    vi.setSystemTime(103_001); state.tick();
    await Promise.allSettled([...state.pendingPurchases]);
    expect(economy.purchase.mock.calls[1]![0]).toEqual(original);
    expect(buyer.participant.purchaseInProgress).toBe(false);
    expect(buyer.participant.cards).toEqual(original.cards);
    expect(buyer.participant.balance).toBe(90);
    state.requestStart(host.client);
    expect(state.phases.phase).toBe('COUNTDOWN');
  });

  it('does not automatically retry a definite insufficient-funds rejection when the recovery lookup is unavailable', async () => {
    const { state, add } = harness(); const buyer = add('buyer');
    economy.purchase.mockRejectedValueOnce(AppError.insufficientFunds());
    economy.load.mockRejectedValueOnce(new Error('recovery lookup unavailable'));
    await state.purchaseCards(buyer.client, purchase);
    expect(buyer.participant.purchaseInProgress).toBe(false);
    expect(buyer.client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.actionRejected, expect.objectContaining({ reason: 'insufficient_credits' }));
    vi.setSystemTime(110_000); state.tick();
    await Promise.allSettled([...state.pendingPurchases]);
    expect(economy.purchase).toHaveBeenCalledOnce();
  });

  it('rejects purchases in countdown and stale round UUIDs without any debit', async () => {
    const { state, add } = harness(); const { client } = add('visitor');
    state.phases.transition('COUNTDOWN');
    await state.purchaseCards(client, purchase);
    await state.purchaseCards(client, { ...purchase, roundId: 'old-round' });
    expect(economy.purchase).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.actionRejected, expect.objectContaining({ reason: 'round_changed' }));
  });

  it('provides a complete 1–90 sestina for every six-card purchase', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const cards = createPurchaseCards(6, String(seed), `strip-${seed}`);
      expect(cards.flatMap(cardNumbers).sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, index) => index + 1));
      expect(cards.map((card) => card.index)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

describe('Bingo round enrollment and start modes', () => {
  it('excludes decorative guests and visitors; solo starts only with explicit training', () => {
    const { state, add } = harness(); const { client, participant } = add('host', true); add('visitor');
    participant.ready = true;
    state.config.crowdDensity = 6;
    state.requestStart(client);
    expect(state.phases.phase).toBe('CARD_PURCHASE');
    state.config.training = true;
    state.requestStart(client);
    expect(state.phases.phase).toBe('COUNTDOWN');
  });

  it('does not let the host bypass ALL_READY and does not let spectators block it', () => {
    const { state, add } = harness(); const host = add('host', true); const guest = add('guest', true); add('visitor');
    host.participant.ready = true;
    state.requestStart(host.client);
    expect(state.phases.phase).toBe('CARD_PURCHASE');
    state.setReady(guest.client, true);
    expect(state.phases.phase).toBe('COUNTDOWN');
  });

  it('keeps late joiners out of the frozen coorte and preserves the countdown', () => {
    const { room, state, add } = harness(); const host = add('host', true); const guest = add('guest', true);
    host.participant.ready = guest.participant.ready = true;
    state.requestStart(host.client);
    const late = add('late');
    room.onJoin(late.client);
    expect(state.phases.phase).toBe('COUNTDOWN');
    expect(state.snapshotFor(state.participants.get('late')!).players.find((player) => player.userId === 'late')?.participation).toBe('SPECTATOR');
    state.startPlaying();
    expect(state.phases.phase).toBe('PLAYING');
  });

  it('revalidates connectivity and loading at countdown completion', () => {
    const { state, add } = harness(); const host = add('host', true); const guest = add('guest', true);
    state.config.startMode = 'HOST'; state.requestStart(host.client);
    guest.participant.loading = true;
    state.startPlaying();
    expect(state.phases.phase).toBe('CARD_PURCHASE');
  });

  it('uses preparation messages to cancel a participant countdown but ignores a preparing spectator', () => {
    const { state, add } = harness(); const host = add('host', true); add('guest', true); const visitor = add('visitor');
    state.config.startMode = 'HOST'; state.requestStart(host.client);
    state.setPreparing(visitor.client, true);
    expect(state.phases.phase).toBe('COUNTDOWN');
    state.setPreparing(host.client, true);
    expect(state.phases.phase).toBe('CARD_PURCHASE'); expect(host.participant.loading).toBe(true);
    state.requestStart(host.client); expect(state.phases.phase).toBe('CARD_PURCHASE');
    state.setPreparing(host.client, false); state.requestStart(host.client);
    expect(state.phases.phase).toBe('COUNTDOWN');
  });

  it('uses a visible TIMER preparation deadline before the final countdown', () => {
    const { state, add } = harness(); const host = add('host', true); add('guest', true);
    state.config.startMode = 'TIMER'; state.preparationEndsAt = 115_000;
    state.evaluateAutomaticStart();
    state.requestStart(host.client);
    expect(state.phases.phase).toBe('CARD_PURCHASE');
    vi.setSystemTime(115_001); state.tick();
    expect(state.phases.phase).toBe('COUNTDOWN');
    expect(state.countdownEndsAt).toBe(120_001);
  });

  it('keeps an explicitly cancelled countdown cancelled until another readiness or host action', () => {
    const { state, add } = harness(); const host = add('host', true); const guest = add('guest', true);
    host.participant.ready = guest.participant.ready = true; state.requestStart(host.client);
    state.cancelStart(host.client); state.tick();
    expect(state.phases.phase).toBe('CARD_PURCHASE');
    state.requestStart(host.client); expect(state.phases.phase).toBe('COUNTDOWN');
  });

  it('transfers host and preserves purchased cards for a fresh session of the same user', async () => {
    const { room, state, add } = harness(); const host = add('host'); const guest = add('guest');
    await state.purchaseCards(host.client, purchase);
    host.participant.cards[0]!.markedIndices = [0];
    room.onLeave(host.client);
    expect(state.hostSessionId).toBe('guest');
    const fresh = { ...host.client, sessionId: 'new-session' } as Client;
    room.onJoin(fresh);
    const restored = state.participants.get('new-session')!;
    expect(restored.cards[0]!.markedIndices).toEqual([0]);
    expect(restored.purchaseId).toBe('purchase-id');
    expect(guest.participant.isHost).toBe(true);
  });

  it('keeps marking preference and creates a different round UUID without purchasing again', () => {
    const { state, add } = harness(); const { participant } = add('host', true);
    const previous = state.roundId; participant.markingMode = 'AUTOMATIC';
    state.phases.transition('ENDED'); state.prepareNextRound();
    expect(state.roundId).not.toBe(previous);
    expect(participant.markingMode).toBe('AUTOMATIC');
    expect(participant.cards).toEqual([]); expect(economy.purchase).not.toHaveBeenCalled();
  });

  it('cancels purchased preparation with a refund and a new round instead of stranding disconnected players', async () => {
    const { state, add } = harness(); const { client } = add('host');
    await state.purchaseCards(client, purchase); const oldRound = state.roundId;
    await state.cancelPurchasedRound(client);
    expect(economy.cancel).toHaveBeenCalledWith(oldRound);
    expect(state.phases.phase).toBe('ENDED');
    state.prepareNextRound(); expect(state.roundId).not.toBe(oldRound);
  });

  it('freezes a cancellation after an uncertain refund commit and retries the same round before allowing play', async () => {
    const { state, add } = harness(); const host = add('host'); add('second', true);
    state.config.startMode = 'HOST';
    await state.purchaseCards(host.client, purchase); const originalRound = state.roundId;
    economy.cancel.mockRejectedValueOnce(new Error('connection closed after refund COMMIT')).mockResolvedValueOnce(false);
    await state.cancelPurchasedRound(host.client);
    expect(state.snapshotFor(host.participant).startBlockedReason).toBe('round_cancelling');
    state.requestStart(host.client);
    expect(state.phases.phase).toBe('CARD_PURCHASE');
    vi.setSystemTime(103_001); state.tick();
    await state.pendingCancellation;
    expect(economy.cancel.mock.calls).toEqual([[originalRound], [originalRound]]);
    expect(state.phases.phase).toBe('ENDED');
    expect(host.participant.balance).toBe(100);
    state.prepareNextRound();
    expect(state.roundId).not.toBe(originalRound);
  });

  it('restores hosting when the only player reconnects after a hostless interval', () => {
    const { room, state, add } = harness(); const { participant, client } = add('host');
    state.hostSessionId = ''; participant.isHost = false; participant.connected = false;
    room.onReconnect(client);
    expect(state.hostSessionId).toBe('host'); expect(participant.isHost).toBe(true);
  });

  it('does not clear an active preparation panel when reconnecting', () => {
    const { room, state, add } = harness(); const { participant, client } = add('host');
    state.setPreparing(client, true);
    room.onReconnect(client);
    expect(participant.loading).toBe(true);
  });
});

describe('Bingo server claim windows and pending credits', () => {
  function playing() {
    const fixture = harness(); const alice = fixture.add('alice', true); const bruno = fixture.add('bruno', true);
    fixture.state.phases.transition('PLAYING'); fixture.state.cardsSold = 2;
    fixture.state.drawnNumbers = [...new Set([...cardNumbers(alice.participant.cards[0]!), ...cardNumbers(bruno.participant.cards[0]!)])];
    return { ...fixture, alice, bruno };
  }
  const claim = { round: 1, tier: 'CINQUINA' as const, cardIndex: 0, requestId: 'claim-request-1' };

  it('freezes draws, accepts same-draw winners and duplicate requests once, splitting residual credits deterministically', async () => {
    const { state, alice, bruno } = playing();
    await state.handleClaim(bruno.client, claim); await state.handleClaim(alice.client, claim); await state.handleClaim(alice.client, claim);
    state.drawPool = [90]; const count = state.drawnNumbers.length; state.drawNumber();
    expect(state.drawnNumbers).toHaveLength(count);
    expect(economy.settle).not.toHaveBeenCalled();
    vi.setSystemTime(105_001); await state.settleClaimWindow();
    expect(economy.queue).toHaveBeenCalledWith(expect.objectContaining({ awards: [expect.objectContaining({ userId: 'alice', amount: 3 }), expect.objectContaining({ userId: 'bruno', amount: 2 })] }));
    expect(state.results).toHaveLength(2); expect(state.results.every((result) => result.status === 'PAID')).toBe(true);
    expect(state.results.reduce((total, result) => total + result.prizeCredits, 0)).toBe(5);
    expect(economy.settle).toHaveBeenCalledTimes(2);
  });

  it('closes the acceptance window by server time even before the next tick', async () => {
    const { state, alice, bruno } = playing(); await state.handleClaim(alice.client, claim);
    vi.setSystemTime(105_000); await state.handleClaim(bruno.client, claim);
    expect(bruno.client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.claimRejected, expect.objectContaining({ reason: 'claim_window_closed' }));
  });

  it('leaves a failed credit pending and announces a winner only after an idempotent retry succeeds', async () => {
    const { room, state, alice } = playing(); economy.settle.mockRejectedValueOnce(new Error('database down'));
    await state.handleClaim(alice.client, claim); vi.setSystemTime(105_001); await state.settleClaimWindow();
    expect(state.results[0]?.status).toBe('PENDING');
    expect(room.broadcast).not.toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.winner, expect.anything());
    await state.retryPayouts(); await state.retryPayouts();
    expect(state.results[0]?.status).toBe('PAID'); expect(economy.settle).toHaveBeenCalledTimes(2);
    expect(vi.mocked(room.broadcast).mock.calls.filter(([kind]) => kind === BINGO_SERVER_MESSAGES.winner)).toHaveLength(1);
  });

  it('does not consume a prize tier if persisting the complete winner group fails', async () => {
    const { state, alice } = playing(); economy.queue.mockRejectedValueOnce(new Error('database down'));
    await state.handleClaim(alice.client, claim); vi.setSystemTime(105_001); await state.settleClaimWindow();
    expect(state.awardedTiers.has('CINQUINA')).toBe(false); expect(state.claimWindow).not.toBeNull();
    await state.settleClaimWindow(); expect(state.awardedTiers.has('CINQUINA')).toBe(true);
    expect(state.claimWindow).toBeNull();
  });

  it('does not refund a completed bingo when the last player leaves during the results animation', async () => {
    const { room, state, alice } = playing(); state.roundInitialized = Promise.resolve();
    await state.handleClaim(alice.client, { ...claim, tier: 'BINGO' });
    vi.setSystemTime(105_001); await state.settleClaimWindow();
    expect(state.phases.phase).toBe('RESULTS');
    await room.onDispose();
    expect(economy.finish).toHaveBeenCalledWith(state.roundId);
    expect(economy.cancel).not.toHaveBeenCalled();
  });

  it('finishes after all 90 draws without inventing a winner or refunding an unclaimed completed round', async () => {
    const { room, state } = playing(); state.roundInitialized = Promise.resolve();
    state.drawnNumbers = []; state.drawPool = Array.from({ length: 90 }, (_, index) => index + 1);
    for (let draw = 0; draw < 90; draw += 1) state.drawNumber();
    expect(state.drawnNumbers).toHaveLength(90);
    // Keep the final draw claimable until the next scheduled draw attempt.
    expect(state.phases.phase).toBe('PLAYING');
    state.drawNumber();
    expect(state.phases.phase).toBe('RESULTS'); expect(state.results).toEqual([]);
    await state.completeRound(107_000);
    expect(state.phases.phase).toBe('ENDED');
    expect(state.roundPersistedFinished).toBe(true);
    await room.onDispose();
    expect(economy.finish).toHaveBeenCalledWith(state.roundId);
    expect(economy.cancel).not.toHaveBeenCalled();
    expect(economy.queue).not.toHaveBeenCalled(); expect(economy.settle).not.toHaveBeenCalled();
    expect(economy.purchase).not.toHaveBeenCalled();
  });

  it('continues through decorative events but pauses claims and draws for a blackout', async () => {
    const { state, alice } = playing();
    const event: ActiveBingoEvent = { id: 'confetti', name: 'Confetti', description: 'Decorativo', category: 'COMEDY', startedAt: 100_000,
      endsAt: 110_000, callIntervalMultiplier: 1.2, visualIntensity: 1 };
    vi.spyOn(state.eventDirector, 'maybeStart').mockReturnValueOnce(event);
    expect(state.tryStartEvent(100_000)).toBe(false); expect(state.phases.phase).toBe('PLAYING');
    await state.handleClaim(alice.client, claim); expect(state.claimWindow).not.toBeNull();
    state.claimWindow = null; state.finishEvent(110_000);
    vi.spyOn(state.eventDirector, 'maybeStart').mockReturnValueOnce({ ...event, id: 'blackout', category: 'TECHNICAL' });
    expect(state.tryStartEvent(110_000)).toBe(true); expect(state.phases.phase).toBe('EVENT_ACTIVE');
    await state.handleClaim(alice.client, claim);
    expect(alice.client.send).toHaveBeenCalledWith(BINGO_SERVER_MESSAGES.claimRejected, expect.objectContaining({ reason: 'event_paused' }));
    state.finishEvent(120_000); expect(state.phases.phase).toBe('PLAYING');
  });

  it('keeps manual errors correctable, rejects blanks and never awards marks on uncalled numbers', async () => {
    const { state, alice } = playing(); const card = alice.participant.cards[0]!;
    const blank = card.cells.findIndex((cell) => cell === null); const full = card.cells.findIndex((cell) => cell !== null);
    state.drawnNumbers = [];
    state.markCell(alice.client, { round: 1, cardIndex: 0, cellIndex: blank, marked: true });
    expect(card.markedIndices).toEqual([]);
    state.markCell(alice.client, { round: 1, cardIndex: 0, cellIndex: full, marked: true });
    expect(card.markedIndices).toEqual([full]);
    await state.handleClaim(alice.client, claim); expect(state.claimWindow).toBeNull();
    state.markCell(alice.client, { round: 1, cardIndex: 0, cellIndex: full, marked: false });
    expect(card.markedIndices).toEqual([]);
  });

  it('marks every automatic card while leaving all manual cards alone', () => {
    const { state, alice, bruno } = playing(); bruno.participant.markingMode = 'AUTOMATIC';
    bruno.participant.cards = createPurchaseCards(6, 'automatic-strip', 'auto');
    state.drawnNumbers = []; state.drawPool = [42]; state.drawNumber();
    expect(bruno.participant.cards.flatMap((card) => card.markedIndices.map((index) => card.cells[index]))).toEqual([42]);
    expect(alice.participant.cards[0]!.markedIndices).toEqual([]);
  });
});
