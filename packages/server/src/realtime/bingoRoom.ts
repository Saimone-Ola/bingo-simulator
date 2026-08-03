import { createHash, randomUUID } from 'node:crypto';
import { Room, ServerError, type Client } from 'colyseus';
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_SERVER_MESSAGES,
  bingoClaimSchema,
  bingoConfigSchema,
  bingoEmptySchema,
  bingoMarkSchema,
  bingoPingSchema,
  bingoPurchaseSchema,
  bingoReadySchema,
  normaliseBingoRoomCode,
  type AvatarAppearance,
  type BingoActionRejectedPayload,
  type BingoBallCalledPayload,
  type BingoClaimRejectedPayload,
  type BingoClaimTier,
  type BingoMarkingMode,
  type BingoPlayerSummary,
  type BingoPongPayload,
  type BingoRoomTier,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type ItalianBingoCard,
  type RoomBingoConfig,
  type UserRole,
} from '@bingo/shared';
import { verifyAccessToken } from '../auth/tokens';
import { db } from '../db/client';
import { isAppError } from '../errors';
import { sanitizeError } from '../logging';
import { getWalletState, postLedgerEntryAtomic } from '../services/ledger';
import { loadPlayerProfile, type PlayerProfile } from '../services/players';
import {
  autoMarkCalledNumbers,
  cardSignature,
  createItalianDrawPool,
  createUniqueItalianCards,
  findBingoNumbers,
  findCinquinaNumbers,
} from './bingoRules';
import { LobbyStateMachine } from './lobbyStateMachine';

const RECONNECT_SECONDS = 60;
const RESULTS_DURATION_MS = 7_000;
const ENDED_DURATION_MS = 2_500;

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
  balance: number;
  cards: ItalianBingoCard[];
  purchaseInProgress: boolean;
}

export class BingoRoom extends Room {
  override maxClients = 20;

  private roomCode = 'TESI-2026';
  private readonly displayRoomName = 'Sala Tesi — Bingo Italiano';
  private readonly phases = new LobbyStateMachine();
  private readonly participants = new Map<string, BingoParticipant>();
  private readonly byUser = new Map<string, string>();
  private readonly issuedSignatures = new Set<string>();
  private hostSessionId = '';
  private round = 1;
  private seed = randomUUID();
  private drawPool: number[] = [];
  private drawnNumbers: number[] = [];
  private currentNumber: number | null = null;
  private countdownEndsAt: number | null = null;
  private nextDrawAt: number | null = null;
  private phaseEndsAt: number | null = null;
  private potCredits = 0;
  private paidCredits = 0;
  private readonly awardedTiers = new Set<BingoClaimTier>();

