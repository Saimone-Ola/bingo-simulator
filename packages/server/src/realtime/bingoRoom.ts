import { createHash, randomUUID } from 'node:crypto';
import { Room, ServerError, type Client } from 'colyseus';
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_SERVER_MESSAGES,
  BINGO_EVENT_CATALOG,
  BingoEventDirector,
  bingoClaimSchema,
  bingoConfigSchema,
  DEFAULT_PRIZE_POOL_CONFIG,
  DEFAULT_NPC_DENSITY,
  HALL_CAPACITY,
  crowdFor,
  SeatRegistry,
  bingoEmptySchema,
  bingoSeatSchema,
  bingoMarkSchema,
  bingoPingSchema,
  bingoPurchaseSchema,
  bingoReadySchema,
  bingoPreparingSchema,
  effectiveBingoCallInterval,
  normaliseBingoRoomCode,
  type ActiveBingoEvent,
  type AvatarAppearance,
  type BingoActionRejectedPayload,
  type BingoBallCalledPayload,
  type BingoClaimRejectedPayload,
  type BingoClaimTier,
  type BingoMarkingMode,
  type BingoPlayerSummary,
  type BingoPongPayload,
  type PrizeBreakdown,
  type PrizePoolConfig,
  type SeatRejectionReason,
  type BingoRoomTier,
  computePrizePool,
  type BingoSeatRejectedPayload,
  type BingoSeatingPayload,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type BingoRoundResult,
  type BingoPurchaseConfirmedPayload,
  type ItalianBingoCard,
  type RoomBingoConfig,
  type UserRole,
} from '@bingo/shared';
import { verifyAccessToken } from '../auth/tokens';
import { db } from '../db/client';
import { isAppError } from '../errors';
import { sanitizeError } from '../logging';
import { getWalletState } from '../services/ledger';
import { ensureBingoRound, purchaseBingoCards, loadBingoPurchase, queueBingoAwards, settleBingoAward, finishBingoRound, cancelBingoRound } from '../services/bingoEconomy';
import { loadPlayerProfile, type PlayerProfile } from '../services/players';
import {
  autoMarkCalledNumbers,
  cardSignature,
  createItalianDrawPool,
  createPurchaseCards,
  findBingoNumbers,
  findCinquinaNumbers,
} from './bingoRules';
import { LobbyStateMachine } from './lobbyStateMachine';

const RECONNECT_SECONDS = 60;
const RESULTS_DURATION_MS = 7_000;
const ENDED_DURATION_MS = 2_500;
const EVENT_HISTORY_LIMIT = 5;
const CLAIM_WINDOW_MS = 5_000;
const PAYOUT_RETRY_MS = 3_000;

const TIER_DEFAULTS: Record<
  BingoRoomTier,
  Pick<RoomBingoConfig, 'cardPrice' | 'numberCallInterval'>
> = {
  ECONOMY: { cardPrice: 5, numberCallInterval: 3_500 },
  STANDARD: { cardPrice: 10, numberCallInterval: 5_000 },
  PREMIUM: { cardPrice: 25, numberCallInterval: 6_000 },
};

const NPC_NAMES = ['Lucia', 'Bruno', 'Marta', 'Gino', 'Teresa', 'Nico'] as const;
const NPC_APPEARANCES: AvatarAppearance[] = [
  { bodyType: 'curvy', skinTone: '#c98f6b', hairStyle: 'curly', hairColor: '#2b2118', shirtColor: '#a13d63', pantsColor: '#332d39', heightCm: 164 },
  { bodyType: 'athletic', skinTone: '#9b6247', hairStyle: 'buzz', hairColor: '#17131d', shirtColor: '#2f7d70', pantsColor: '#243e62', heightCm: 183 },
  { bodyType: 'slim', skinTone: '#f3d1bd', hairStyle: 'bob', hairColor: '#6b3b24', shirtColor: '#3b78a8', pantsColor: '#4a4585', heightCm: 171 },
  { bodyType: 'neutral', skinTone: '#e0b49a', hairStyle: 'short', hairColor: '#e4c07a', shirtColor: '#a36b2c', pantsColor: '#48585c', heightCm: 176 },
  { bodyType: 'curvy', skinTone: '#70432f', hairStyle: 'long', hairColor: '#17131d', shirtColor: '#6d4bb8', pantsColor: '#6c3656', heightCm: 168 },
  { bodyType: 'slim', skinTone: '#44291f', hairStyle: 'curly', hairColor: '#17131d', shirtColor: '#b44d3f', pantsColor: '#2f2a61', heightCm: 179 },
];

type ActionName = keyof typeof BINGO_CLIENT_MESSAGES;

interface BingoAuth {
  userId: string;
  role: UserRole;
  profile: PlayerProfile;
  balance: number;
}

interface BingoParticipant {
  sessionId: string;
  userId: string;
  displayName: string;
  level: number;
  ready: boolean;
  markingMode: BingoMarkingMode;
  appearance: AvatarAppearance;
  isHost: boolean;
  connected: boolean;
  loading: boolean;
  preparing: boolean;
  balance: number;
  cards: ItalianBingoCard[];
  purchaseInProgress: boolean;
  purchaseRequestId?: string;
  purchaseId?: string;
}

interface ClaimWindow {
  tier: BingoClaimTier;
  drawIndex: number;
  closesAt: number;
  claims: Map<string, { participant: BingoParticipant; card: ItalianBingoCard; winningNumbers: number[] }>;
}

type PurchaseRequest = { quantity: number; markingMode: BingoMarkingMode; requestId: string; roundId?: string };
interface PurchaseAttempt {
  participant: BingoParticipant;
  request: PurchaseRequest;
  gameId: string;
  cards: ItalianBingoCard[];
  limit: number;
  retrying: boolean;
  retryAt: number;
}

export class BingoRoom extends Room {
  /**
   * One player per chair, and the hall has 512.
   *
   * This was 20, which was the whole room when the hall was forty seats and is
   * now four per cent of it: the floor could show five hundred people and the
   * door let twenty-four in. Derived from the seat list so the two can never
   * drift again — a room that admits more players than it has chairs would
   * strand the extras standing, and one that admits fewer is the bug being
   * fixed here.
   */
  override maxClients = HALL_CAPACITY;

  /**
   * Who is sitting where.
   *
   * Authoritative and synchronous: a claim resolves without an await, so two
   * clients racing for the same chair cannot both win it.
   */
  private readonly seats = new SeatRegistry();

