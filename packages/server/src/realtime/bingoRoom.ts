import { Room, ServerError, type Client } from 'colyseus';
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_DRAW_INTERVAL_MS,
  BINGO_SERVER_MESSAGES,
  bingoClaimSchema,
  bingoPingSchema,
  normaliseBingoRoomCode,
  type BingoBallCalledPayload,
  type BingoClaimRejectedPayload,
  type BingoPlayerSummary,
  type BingoPongPayload,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type UserRole,
} from '@bingo/shared';
import { verifyAccessToken } from '../auth/tokens';
import { loadPlayerProfile, type PlayerProfile } from '../services/players';
import { createBingoCard, createBingoPool, findWinningNumbers } from './bingoRules';

interface BingoAuth {
  userId: string;
  role: UserRole;
  profile: PlayerProfile;
}

interface BingoParticipant extends BingoPlayerSummary {
  card: number[];
}

/**
 * Shared thesis-demo Bingo hall.
 *
 * Cards, extraction and claim validation live only on the server. The client
 * may highlight cells, but it cannot invent a number or declare itself winner.
 */
export class BingoRoom extends Room {
  override maxClients = 20;

  private roomCode = 'TESI-2026';
  private round = 1;
  private pool: number[] = [];
  private calledBalls: number[] = [];
  private currentBall: number | null = null;
  private nextDrawAt = 0;
  private roundLocked = false;
  private readonly participants = new Map<string, BingoParticipant>();

  override onCreate(options: unknown): void {
    const requested =
      typeof options === 'object' && options !== null
        ? (options as { roomCode?: unknown }).roomCode
        : undefined;
    this.roomCode = normaliseBingoRoomCode(requested);
    this.setMetadata({ roomCode: this.roomCode });
    this.resetPool();
    this.nextDrawAt = Date.now() + 1_800;

    this.onMessage(BINGO_CLIENT_MESSAGES.claim, (client, payload: unknown) => {
      const parsed = bingoClaimSchema.safeParse(payload);
      if (!parsed.success) return;
      this.handleClaim(client, parsed.data.round);
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

    // Poll the due time rather than using a 5 s fixed interval: the first draw
    // starts 1.8 s after join, so a fixed interval would drift by more than
    // three seconds and make the visible countdown dishonest.
    this.clock.setInterval(() => this.drawBall(), 250);
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
    const profile = await loadPlayerProfile(claims.sub);
    if (!profile) throw new ServerError(401, 'unauthorized');
    if (profile.status !== 'active') throw new ServerError(403, 'account_suspended');
    return { userId: claims.sub, role: claims.role, profile };
  }

  override onJoin(client: Client): void {
    const auth = client.auth as BingoAuth | undefined;
    if (!auth) {
      client.leave(401);
      return;
    }

    const duplicate = [...this.participants.entries()].find(
      ([, participant]) => participant.userId === auth.userId,
    );
    if (duplicate) {
      const oldClient = this.clients.find((candidate) => candidate.sessionId === duplicate[0]);
      oldClient?.leave(4001);
      this.participants.delete(duplicate[0]);
    }

    this.participants.set(client.sessionId, {
      sessionId: client.sessionId,
      userId: auth.userId,
      displayName: auth.profile.displayName,
      level: auth.profile.level,
      card: createBingoCard(),
    });

    this.sendSnapshot(client);
    this.broadcastPlayers();

    if (this.calledBalls.length === 0 && !this.roundLocked) {
      this.nextDrawAt = Date.now() + 1_800;
      this.clock.setTimeout(() => this.drawBall(), 1_800);
    }
  }

  override onLeave(client: Client): void {
    this.participants.delete(client.sessionId);
    this.broadcastPlayers();
  }

  private summaries(): BingoPlayerSummary[] {
    return [...this.participants.values()].map(
      ({ sessionId, userId, displayName, level }) => ({
        sessionId,
        userId,
        displayName,
        level,
      }),
    );
  }

  private sendSnapshot(client: Client): void {
    const participant = this.participants.get(client.sessionId);
    if (!participant) return;

    const payload: BingoSnapshotPayload = {
      roomCode: this.roomCode,
      round: this.round,
      card: participant.card,
      calledBalls: [...this.calledBalls],
      currentBall: this.currentBall,
      nextDrawAt: this.nextDrawAt,
      drawIntervalMs: BINGO_DRAW_INTERVAL_MS,
      players: this.summaries(),
    };
    client.send(BINGO_SERVER_MESSAGES.snapshot, payload);
  }

  private broadcastPlayers(): void {
    this.broadcast(BINGO_SERVER_MESSAGES.playersChanged, this.summaries());
  }

  private drawBall(): void {
    if (this.clients.length === 0 || this.roundLocked) return;
    if (Date.now() + 100 < this.nextDrawAt) return;

    const ball = this.pool.pop();
    if (ball === undefined) {
      this.startNextRound();
      return;
    }

    this.currentBall = ball;
    this.calledBalls.push(ball);
    this.nextDrawAt = Date.now() + BINGO_DRAW_INTERVAL_MS;

    const payload: BingoBallCalledPayload = {
      round: this.round,
      ball,
      calledBalls: [...this.calledBalls],
      nextDrawAt: this.nextDrawAt,
    };
    this.broadcast(BINGO_SERVER_MESSAGES.ballCalled, payload);
  }

  private handleClaim(client: Client, requestedRound: number): void {
    const reject = (reason: BingoClaimRejectedPayload['reason']) => {
      const payload: BingoClaimRejectedPayload = { round: this.round, reason };
      client.send(BINGO_SERVER_MESSAGES.claimRejected, payload);
    };

    if (requestedRound !== this.round) {
      reject('round_changed');
      return;
    }
    if (this.roundLocked) {
      reject('round_locked');
      return;
    }

    const participant = this.participants.get(client.sessionId);
    if (!participant) return;
    const winningNumbers = findWinningNumbers(participant.card, new Set(this.calledBalls));
    if (!winningNumbers) {
      reject('incomplete_line');
      return;
    }

    this.roundLocked = true;
    const winner: BingoWinnerPayload = {
      round: this.round,
      sessionId: participant.sessionId,
      displayName: participant.displayName,
      winningNumbers,
    };
    this.broadcast(BINGO_SERVER_MESSAGES.winner, winner);
    this.clock.setTimeout(() => this.startNextRound(), 7_000);
  }

  private resetPool(): void {
    this.pool = createBingoPool();
  }

  private startNextRound(): void {
    this.round += 1;
    this.calledBalls = [];
    this.currentBall = null;
    this.roundLocked = false;
    this.resetPool();
    this.nextDrawAt = Date.now() + 2_500;

    for (const participant of this.participants.values()) {
      participant.card = createBingoCard();
    }

    this.broadcast(BINGO_SERVER_MESSAGES.roundReset, {
      round: this.round,
      startsAt: this.nextDrawAt,
    });

    for (const client of this.clients) this.sendSnapshot(client);
  }
}