  private config: RoomBingoConfig = {
    minPlayers: 2,
    maxPlayers: 20,
    startMode: 'ALL_READY',
    countdownSeconds: 10,
    cardPrice: TIER_DEFAULTS.STANDARD.cardPrice,
    maxManualCards: 3,
    maxAutomaticCards: 6,
    numberCallInterval: TIER_DEFAULTS.STANDARD.numberCallInterval,
    enabledEvents: [],
    npcCount: 1,
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
      void this.purchaseCards(client, parsed.data);
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
      preserved ??
      {
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
        balance: auth.balance,
        cards: [],
        purchaseInProgress: false,
      };

    if (preserved) {
      // Keep the same object identity while an async purchase/claim is in flight.
      // Otherwise its database result would update an orphaned participant.
      preserved.sessionId = client.sessionId;
      preserved.connected = true;
      preserved.loading = false;
    }

    if (previousSession === this.hostSessionId) this.hostSessionId = client.sessionId;
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    participant.isHost = participant.sessionId === this.hostSessionId;
    this.participants.set(client.sessionId, participant);
    this.byUser.set(auth.userId, client.sessionId);

    if (this.phases.phase === 'WAITING') this.phases.transition('CARD_PURCHASE');
    if (this.phases.phase === 'COUNTDOWN' && !preserved) this.cancelCountdown();
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  override async onDrop(client: Client): Promise<void> {
    const participant = this.participants.get(client.sessionId);
    if (participant) {
      participant.connected = false;
      participant.loading = true;
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
    participant.loading = false;
    this.sendAllSnapshots();
  }

  override onLeave(client: Client): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    this.participants.delete(client.sessionId);
    if (this.byUser.get(participant.userId) === client.sessionId) {
      this.byUser.delete(participant.userId);
    }

    if (client.sessionId === this.hostSessionId) this.reassignHost();
    if (this.phases.phase === 'COUNTDOWN') this.cancelCountdown();
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private summaries(): BingoPlayerSummary[] {
    const humans = [...this.participants.values()].map((participant) => ({
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

    const npcs: BingoPlayerSummary[] = Array.from(
      { length: this.config.npcCount },
      (_value, index) => ({
        sessionId: `npc-${index + 1}`,
        userId: `npc-${index + 1}`,
        displayName: NPC_NAMES[index] ?? `Ospite ${index + 1}`,
        level: 1 + index * 2,
        ready: true,
        cardCount: 1,
        markingMode: 'AUTOMATIC',
        appearance: NPC_APPEARANCES[index] ?? NPC_APPEARANCES[0]!,
        isHost: false,
        isNpc: true,
        connected: true,
        loading: false,
        balance: 0,
      }),
    );
    return [...humans, ...npcs];
  }

  private snapshotFor(participant: BingoParticipant): BingoSnapshotPayload {
    return {
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
      seedHash: createHash('sha256').update(this.seed).digest('hex').slice(0, 12),
      awardedTiers: [...this.awardedTiers],
    };
  }

  private sendSnapshot(client: Client): void {
    const participant = this.participants.get(client.sessionId);
    if (participant) client.send(BINGO_SERVER_MESSAGES.snapshot, this.snapshotFor(participant));
  }

  private sendAllSnapshots(): void {
    for (const client of this.clients) this.sendSnapshot(client);
  }

  private reject(
    client: Client,
    action: ActionName,
    reason: BingoActionRejectedPayload['reason'],
  ): void {
    const payload: BingoActionRejectedPayload = { action, reason };
    client.send(BINGO_SERVER_MESSAGES.actionRejected, payload);
  }

  private async purchaseCards(
    client: Client,
    request: { quantity: number; markingMode: BingoMarkingMode; requestId: string },
  ): Promise<void> {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    if (this.phases.phase !== 'CARD_PURCHASE') {
      return this.reject(client, 'purchaseCards', 'wrong_phase');
    }
    if (participant.cards.length > 0) {
      return this.reject(client, 'purchaseCards', 'already_purchased');
    }
    if (participant.purchaseInProgress) {
      return this.reject(client, 'purchaseCards', 'purchase_in_progress');
    }

    const limit =
      request.markingMode === 'MANUAL'
        ? this.config.maxManualCards
        : this.config.maxAutomaticCards;
    if (request.quantity > limit) {
      return this.reject(client, 'purchaseCards', 'invalid_payload');
    }

    participant.purchaseInProgress = true;
    const total = request.quantity * this.config.cardPrice;
    try {
      const entry = await postLedgerEntryAtomic({
        userId: participant.userId,
        amount: -total,
        reason: 'bingo_card_purchase',
        idempotencyKey: `bingo:${this.roomCode}:${this.round}:${participant.userId}:purchase:${request.requestId}`,
        metadata: {
          roomCode: this.roomCode,
          round: this.round,
          quantity: request.quantity,
          markingMode: request.markingMode,
          tier: this.config.tier,
        },
      });

      participant.balance = entry.balanceAfter;
      participant.markingMode = request.markingMode;
      participant.cards = this.issueCards(participant, request.quantity, request.requestId);
      participant.ready = false;
      if (!entry.replayed) this.potCredits += total;
    } catch (error) {
      if (isAppError(error) && error.code === 'insufficient_funds') {
        this.reject(client, 'purchaseCards', 'insufficient_credits');
      } else {
        this.logError('Bingo card purchase failed', error);
        this.reject(client, 'purchaseCards', 'invalid_payload');
      }
    } finally {
      participant.purchaseInProgress = false;
      this.sendAllSnapshots();
      this.evaluateAutomaticStart();
    }
  }

  private issueCards(
    participant: BingoParticipant,
    quantity: number,
    requestId: string,
  ): ItalianBingoCard[] {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const cards = createUniqueItalianCards(
        quantity,
        `${this.seed}:${participant.userId}:${requestId}:${attempt}`,
        `${this.round}-${participant.userId.slice(0, 8)}`,
      );
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
    if (this.phases.phase !== 'CARD_PURCHASE') {
      return this.reject(client, 'setReady', 'wrong_phase');
    }
    if (participant.cards.length === 0) {
      return this.reject(client, 'setReady', 'cards_required');
    }
    participant.ready = ready;
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private updateConfig(
    client: Client,
    request: {
      startMode: RoomBingoConfig['startMode'];
      countdownSeconds: number;
      numberCallInterval: number;
      npcCount: number;
      tier: RoomBingoConfig['tier'];
      chaosLevel: RoomBingoConfig['chaosLevel'];
    },
  ): void {
    if (client.sessionId !== this.hostSessionId) {
      return this.reject(client, 'updateConfig', 'host_only');
    }
    if (this.phases.phase !== 'CARD_PURCHASE') {
      return this.reject(client, 'updateConfig', 'configuration_locked');
    }
    const tier = TIER_DEFAULTS[request.tier];
    this.config = {
      ...this.config,
      ...request,
      cardPrice: tier.cardPrice,
      numberCallInterval: request.numberCallInterval,
      enabledEvents:
        request.chaosLevel === 'CLASSIC'
          ? []
          : ['distracted-waiter', 'broken-microphone', 'blackout', 'false-bingo', 'confetti'],
    };
    this.sendAllSnapshots();
    this.evaluateAutomaticStart();
  }

  private requestStart(client: Client): void {
    if (client.sessionId !== this.hostSessionId) {
      return this.reject(client, 'startGame', 'host_only');
    }
    if (this.phases.phase !== 'CARD_PURCHASE') {
      return this.reject(client, 'startGame', 'wrong_phase');
    }
    if (!this.hasMinimumPlayers()) {
      return this.reject(client, 'startGame', 'minimum_players');
    }
    if (!this.allHumansHaveCards()) {
      return this.reject(client, 'startGame', 'cards_required');
    }
    this.beginCountdown();
  }

  private cancelStart(client: Client): void {
    if (client.sessionId !== this.hostSessionId) {
      return this.reject(client, 'cancelStart', 'host_only');
    }
    if (this.phases.phase !== 'COUNTDOWN') {
      return this.reject(client, 'cancelStart', 'wrong_phase');
    }
    this.cancelCountdown();
    this.sendAllSnapshots();
  }

  private beginCountdown(): void {
    if (this.phases.phase !== 'CARD_PURCHASE') return;
    this.phases.transition('COUNTDOWN');
    this.countdownEndsAt = Date.now() + this.config.countdownSeconds * 1_000;
    this.sendAllSnapshots();
  }

  private cancelCountdown(): void {
    if (this.phases.phase !== 'COUNTDOWN') return;
    this.phases.transition('CARD_PURCHASE');
    this.countdownEndsAt = null;
    this.sendAllSnapshots();
  }

  private evaluateAutomaticStart(): void {
    if (this.phases.phase !== 'CARD_PURCHASE') return;
    if (!this.hasMinimumPlayers() || !this.allHumansHaveCards()) return;

    if (
      this.config.startMode === 'ALL_READY' &&
      [...this.participants.values()].every((participant) => participant.ready)
    ) {
      this.beginCountdown();
    } else if (this.config.startMode === 'TIMER') {
      this.beginCountdown();
    }
  }

  private hasMinimumPlayers(): boolean {
    return this.participants.size + this.config.npcCount >= this.config.minPlayers;
  }

  private allHumansHaveCards(): boolean {
    return (
      this.participants.size > 0 &&
      [...this.participants.values()].every((participant) => participant.cards.length > 0)
    );
  }

  private tick(): void {
    const now = Date.now();
    if (
      this.phases.phase === 'COUNTDOWN' &&
      this.countdownEndsAt !== null &&
      now >= this.countdownEndsAt
    ) {
      this.startPlaying();
      return;
    }
    if (
      this.phases.phase === 'PLAYING' &&
      this.nextDrawAt !== null &&
      now >= this.nextDrawAt
    ) {
      this.drawNumber();
      return;
    }
    if (
      this.phases.phase === 'RESULTS' &&
      this.phaseEndsAt !== null &&
      now >= this.phaseEndsAt
    ) {
      this.phases.transition('ENDED');
      this.phaseEndsAt = now + ENDED_DURATION_MS;
      this.sendAllSnapshots();
      return;
    }
    if (
      this.phases.phase === 'ENDED' &&
      this.phaseEndsAt !== null &&
      now >= this.phaseEndsAt
    ) {
      this.prepareNextRound();
    }
  }

  private startPlaying(): void {
    if (this.phases.phase !== 'COUNTDOWN') return;
    this.phases.transition('PLAYING');
    this.countdownEndsAt = null;
    this.drawPool = createItalianDrawPool(this.seed);
    this.drawnNumbers = [];
    this.currentNumber = null;
    this.nextDrawAt = Date.now() + 1_500;
    this.sendAllSnapshots();
  }

  private drawNumber(): void {
    if (this.phases.phase !== 'PLAYING') return;
    const number = this.drawPool.shift();
    if (number === undefined) {
      this.finishRound();
      return;
    }

    this.currentNumber = number;
    this.drawnNumbers.push(number);
    this.nextDrawAt = Date.now() + this.config.numberCallInterval;
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

  private markCell(
    client: Client,
    request: { round: number; cardIndex: number; cellIndex: number; marked: boolean },
  ): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    if (this.phases.phase !== 'PLAYING' || request.round !== this.round) {
      return this.reject(client, 'markCell', 'wrong_phase');
    }
    if (participant.markingMode !== 'MANUAL') {
      return this.reject(client, 'markCell', 'manual_marking_only');
    }
    const card = participant.cards[request.cardIndex];
    if (!card || card.cells[request.cellIndex] === null) {
      return this.reject(client, 'markCell', 'invalid_cell');
    }

    const marks = new Set(card.markedIndices);
    if (request.marked) marks.add(request.cellIndex);
    else marks.delete(request.cellIndex);
    card.markedIndices = [...marks].sort((left, right) => left - right);
    this.sendSnapshot(client);
  }

  private async handleClaim(
    client: Client,
    request: {
      round: number;
      tier: BingoClaimTier;
      cardIndex: number;
      requestId: string;
    },
  ): Promise<void> {
    const reject = (reason: BingoClaimRejectedPayload['reason']) => {
      const payload: BingoClaimRejectedPayload = {
        round: this.round,
        tier: request.tier,
        reason,
      };
      client.send(BINGO_SERVER_MESSAGES.claimRejected, payload);
    };

    if (request.round !== this.round) return reject('round_changed');
    if (this.phases.phase !== 'PLAYING' && this.phases.phase !== 'EVENT_ACTIVE') {
      return reject('wrong_phase');
    }
    if (this.awardedTiers.has(request.tier)) return reject('already_awarded');

    const participant = this.participants.get(client.sessionId);
    const card = participant?.cards[request.cardIndex];
    if (!participant || !card) return reject('invalid_card');

    const drawn = new Set(this.drawnNumbers);
    const winningNumbers =
      request.tier === 'CINQUINA'
        ? findCinquinaNumbers(card, drawn)
        : findBingoNumbers(card, drawn);
    if (!winningNumbers) return reject('incomplete_result');

    this.awardedTiers.add(request.tier);
    const prizeCredits = await this.awardPrize(participant, request.tier);
    const winner: BingoWinnerPayload = {
      round: this.round,
      tier: request.tier,
      sessionId: participant.sessionId,
      displayName: participant.displayName,
      cardIndex: request.cardIndex,
      winningNumbers,
      prizeCredits,
    };
    this.broadcast(BINGO_SERVER_MESSAGES.winner, winner);

    if (request.tier === 'BINGO') this.finishRound();
    else this.sendAllSnapshots();
  }

  private async awardPrize(
    participant: BingoParticipant,
    tier: BingoClaimTier,
  ): Promise<number> {
    const remaining = Math.max(0, this.potCredits - this.paidCredits);
    const prize =
      tier === 'CINQUINA'
        ? Math.max(1, Math.floor(this.potCredits * 0.25))
        : remaining;
    if (prize <= 0) return 0;

    try {
      const entry = await postLedgerEntryAtomic({
        userId: participant.userId,
        amount: prize,
        reason: 'bingo_prize',
        idempotencyKey: `bingo:${this.roomCode}:${this.round}:${tier}:${participant.userId}`,
        metadata: { roomCode: this.roomCode, round: this.round, tier },
      });
      participant.balance = entry.balanceAfter;
      if (!entry.replayed) this.paidCredits += prize;
      return prize;
    } catch (error) {
      this.logError('Bingo prize payout failed', error);
      return 0;
    }
  }

  private finishRound(): void {
    if (this.phases.phase === 'EVENT_ACTIVE') this.phases.transition('RESULTS');
    else if (this.phases.phase === 'PLAYING') this.phases.transition('RESULTS');
    else return;
    this.nextDrawAt = null;
    this.phaseEndsAt = Date.now() + RESULTS_DURATION_MS;
    this.sendAllSnapshots();
  }

  private prepareNextRound(): void {
    if (this.phases.phase !== 'ENDED') return;
    this.phases.transition('CARD_PURCHASE');
    this.round += 1;
    this.seed = randomUUID();
    this.drawPool = [];
    this.drawnNumbers = [];
    this.currentNumber = null;
    this.countdownEndsAt = null;
    this.nextDrawAt = null;
    this.phaseEndsAt = null;
    this.potCredits = 0;
    this.paidCredits = 0;
    this.awardedTiers.clear();
    this.issuedSignatures.clear();
    for (const participant of this.participants.values()) {
      participant.cards = [];
      participant.ready = false;
      participant.markingMode = 'MANUAL';
      participant.purchaseInProgress = false;
    }
    this.sendAllSnapshots();
  }

  private reassignHost(): void {
    const next = this.participants.values().next().value as BingoParticipant | undefined;
    this.hostSessionId = next?.sessionId ?? '';
    for (const participant of this.participants.values()) {
      participant.isHost = participant.sessionId === this.hostSessionId;
    }
  }

  private logError(message: string, error: unknown): void {
    console.error(message, sanitizeError(error));
  }
}