  private roomCode = 'TESI-2026';
  private readonly displayRoomName = 'Sala Tesi — Bingo Italiano';
  private readonly phases = new LobbyStateMachine();
  private readonly participants = new Map<string, BingoParticipant>();
  private readonly byUser = new Map<string, string>();
  private readonly issuedSignatures = new Set<string>();
  private hostSessionId = '';
  private round = 1;
  private roundId = randomUUID();
  private roundInitialized: Promise<void> | null = null;
  private economicsLocked = false;
  private nextRoundConfig: RoomBingoConfig | null = null;
  private preparationEndsAt: number | null = null;
  private automaticStartCancelled = false;
  private readonly countdownParticipants = new Set<string>();
  private claimWindow: ClaimWindow | null = null;
  private results: BingoRoundResult[] = [];
  private settling = false;
  private readonly settlementWaiters: Array<() => void> = [];
  private disposing = false;
  private nextSettlementAt = 0;
  private readonly awardIds = new Map<string, string>();
  private finishingRound = false;
  private cancellingRound = false;
  private pendingCancellation: Promise<void> | null = null;
  private nextCancellationAt = 0;
  private roundPersistedFinished = false;
  private readonly pendingPurchases = new Set<Promise<void>>();
  private readonly purchaseAttempts = new Map<string, PurchaseAttempt>();
  private seed = randomUUID();
  private eventDirector = new BingoEventDirector(this.seed);
  private activeEvent: ActiveBingoEvent | null = null;
  private eventHistory: ActiveBingoEvent[] = [];
  private eventResumeDelayMs = 0;
  private drawPool: number[] = [];
  private drawnNumbers: number[] = [];
  private currentNumber: number | null = null;
  private countdownEndsAt: number | null = null;
  private nextDrawAt: number | null = null;
  private phaseEndsAt: number | null = null;
  private potCredits = 0;
  private paidCredits = 0;
  /** Cards sold this round, which is what the pool is computed from. */
  private cardsSold = 0;
  private prizeConfig: PrizePoolConfig = { ...DEFAULT_PRIZE_POOL_CONFIG };
  private readonly awardedTiers = new Set<BingoClaimTier>();

  private config: RoomBingoConfig = {
    training: false,
    minPlayers: 2,
    maxPlayers: HALL_CAPACITY,
    startMode: 'ALL_READY',
    countdownSeconds: 10,
    cardPrice: TIER_DEFAULTS.STANDARD.cardPrice,
    maxManualCards: 3,
    maxAutomaticCards: 6,
    numberCallInterval: TIER_DEFAULTS.STANDARD.numberCallInterval,
    enabledEvents: [],
    crowdDensity: DEFAULT_NPC_DENSITY,
    tier: 'STANDARD',
    chaosLevel: 'LIGHT',
  };

  override onCreate(options: unknown): void {
    const requested =
      typeof options === 'object' && options !== null
        ? (options as { roomCode?: unknown }).roomCode
        : undefined;
    this.roomCode = normaliseBingoRoomCode(requested);
    this.setMetadata({ roomCode: this.roomCode, game: 'italian-bingo-90' });

    this.onMessage(BINGO_CLIENT_MESSAGES.purchaseCards, (client, payload: unknown) => {
      const parsed = bingoPurchaseSchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'purchaseCards', 'invalid_payload');
      const purchase = this.purchaseCards(client, parsed.data);
      this.pendingPurchases.add(purchase);
      void purchase.finally(() => this.pendingPurchases.delete(purchase));
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.setReady, (client, payload: unknown) => {
      const parsed = bingoReadySchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'setReady', 'invalid_payload');
      this.setReady(client, parsed.data.ready);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.updateConfig, (client, payload: unknown) => {
      const parsed = bingoConfigSchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'updateConfig', 'invalid_payload');
      this.updateConfig(client, parsed.data);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.startGame, (client, payload: unknown) => {
      const parsed = bingoEmptySchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'startGame', 'invalid_payload');
      this.requestStart(client);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.cancelStart, (client, payload: unknown) => {
      const parsed = bingoEmptySchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'cancelStart', 'invalid_payload');
      this.cancelStart(client);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.setPreparing, (client, payload: unknown) => {
      const parsed = bingoPreparingSchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'setPreparing', 'invalid_payload');
      this.setPreparing(client, parsed.data.preparing);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.cancelRound, (client, payload: unknown) => {
      if (!bingoEmptySchema.safeParse(payload).success) return this.reject(client, 'cancelRound', 'invalid_payload');
      void this.cancelPurchasedRound(client);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.markCell, (client, payload: unknown) => {
      const parsed = bingoMarkSchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'markCell', 'invalid_payload');
      this.markCell(client, parsed.data);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.claim, (client, payload: unknown) => {
      const parsed = bingoClaimSchema.safeParse(payload);
      if (!parsed.success) return this.reject(client, 'claim', 'invalid_payload');
      void this.handleClaim(client, parsed.data);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.takeSeat, (client, payload: unknown) => {
      const parsed = bingoSeatSchema.safeParse(payload);
      if (!parsed.success) return;
      this.takeSeat(client, parsed.data.seatId);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.leaveSeat, (client) => {
      const participant = this.participants.get(client.sessionId);
      if (!participant) return;
      if (this.seats.release(participant.userId) === null) {
        this.rejectSeat(client, '', 'not_seated');
        return;
      }
      this.seatChanged(client);
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.reserveSeat, (client, payload: unknown) => {
      const parsed = bingoSeatSchema.safeParse(payload);
      if (!parsed.success) return;
      const participant = this.participants.get(client.sessionId);
      if (!participant) return;
      const result = this.seats.reserve(parsed.data.seatId, participant.userId, Date.now());
      if (!result.ok) {
        this.rejectSeat(client, parsed.data.seatId, result.reason);
        return;
      }
      this.broadcastSeating();
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.cancelReservation, (client, payload: unknown) => {
      const parsed = bingoSeatSchema.safeParse(payload);
      if (!parsed.success) return;
      const participant = this.participants.get(client.sessionId);
      if (!participant) return;
      if (this.seats.cancelReservation(parsed.data.seatId, participant.userId)) {
        this.broadcastSeating();
      }
    });

    this.onMessage(BINGO_CLIENT_MESSAGES.ping, (client, payload: unknown) => {
      const parsed = bingoPingSchema.safeParse(payload);
      if (!parsed.success) return;
      const pong: BingoPongPayload = {
        clientTime: parsed.data.clientTime,
        serverTime: Date.now(),
      };
      client.send(BINGO_SERVER_MESSAGES.pong, pong);
    });

    this.clock.setInterval(() => this.tick(), 200);
  }

  override async onAuth(_client: Client, options: unknown): Promise<BingoAuth> {
    const token =
      typeof options === 'object' && options !== null
        ? (options as { accessToken?: unknown }).accessToken
        : undefined;
    if (typeof token !== 'string' || token.length === 0) {
      throw new ServerError(401, 'unauthorized');
    }

    const claims = await verifyAccessToken(token);
    const [profile, wallet] = await Promise.all([
      loadPlayerProfile(claims.sub),
      getWalletState(db, claims.sub),
    ]);
    if (!profile) throw new ServerError(401, 'unauthorized');
    if (profile.status !== 'active') throw new ServerError(403, 'account_suspended');
    return { userId: claims.sub, role: claims.role, profile, balance: wallet.balance };
  }

  override onJoin(client: Client): void {
    const auth = client.auth as BingoAuth | undefined;
    if (!auth) return void client.leave(401);

    const previousSession = this.byUser.get(auth.userId);
    let preserved: BingoParticipant | undefined;
    if (previousSession && previousSession !== client.sessionId) {
      preserved = this.participants.get(previousSession);
      const oldClient = this.clients.find((candidate) => candidate.sessionId === previousSession);
      oldClient?.leave(4001);
      this.participants.delete(previousSession);
    }

    const participant: BingoParticipant =
      preserved ?? {
        sessionId: client.sessionId,
        userId: auth.userId,
        displayName: auth.profile.displayName,
        level: auth.profile.level,
        ready: false,
        markingMode: 'MANUAL',
        appearance: auth.profile.appearance,
        isHost: this.hostSessionId.length === 0,
        connected: true,
        loading: false,
        preparing: false,
        balance: auth.balance,
        cards: [],
        purchaseInProgress: false,
      };

    if (preserved) {
      preserved.sessionId = client.sessionId;
      preserved.connected = true;
      preserved.loading = preserved.preparing;
    }

    if (previousSession === this.hostSessionId) this.hostSessionId = client.sessionId;
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    participant.isHost = participant.sessionId === this.hostSessionId;
    this.participants.set(client.sessionId, participant);
    this.byUser.set(auth.userId, client.sessionId);
    if (!preserved && this.roundInitialized) {
      participant.loading = true;
      participant.purchaseInProgress = this.phases.phase === 'CARD_PURCHASE';
      const recovery = this.restorePurchaseOnJoin(participant);
      this.pendingPurchases.add(recovery);
      void recovery.finally(() => this.pendingPurchases.delete(recovery));
    }

    if (this.phases.phase === 'WAITING') this.phases.transition('CARD_PURCHASE');
    this.seats.expire(Date.now());
    this.seats.resume(participant.userId);
    if (this.config.startMode === 'TIMER' && this.preparationEndsAt === null && this.phases.phase === 'CARD_PURCHASE') {
      this.preparationEndsAt = Date.now() + this.config.countdownSeconds * 1_000;
    }
    // Fill the hall before anyone looks at it. This used to run only on
    // reconnect, so the very first player into a fresh room found 512 empty
    // chairs — and once "are there enough players" started counting seated
    // guests rather than a configured number, a lone host could never start a
    // round at all.
    this.seatNpcs();
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  override async onDrop(client: Client): Promise<void> {
    const participant = this.participants.get(client.sessionId);
    if (participant) {
      participant.connected = false;
      participant.loading = true;
      this.seats.hold(participant.userId, Date.now());
      if (this.countdownParticipants.has(participant.userId)) this.cancelCountdown();
      if (client.sessionId === this.hostSessionId) this.reassignHost();
      this.sendAllSnapshots();
    }
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      // onLeave removes the expired seat.
    }
  }

  override onReconnect(client: Client): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    participant.connected = true;
    participant.loading = Boolean(participant.preparing);
    if (!this.hostSessionId) this.reassignHost();
    // The seat was held, not released, while they were gone — claim it back or
    // the hold lapses and they are evicted from a chair they never left.
    this.seats.expire(Date.now());
    this.seats.resume(participant.userId);
    this.seatNpcs();
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  override onLeave(client: Client): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    const wasConnected = participant.connected;
    participant.connected = false;
    participant.loading = false;
    participant.ready = false;
    if (participant.cards.length === 0 && !participant.purchaseInProgress) {
      this.participants.delete(client.sessionId);
      if (this.byUser.get(participant.userId) === client.sessionId) this.byUser.delete(participant.userId);
    }
    // The chair is held, not freed: a player who drops mid-game comes back to
    // the same seat with the same cards. It lapses on its own.
    if (wasConnected) this.seats.hold(participant.userId, Date.now());
    this.seats.cancelAllReservations(participant.userId);
    this.broadcastSeating();
    if (client.sessionId === this.hostSessionId) this.reassignHost();
    if (this.countdownParticipants.has(participant.userId)) this.cancelCountdown();
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private summaries(): BingoPlayerSummary[] {
    const humans = [...this.participants.values()].map((participant) => ({
      participation: participant.cards.length > 0 ? 'PARTICIPANT' as const
        : this.phases.phase === 'CARD_PURCHASE' ? 'VISITOR' as const : 'SPECTATOR' as const,
      purchaseInProgress: participant.purchaseInProgress,
      sessionId: participant.sessionId,
      userId: participant.userId,
      displayName: participant.displayName,
      level: participant.level,
      ready: participant.ready,
      cardCount: participant.cards.length,
      markingMode: participant.markingMode,
      appearance: participant.appearance,
      isHost: participant.isHost,
      isNpc: false,
      connected: participant.connected,
      loading: participant.loading,
      balance: participant.balance,
    }));

    // NPCs are deliberately *not* here. A hall of five hundred would put 180 KiB
    // of guest summaries into every snapshot, re-sent on every number called,
    // for people whose only changing property is which chair they are in. They
    // travel in the seating chart instead — one row each — and the client
    // derives their faces from their ids, which is why hallPopulation is shared
    // and deterministic rather than a client-side sprinkle.
    return humans;
  }

  /** Guest ids are stable for a round, so faces and cards stay put. */
  private npcId(index: number): string {
    return `npc-${this.round}-${index + 1}`;
  }

  private npcName(index: number): string {
    return NPC_NAMES[index % NPC_NAMES.length] ?? `Ospite ${index + 1}`;
  }

  private snapshotFor(participant: BingoParticipant): BingoSnapshotPayload {
    return {
      roundId: this.roundId,
      nextRoundConfig: this.nextRoundConfig ? { ...this.nextRoundConfig } : null,
      economicsLocked: this.economicsLocked,
      preparationEndsAt: this.preparationEndsAt,
      startBlockedReason: this.startBlocker(),
      claimWindow: this.claimWindow ? { tier: this.claimWindow.tier, drawIndex: this.claimWindow.drawIndex, closesAt: this.claimWindow.closesAt } : null,
      results: this.results.map((result) => ({ ...result, winningNumbers: [...result.winningNumbers] })),
      roomName: this.displayRoomName,
      roomCode: this.roomCode,
      round: this.round,
      phase: this.phases.phase,
      phaseChangedAt: this.phases.changedAt,
      countdownEndsAt: this.countdownEndsAt,
      mySessionId: participant.sessionId,
      hostSessionId: this.hostSessionId,
      config: { ...this.config, enabledEvents: [...this.config.enabledEvents] },
      players: this.summaries(),
      myCards: participant.cards.map((card) => ({
        ...card,
        cells: [...card.cells],
        markedIndices: [...card.markedIndices],
      })),
      drawnNumbers: [...this.drawnNumbers],
      currentNumber: this.currentNumber,
      nextDrawAt: this.nextDrawAt,
      potCredits: this.potCredits,
      prizePool: this.prizeBreakdown(),
      seedHash: createHash('sha256').update(this.seed).digest('hex').slice(0, 12),
      awardedTiers: [...this.awardedTiers],
      activeEvent: this.activeEvent ? { ...this.activeEvent } : null,
      eventHistory: this.eventHistory.map((event) => ({ ...event })),
      seating: this.seats.snapshot(),
      reservations: this.seats.reservationSnapshot(),
      mySeatId: this.seats.seatFor(participant.userId),
    };
  }

  /**
   * Seats a player.
   *
   * The reach check is deliberately absent: the client cannot be trusted about
   * where it is standing, and the hall is small enough that any seat in it is a
   * legitimate target from the overlay map. What is enforced is the part that
   * matters — one occupant per seat, one seat per occupant.
   */
  private takeSeat(client: Client, seatId: string): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;

    const result = this.seats.claim(
      seatId,
      participant.userId,
      participant.displayName,
      'PLAYER',
      Date.now(),
    );

    if (!result.ok) {
      this.rejectSeat(client, seatId, result.reason);
      return;
    }
    this.seatChanged(client);
  }

  /**
   * Publishes a seat change.
   *
   * Everyone needs the chart; the player who moved also needs a snapshot,
   * because `mySeatId` lives there and it is what tells their client they are
   * now sitting down. Broadcasting the chart alone left the person who pressed
   * the key standing in their own view while everyone else watched them sit.
   */
  private seatChanged(client: Client): void {
    this.broadcastSeating();
    this.sendSnapshot(client);
  }

  /**
   * The pool as it stands, recomputed rather than accumulated.
   *
   * Derived from cards sold and the room's configuration every time it is
   * asked for, so it cannot drift from the sales it is supposed to reflect —
   * and it stays correct while players come and go mid-purchase.
   */
  private prizeBreakdown(): PrizeBreakdown {
    return computePrizePool(this.cardsSold, {
      ...this.prizeConfig,
      cardPriceCredits: this.config.cardPrice,
    });
  }

  private rejectSeat(client: Client, seatId: string, reason: SeatRejectionReason): void {
    const payload: BingoSeatRejectedPayload = { seatId, reason };
    client.send(BINGO_SERVER_MESSAGES.seatRejected, payload);
  }

  /**
   * Sends the seating chart to everyone.
   *
   * Its own message rather than a full snapshot: a snapshot carries every
   * player's private cards and is far larger, and seats change on every arrival.
   */
  private broadcastSeating(): void {
    const payload: BingoSeatingPayload = {
      seating: this.seats.snapshot(),
      reservations: this.seats.reservationSnapshot(),
    };
    this.broadcast(BINGO_SERVER_MESSAGES.seating, payload);
  }

  /**
   * Fills the hall with guests, so it looks like a Bingo hall rather than a
   * meeting room with a stage in it.
   *
   * How many is not a constant: `crowdFor` varies it with the hour and with the
   * round, so a player who comes back at nine in the evening finds a fuller
   * room than the one they left at three in the afternoon. The host's setting
   * scales that rather than replacing it — a fixed count was the old behaviour
   * and it was capped at six, which is why a hall of 512 chairs never had more
   * than about two dozen people in it.
   */
  private seatNpcs(): void {
    const now = Date.now();
    const humans = this.participants.size;
    // Turning the dial to zero has to empty the hall. `crowdFor` floors the
    // occupancy at MIN_OCCUPANCY — an empty room looks broken, which is right
    // for every other setting — so "no guests at all" is decided here, where
    // the host's intent is known, rather than inside the curve.
    const crowd =
      this.config.crowdDensity === 0
        ? { totalPresent: humans, npcCount: 0, npcCards: 0 }
        : crowdFor(`${this.seed}:${this.round}`, new Date(now), {
            humans,
            density: this.config.crowdDensity / DEFAULT_NPC_DENSITY,
            maxNpcs: HALL_CAPACITY - humans,
          });

    // Guests who are no longer wanted give their chairs back before the rest
    // are seated, or a shrinking crowd would leave the hall permanently full.
    for (const row of this.seats.snapshot()) {
      if (row.kind !== 'NPC') continue;
      const index = this.npcIndexOf(row.occupantId);
      if (index === null || index >= crowd.npcCount) this.seats.release(row.occupantId);
    }

    // The free list is taken once and walked, not recomputed per guest: asking
    // for it inside the loop re-scans all 512 chairs and re-runs expiry on each
    // of them, which measured 383 ms of blocked event loop for a crowd of 450.
    // A round starting while the room is frozen for a third of a second is a
    // room that drops its first number.
    const free = this.seats.freeSeats(now);
    // Guests take the back tables first, leaving the good seats for players.
    let next = free.length - 1;
    for (let index = 0; index < crowd.npcCount; index += 1) {
      const id = this.npcId(index);
      if (this.seats.seatFor(id)) continue;
      while (next >= 0 && !free[next]) next -= 1;
      const target = free[next];
      if (!target) return;
      next -= 1;
      this.seats.claim(target, id, this.npcName(index), 'NPC', now);
    }
  }

  /** The index inside `npc-<round>-<index>`, or null if it is not ours. */
  private npcIndexOf(occupantId: string): number | null {
    const prefix = `npc-${this.round}-`;
    if (!occupantId.startsWith(prefix)) return null;
    const parsed = Number(occupantId.slice(prefix.length));
    return Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : null;
  }

  private sendSnapshot(client: Client): void {
    const participant = this.participants.get(client.sessionId);
    if (participant) client.send(BINGO_SERVER_MESSAGES.snapshot, this.snapshotFor(participant));
  }

  private sendAllSnapshots(): void {
    for (const client of this.clients) this.sendSnapshot(client);
  }

  private reject(client: Client, action: ActionName, reason: BingoActionRejectedPayload['reason'], requestId?: string): void {
    client.send(BINGO_SERVER_MESSAGES.actionRejected, { action, reason, ...(requestId ? { requestId } : {}) } satisfies BingoActionRejectedPayload);
  }

  override async onDispose(): Promise<void> {
    this.disposing = true;
    await Promise.allSettled([...this.pendingPurchases]);
    if (this.pendingCancellation) await this.pendingCancellation;
    while (this.settling) await new Promise<void>((resolve) => this.settlementWaiters.push(resolve));
    if (this.roundInitialized && !this.roundPersistedFinished) {
      try {
        await this.roundInitialized;
        if (this.phases.phase === 'RESULTS') {
          // Leaving during the result animation cannot refund a completed game.
          await this.retryPayouts();
          await finishBingoRound(this.roundId);
          this.roundPersistedFinished = true;
        } else {
          await cancelBingoRound(this.roundId);
        }
      } catch (error) {
        // The durable active round is recovered by the startup recovery worker.
        this.logError('Bingo interrupted round recovery deferred', error);
      }
    }
  }

  private async purchaseCards(client: Client, request: PurchaseRequest): Promise<void> {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    const reject = (reason: BingoActionRejectedPayload['reason']) => this.reject(client, 'purchaseCards', reason, request.requestId);
    if (this.cancellingRound || this.disposing) return reject('round_cancelling');
    if (request.roundId && request.roundId !== this.roundId) return reject('round_changed');
    const unresolved = this.purchaseAttempts.get(participant.userId);
    if (unresolved) {
      if (unresolved.request.requestId !== request.requestId || unresolved.request.quantity !== request.quantity || unresolved.request.markingMode !== request.markingMode || unresolved.retrying) {
        return reject('purchase_in_progress');
      }
      // A retry resolves the original operation; it never creates another debit.
      return this.performPurchase(unresolved);
    }
    if (participant.cards.length > 0) {
      if (participant.purchaseRequestId === request.requestId && participant.cards.length === request.quantity && participant.markingMode === request.markingMode) {
        this.confirmPurchase(client, participant, request.requestId);
        this.sendSnapshot(client);
        return;
      }
      return reject('already_purchased');
    }
    if (this.phases.phase !== 'CARD_PURCHASE') return reject('wrong_phase');
    if (participant.purchaseInProgress) return reject('purchase_in_progress');

    const limit = request.markingMode === 'MANUAL' ? this.config.maxManualCards : this.config.maxAutomaticCards;
    if (request.quantity > limit) return reject('invalid_payload');

    participant.purchaseInProgress = true;
    this.economicsLocked = true;
    this.sendAllSnapshots();
    let cards: ItalianBingoCard[];
    try {
      // Generate and reserve before any debit. A generation failure cannot cost credits.
      cards = this.issueCards(participant, request.quantity, request.requestId);
    } catch (error) {
      participant.purchaseInProgress = false;
      this.logError('Bingo card generation failed', error);
      reject('purchase_failed');
      this.sendAllSnapshots();
      return;
    }
    const attempt: PurchaseAttempt = { participant, request: { ...request }, gameId: this.roundId, cards, limit, retrying: false, retryAt: 0 };
    this.purchaseAttempts.set(participant.userId, attempt);
    await this.performPurchase(attempt);
  }

  private async performPurchase(attempt: PurchaseAttempt): Promise<void> {
    if (attempt.retrying) return;
    attempt.retrying = true;
    const { participant, request, gameId, cards, limit } = attempt;
    const reject = (reason: BingoActionRejectedPayload['reason']) => {
      const client = this.clients.find((candidate) => candidate.sessionId === participant.sessionId);
      if (client) this.reject(client, 'purchaseCards', reason, request.requestId);
    };
    let resolved = false;
    try {
      if (!this.roundInitialized) {
        this.roundInitialized = ensureBingoRound({ gameId, roomCode: this.roomCode, configSnapshot: this.config,
          seedHash: createHash('sha256').update(this.seed).digest('hex') }).then(() => undefined)
          .catch((error: unknown) => { this.roundInitialized = null; throw error; });
      }
      await this.roundInitialized;
      const entry = await purchaseBingoCards({
        gameId,
        userId: participant.userId,
        requestId: request.requestId,
        cards,
        cardPrice: this.config.cardPrice,
        maxCards: limit,
        markingMode: request.markingMode,
      });
      participant.balance = entry.balance;
      participant.markingMode = request.markingMode;
      participant.cards = entry.cards;
      participant.purchaseRequestId = request.requestId;
      participant.purchaseId = entry.purchaseId;
      participant.ready = false;
      resolved = true;
      // Database totals also repair an uncertain previous response without counting twice.
      this.potCredits = Math.max(this.potCredits, entry.potCredits);
      this.cardsSold = Math.max(this.cardsSold, entry.cardsSold);
      const currentClient = this.clients.find((candidate) => candidate.sessionId === participant.sessionId);
      if (currentClient) this.confirmPurchase(currentClient, participant, request.requestId);
    } catch (error) {
      // A lost DB response is not proof of rollback. Recover the committed purchase
      // before inviting another attempt, including the original cards and request ID.
      // Insufficient funds is an explicit transaction rejection, never a lost
      // commit: do not retry that purchase later after the player adds credits.
      if (isAppError(error) && error.code === 'insufficient_funds') resolved = true;
      try {
        const saved = await loadBingoPurchase(gameId, participant.userId);
        if (saved) {
          this.restoreSavedPurchase(participant, saved);
          resolved = true;
          const currentClient = this.clients.find((candidate) => candidate.sessionId === participant.sessionId);
          if (currentClient && saved.requestId === request.requestId && saved.quantity === request.quantity && saved.markingMode === request.markingMode) {
            this.confirmPurchase(currentClient, participant, request.requestId);
          } else if (currentClient) {
            this.reject(currentClient, 'purchaseCards', 'already_purchased', request.requestId);
          }
          return;
        }
        // An application rejection plus a successful empty lookup proves that
        // this request did not buy cards. Transport failures remain uncertain.
        resolved = isAppError(error);
      } catch (recoveryError) {
        this.logError('Bingo purchase response recovery deferred', recoveryError);
      }
      if (isAppError(error) && error.code === 'insufficient_funds') {
        reject('insufficient_credits');
      } else {
        this.logError('Bingo card purchase failed', error);
        reject('purchase_failed');
      }
    } finally {
      attempt.retrying = false;
      if (resolved) {
        this.purchaseAttempts.delete(participant.userId);
        if (!participant.cards.length) cards.forEach((card) => this.issuedSignatures.delete(cardSignature(card)));
      } else {
        attempt.retryAt = Date.now() + PAYOUT_RETRY_MS;
      }
      participant.purchaseInProgress = !resolved;
      this.sendAllSnapshots();
      this.evaluateAutomaticStart();
    }
  }

  private retryUncertainPurchases(now: number): void {
    for (const attempt of this.purchaseAttempts.values()) {
      if (attempt.retrying || now < attempt.retryAt) continue;
      const retry = this.performPurchase(attempt);
      this.pendingPurchases.add(retry);
      void retry.finally(() => this.pendingPurchases.delete(retry));
    }
  }

  private confirmPurchase(client: Client, participant: BingoParticipant, requestId: string): void {
    client.send(BINGO_SERVER_MESSAGES.purchaseConfirmed, {
      requestId, roundId: this.roundId, purchaseId: participant.purchaseId ?? '',
      quantity: participant.cards.length, totalCredits: participant.cards.length * this.config.cardPrice,
      balance: participant.balance,
    } satisfies BingoPurchaseConfirmedPayload);
  }

  private restoreSavedPurchase(participant: BingoParticipant, saved: NonNullable<Awaited<ReturnType<typeof loadBingoPurchase>>>): void {
    participant.cards = saved.cards;
    participant.markingMode = saved.markingMode;
    participant.purchaseId = saved.id;
    participant.purchaseRequestId = saved.requestId;
    participant.balance = saved.balance;
    this.cardsSold = Math.max(this.cardsSold, saved.cardsSold);
    this.potCredits = Math.max(this.potCredits, saved.potCredits);
    saved.cards.forEach((card) => this.issuedSignatures.add(cardSignature(card)));
  }

  private async restorePurchaseOnJoin(participant: BingoParticipant): Promise<void> {
    try {
      const saved = await loadBingoPurchase(this.roundId, participant.userId);
      if (saved) this.restoreSavedPurchase(participant, saved);
    } catch (error) {
      this.logError('Bingo reconnect purchase recovery deferred', error);
    } finally {
      participant.loading = Boolean(participant.preparing);
      participant.purchaseInProgress = false;
      this.sendAllSnapshots();
      this.evaluateAutomaticStart();
    }
  }

  private issueCards(participant: BingoParticipant, quantity: number, requestId: string): ItalianBingoCard[] {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const cards = createPurchaseCards(quantity, `${this.seed}:${participant.userId}:${requestId}:${attempt}`, `${this.roundId}-${participant.userId}`);
      if (cards.every((card) => !this.issuedSignatures.has(cardSignature(card)))) {
        cards.forEach((card) => this.issuedSignatures.add(cardSignature(card)));
        return cards;
      }
    }
    throw new Error('Unable to issue globally unique Bingo cards');
  }

  private setReady(client: Client, ready: boolean): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    if (this.phases.phase === 'COUNTDOWN' && !ready && this.countdownParticipants.has(participant.userId)) this.cancelCountdown();
    if (this.phases.phase !== 'CARD_PURCHASE') return this.reject(client, 'setReady', 'wrong_phase');
    if (participant.purchaseInProgress) return this.reject(client, 'setReady', 'purchase_in_progress');
    if (participant.loading && ready) return this.reject(client, 'setReady', 'players_not_ready');
    if (participant.cards.length === 0) return this.reject(client, 'setReady', 'cards_required');
    participant.ready = ready;
    this.automaticStartCancelled = false;
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private updateConfig(client: Client, request: Pick<RoomBingoConfig, 'startMode' | 'countdownSeconds' | 'numberCallInterval' | 'crowdDensity' | 'tier' | 'chaosLevel'> & { training?: boolean }): void {
    if (client.sessionId !== this.hostSessionId) return this.reject(client, 'updateConfig', 'host_only');
    const tier = TIER_DEFAULTS[request.tier];
    const standardEvents = ['distracted-waiter', 'broken-microphone', 'false-bingo'];
    const chaoticEvents = [...standardEvents, 'blackout', 'confetti'];
    const config: RoomBingoConfig = {
      ...this.config,
      ...request,
      training: request.training ?? this.config.training,
      cardPrice: tier.cardPrice,
      numberCallInterval: request.numberCallInterval,
      enabledEvents:
        request.chaosLevel === 'CLASSIC'
          ? []
          : request.chaosLevel === 'LIGHT'
            ? standardEvents
            : request.chaosLevel === 'CHAOTIC'
              ? chaoticEvents
              : [...chaoticEvents, 'zombie-outbreak'],
    };
    if (this.economicsLocked || this.phases.phase !== 'CARD_PURCHASE') {
      this.nextRoundConfig = config;
    } else {
      this.config = config;
      this.preparationEndsAt = config.startMode === 'TIMER' ? Date.now() + config.countdownSeconds * 1_000 : null;
      this.automaticStartCancelled = false;
      this.seatNpcs();
    }
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private requestStart(client: Client): void {
    if (client.sessionId !== this.hostSessionId) return this.reject(client, 'startGame', 'host_only');
    if (this.phases.phase !== 'CARD_PURCHASE') return this.reject(client, 'startGame', 'wrong_phase');
    const blocked = this.startBlocker(false);
    if (blocked) return this.reject(client, 'startGame', blocked);
    this.automaticStartCancelled = false;
    this.beginCountdown();
  }

  private cancelStart(client: Client): void {
    if (client.sessionId !== this.hostSessionId) return this.reject(client, 'cancelStart', 'host_only');
    if (this.phases.phase !== 'COUNTDOWN') return this.reject(client, 'cancelStart', 'wrong_phase');
    this.cancelCountdown();
    this.automaticStartCancelled = true;
    this.sendAllSnapshots();
  }

  private beginCountdown(): void {
    if (this.phases.phase !== 'CARD_PURCHASE') return;
    if (this.startBlocker()) return;
    this.countdownParticipants.clear();
    for (const participant of this.roundParticipants()) this.countdownParticipants.add(participant.userId);
    this.phases.transition('COUNTDOWN');
    this.countdownEndsAt = Date.now() + (this.config.startMode === 'TIMER' ? 5_000 : this.config.countdownSeconds * 1_000);
    this.sendAllSnapshots();
  }

  private cancelCountdown(): void {
    if (this.phases.phase !== 'COUNTDOWN') return;
    this.phases.transition('CARD_PURCHASE');
    this.countdownEndsAt = null;
    this.countdownParticipants.clear();
    this.sendAllSnapshots();
  }

  private evaluateAutomaticStart(): void {
    if (this.phases.phase !== 'CARD_PURCHASE') return;
    if (this.config.startMode !== 'HOST' && !this.startBlocker()) this.beginCountdown();
  }

  private setPreparing(client: Client, preparing: boolean): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    participant.preparing = preparing;
    participant.loading = preparing;
    if (preparing && (this.phases.phase === 'CARD_PURCHASE' || this.phases.phase === 'COUNTDOWN')) {
      participant.ready = false;
      if (this.countdownParticipants.has(participant.userId)) this.cancelCountdown();
    }
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private async cancelPurchasedRound(client: Client): Promise<void> {
    if (client.sessionId !== this.hostSessionId) return this.reject(client, 'cancelRound', 'host_only');
    if (this.phases.phase !== 'CARD_PURCHASE' && this.phases.phase !== 'COUNTDOWN') return this.reject(client, 'cancelRound', 'wrong_phase');
    if (this.cancellingRound) return;
    if ([...this.participants.values()].some((participant) => participant.purchaseInProgress)) return this.reject(client, 'cancelRound', 'purchase_in_progress');
    this.cancellingRound = true;
    this.sendAllSnapshots();
    await this.retryCancellation();
  }

  private retryCancellation(): Promise<void> {
    if (this.pendingCancellation) return this.pendingCancellation;
    const pending = this.completeCancellation().finally(() => {
      this.pendingCancellation = null;
    });
    this.pendingCancellation = pending;
    return pending;
  }

  private async completeCancellation(): Promise<void> {
    try {
      if (this.roundInitialized) {
        await this.roundInitialized;
        await cancelBingoRound(this.roundId);
      }
      this.roundPersistedFinished = true;
      this.phases.transition('ENDED');
      this.phaseEndsAt = Date.now() + ENDED_DURATION_MS;
      this.countdownEndsAt = null;
      for (const participant of this.participants.values()) {
        if (participant.cards.length) {
          try { participant.balance = (await getWalletState(db, participant.userId)).balance; }
          catch (error) { this.logError('Bingo refunded balance refresh pending', error); }
        }
      }
      this.broadcast(BINGO_SERVER_MESSAGES.roundCancelled, { roundId: this.roundId, round: this.round });
      this.cancellingRound = false;
    } catch (error) {
      this.logError('Bingo cancellation failed', error);
      // A rejected COMMIT response may still mean that refunds were committed.
      // Keep the room frozen and resolve the same UUID idempotently before play.
      this.nextCancellationAt = Date.now() + PAYOUT_RETRY_MS;
      const host = this.clients.find((candidate) => candidate.sessionId === this.hostSessionId);
      if (host) this.reject(host, 'cancelRound', 'round_cancelling');
    } finally {
      this.sendAllSnapshots();
    }
  }

  private roundParticipants(): BingoParticipant[] {
    return [...this.participants.values()].filter((participant) => participant.cards.length > 0);
  }

  private startBlocker(checkCancellation = true): BingoActionRejectedPayload['reason'] | null {
    if (this.cancellingRound || this.disposing) return 'round_cancelling';
    if (checkCancellation && this.automaticStartCancelled) return 'start_cancelled';
    if ([...this.participants.values()].some((participant) => participant.purchaseInProgress)) return 'purchase_in_progress';
    const players = this.roundParticipants();
    if (players.length < (this.config.training ? 1 : this.config.minPlayers)) return 'minimum_players';
    if (players.some((participant) => !participant.connected || participant.loading)) return 'players_disconnected';
    if (this.config.startMode === 'ALL_READY' && players.some((participant) => !participant.ready)) return 'players_not_ready';
    if (this.config.startMode === 'TIMER' && this.preparationEndsAt !== null && Date.now() < this.preparationEndsAt) return 'preparation_open';
    return null;
  }

  private tick(): void {
    if (this.disposing) return;
    const now = Date.now();
    if (this.cancellingRound) {
      if (!this.pendingCancellation && now >= this.nextCancellationAt) void this.retryCancellation();
      return;
    }
    this.retryUncertainPurchases(now);
    const reserved = this.seats.reservationSnapshot().length;
    const freed = this.seats.expire(now);
    if (freed.length) this.sendAllSnapshots();
    else if (reserved !== this.seats.reservationSnapshot().length) this.broadcastSeating();
    if (this.activeEvent && now >= this.activeEvent.endsAt) this.finishEvent(now);
    if (this.claimWindow && now >= this.claimWindow.closesAt && now >= this.nextSettlementAt) {
      void this.settleClaimWindow();
      return;
    }
    if (this.results.some((result) => result.status === 'PENDING') && now >= this.nextSettlementAt) void this.retryPayouts();
    if (this.claimWindow) return;
    if (this.phases.phase === 'CARD_PURCHASE') this.evaluateAutomaticStart();
    if (this.phases.phase === 'COUNTDOWN' && this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
      this.startPlaying();
      return;
    }
    if (this.phases.phase === 'PLAYING' && this.nextDrawAt !== null && now >= this.nextDrawAt) {
      if (this.tryStartEvent(now)) return;
      this.drawNumber();
      return;
    }
    if (this.phases.phase === 'RESULTS' && this.phaseEndsAt !== null && now >= this.phaseEndsAt) {
      if (!this.results.some((result) => result.status === 'PENDING')) void this.completeRound(now);
      return;
    }
    if (this.phases.phase === 'ENDED' && this.phaseEndsAt !== null && now >= this.phaseEndsAt) this.prepareNextRound();
  }

  private tryStartEvent(now: number): boolean {
    if (this.claimWindow) return false;
    const event = this.eventDirector.maybeStart({
      now,
      drawIndex: this.drawnNumbers.length,
      chaosLevel: this.config.chaosLevel,
      enabledEvents: this.config.enabledEvents,
      activeEvent: this.activeEvent,
    });
    if (!event) return false;
    this.activeEvent = event;
    this.eventHistory = [event, ...this.eventHistory].slice(0, EVENT_HISTORY_LIMIT);
    const pausesDraw = !BINGO_EVENT_CATALOG.find((definition) => definition.id === event.id)?.allowedDuringDraw;
    if (pausesDraw) {
      this.eventResumeDelayMs = effectiveBingoCallInterval(this.config.numberCallInterval, event);
      this.nextDrawAt = null;
      this.phases.transition('EVENT_ACTIVE', now);
    }
    this.sendAllSnapshots();
    return pausesDraw;
  }

  private finishEvent(now: number): void {
    if (!this.activeEvent) return;
    this.eventDirector.finish(this.activeEvent, now);
    this.activeEvent = null;
    if (this.phases.phase === 'EVENT_ACTIVE') {
      this.phases.transition('PLAYING', now);
      this.nextDrawAt = now + Math.max(750, this.eventResumeDelayMs);
    }
    this.eventResumeDelayMs = 0;
    this.sendAllSnapshots();
  }

  private startPlaying(): void {
    if (this.phases.phase !== 'COUNTDOWN') return;
    if (this.startBlocker() || this.roundParticipants().some((participant) => !this.countdownParticipants.has(participant.userId))) {
      this.cancelCountdown();
      return;
    }
    this.phases.transition('PLAYING');
    // Voluntarily leaving an already running game cannot turn its stake into a
    // refund. With no clients, the authoritative draw still reaches its end.
    this.autoDispose = false;
    this.countdownEndsAt = null;
    this.drawPool = createItalianDrawPool(this.seed);
    this.drawnNumbers = [];
    this.currentNumber = null;
    this.activeEvent = null;
    this.eventHistory = [];
    this.eventDirector.reset(this.seed);
    this.nextDrawAt = Date.now() + 1_500;
    this.sendAllSnapshots();
  }

  private drawNumber(): void {
    if (this.phases.phase !== 'PLAYING' || this.claimWindow) return;
    const number = this.drawPool.shift();
    if (number === undefined) return this.finishRound();

    this.currentNumber = number;
    this.drawnNumbers.push(number);
    this.nextDrawAt = Date.now() + effectiveBingoCallInterval(this.config.numberCallInterval, this.activeEvent);
    const drawn = new Set(this.drawnNumbers);
    for (const participant of this.participants.values()) {
      if (participant.markingMode === 'AUTOMATIC') {
        participant.cards = participant.cards.map((card) => autoMarkCalledNumbers(card, drawn));
      }
    }

    const payload: BingoBallCalledPayload = {
      round: this.round,
      number,
      drawnNumbers: [...this.drawnNumbers],
      nextDrawAt: this.nextDrawAt,
      subtitle: `Numero ${number}`,
    };
    this.broadcast(BINGO_SERVER_MESSAGES.ballCalled, payload);
    this.sendAllSnapshots();
  }

  private markCell(client: Client, request: { round: number; roundId?: string; cardIndex: number; cellIndex: number; marked: boolean }): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    if ((this.phases.phase !== 'PLAYING' && this.phases.phase !== 'EVENT_ACTIVE') || request.round !== this.round || (request.roundId && request.roundId !== this.roundId)) {
      return this.reject(client, 'markCell', 'wrong_phase');
    }
    if (participant.markingMode !== 'MANUAL') return this.reject(client, 'markCell', 'manual_marking_only');
    const card = participant.cards[request.cardIndex];
    if (!card || card.cells[request.cellIndex] == null) return this.reject(client, 'markCell', 'invalid_cell');
    const marks = new Set(card.markedIndices);
    if (request.marked) marks.add(request.cellIndex);
    else marks.delete(request.cellIndex);
    card.markedIndices = [...marks].sort((left, right) => left - right);
    this.sendSnapshot(client);
  }

  private async handleClaim(client: Client, request: { round: number; roundId?: string; tier: BingoClaimTier; cardIndex: number; requestId: string }): Promise<void> {
    const reject = (reason: BingoClaimRejectedPayload['reason']) => {
      client.send(BINGO_SERVER_MESSAGES.claimRejected, { round: this.round, tier: request.tier, reason } satisfies BingoClaimRejectedPayload);
    };
    if (request.round !== this.round || (request.roundId && request.roundId !== this.roundId)) return reject('round_changed');
    if (this.phases.phase === 'EVENT_ACTIVE') return reject('event_paused');
    if (this.phases.phase !== 'PLAYING') return reject('wrong_phase');
    if (this.awardedTiers.has(request.tier)) return reject('already_awarded');
    if (this.claimWindow && (this.claimWindow.tier !== request.tier || Date.now() >= this.claimWindow.closesAt)) return reject('claim_window_closed');

    const participant = this.participants.get(client.sessionId);
    const card = participant?.cards[request.cardIndex];
    if (!participant || !card) return reject('invalid_card');
    const drawn = new Set(this.drawnNumbers);
    const winningNumbers = request.tier === 'CINQUINA' ? findCinquinaNumbers(card, drawn) : findBingoNumbers(card, drawn);
    if (!winningNumbers) return reject('incomplete_result');

    if (!this.claimWindow) {
      this.claimWindow = { tier: request.tier, drawIndex: this.drawnNumbers.length,
        closesAt: Date.now() + CLAIM_WINDOW_MS, claims: new Map() };
      this.nextDrawAt = null;
    }
    // A card can share a tier once, regardless of repeated request IDs or reconnects.
    this.claimWindow.claims.set(card.id, { participant, card, winningNumbers });
    this.sendAllSnapshots();
  }

  private async settleClaimWindow(): Promise<void> {
    const window = this.claimWindow;
    if (!window || this.settling || Date.now() < window.closesAt) return;
    this.settling = true;
    const claims = [...window.claims.values()].sort((a, b) => a.card.id.localeCompare(b.card.id, 'en'));
    const prize = this.prizeBreakdown().perTier[window.tier];
    const share = Math.floor(prize / claims.length);
    const remainder = prize % claims.length;
    const awards = claims.map((claim, index) => ({
      userId: claim.participant.userId, cardId: claim.card.id, amount: share + (index < remainder ? 1 : 0),
      metadata: { round: this.round, roundId: this.roundId, displayName: claim.participant.displayName, winningNumbers: claim.winningNumbers },
    }));
    try {
      const queued = await queueBingoAwards({ gameId: this.roundId, tier: window.tier, drawIndex: window.drawIndex, awards });
      // Do not consume the tier until the entire group is durably recoverable.
      this.awardedTiers.add(window.tier);
      claims.forEach((claim, index) => {
        const award = queued.find((entry) => entry.cardId === claim.card.id);
        if (!award) throw new Error('Missing persisted Bingo award');
        this.awardIds.set(claim.card.id + ':' + window.tier, award.id);
        this.results.push({
          resultId: award.id, roundId: this.roundId, round: this.round, tier: window.tier,
          sessionId: claim.participant.sessionId, displayName: claim.participant.displayName,
          cardIndex: claim.card.index, winningNumbers: [...claim.winningNumbers],
          prizeCredits: awards[index]!.amount, drawIndex: window.drawIndex,
          status: 'PENDING', sharedWith: claims.length,
        });
      });
      this.claimWindow = null;
      this.nextDrawAt = Date.now() + this.config.numberCallInterval;
      if (window.tier === 'BINGO') this.finishRound();
      this.sendAllSnapshots();
    } catch (error) {
      this.logError('Bingo award group persistence pending', error);
      this.nextSettlementAt = Date.now() + PAYOUT_RETRY_MS;
    } finally {
      this.settling = false;
      this.settlementWaiters.splice(0).forEach((resolve) => resolve());
    }
    if (!this.claimWindow) await this.retryPayouts();
  }

  private async retryPayouts(): Promise<void> {
    if (this.settling) return;
    this.settling = true;
    this.nextSettlementAt = Date.now() + PAYOUT_RETRY_MS;
    try {
      for (const result of this.results.filter((entry) => entry.status === 'PENDING')) {
        try {
          const entry = await settleBingoAward(result.resultId);
          if (!entry.paid) continue;
          result.status = 'PAID';
          this.paidCredits += result.prizeCredits;
          const participant = [...this.participants.values()].find((candidate) => candidate.cards.some((card) => this.awardIds.get(card.id + ':' + result.tier) === result.resultId));
          if (participant) {
            participant.balance = entry.balance;
            result.sessionId = participant.sessionId;
          }
          this.broadcast(BINGO_SERVER_MESSAGES.winner, { ...result } satisfies BingoWinnerPayload);
        } catch (error) {
          this.logError('Bingo prize credit pending, will retry', error);
        }
      }
      if (this.phases.phase === 'RESULTS' && this.roundInitialized && this.results.every((result) => result.status === 'PAID')) {
        try {
          await finishBingoRound(this.roundId);
          this.roundPersistedFinished = true;
        } catch (error) {
          this.logError('Bingo paid round persistence pending', error);
        }
      }
    } finally {
      this.settling = false;
      this.settlementWaiters.splice(0).forEach((resolve) => resolve());
      this.sendAllSnapshots();
    }
  }

  private async completeRound(now: number): Promise<void> {
    if (this.finishingRound || this.phases.phase !== 'RESULTS') return;
    this.finishingRound = true;
    try {
      if (this.roundInitialized) await finishBingoRound(this.roundId);
      this.roundPersistedFinished = true;
      this.phases.transition('ENDED');
      this.autoDispose = true;
      this.phaseEndsAt = now + ENDED_DURATION_MS;
      this.sendAllSnapshots();
    } catch (error) {
      this.logError('Bingo round completion pending', error);
      this.phaseEndsAt = Date.now() + PAYOUT_RETRY_MS;
    } finally {
      this.finishingRound = false;
    }
  }

  private finishRound(): void {
    if (this.phases.phase !== 'PLAYING' && this.phases.phase !== 'EVENT_ACTIVE') return;
    this.activeEvent = null;
    this.phases.transition('RESULTS');
    this.nextDrawAt = null;
    this.phaseEndsAt = Date.now() + RESULTS_DURATION_MS;
    this.sendAllSnapshots();
  }

  private prepareNextRound(): void {
    if (this.phases.phase !== 'ENDED') return;
    if (this.cancellingRound || this.pendingPurchases.size > 0 || this.results.some((result) => result.status === 'PENDING')) return;
    this.phases.transition('CARD_PURCHASE');
    this.round += 1;
    this.roundId = randomUUID();
    this.roundInitialized = null;
    this.roundPersistedFinished = false;
    this.economicsLocked = false;
    if (this.nextRoundConfig) this.config = this.nextRoundConfig;
    this.nextRoundConfig = null;
    this.preparationEndsAt = this.config.startMode === 'TIMER' ? Date.now() + this.config.countdownSeconds * 1_000 : null;
    this.automaticStartCancelled = false;
    this.countdownParticipants.clear();
    this.claimWindow = null;
    this.results = [];
    this.awardIds.clear();
    this.seed = randomUUID();
    this.eventDirector.reset(this.seed);
    this.activeEvent = null;
    this.eventHistory = [];
    this.eventResumeDelayMs = 0;
    this.drawPool = [];
    this.drawnNumbers = [];
    this.currentNumber = null;
    this.countdownEndsAt = null;
    this.nextDrawAt = null;
    this.phaseEndsAt = null;
    this.potCredits = 0;
    this.cardsSold = 0;
    this.paidCredits = 0;
    this.awardedTiers.clear();
    this.issuedSignatures.clear();
    for (const participant of this.participants.values()) {
      participant.cards = [];
      participant.ready = false;
      participant.purchaseInProgress = false;
      delete participant.purchaseRequestId;
      delete participant.purchaseId;
      if (!participant.connected) {
        this.participants.delete(participant.sessionId);
        this.byUser.delete(participant.userId);
      }
    }
    this.seatNpcs();
    this.sendAllSnapshots();
  }

  private reassignHost(): void {
    const next = [...this.participants.values()].find((participant) => participant.connected);
    this.hostSessionId = next?.sessionId ?? '';
    for (const participant of this.participants.values()) participant.isHost = participant.sessionId === this.hostSessionId;
  }

  private logError(message: string, error: unknown): void {
    console.error(message, sanitizeError(error));
  }
}
