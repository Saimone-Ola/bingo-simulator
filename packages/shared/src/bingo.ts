import { z } from 'zod';

export const BINGO_ROOM_CODE_MAX_LENGTH = 18;
export const BINGO_DRAW_INTERVAL_MS = 5_000;
export const BINGO_CARD_SIZE = 25;
export const BINGO_FREE_INDEX = 12;

export const BINGO_CLIENT_MESSAGES = {
  claim: 'bingo_claim',
  ping: 'bingo_ping',
} as const;

export const BINGO_SERVER_MESSAGES = {
  snapshot: 'bingo_snapshot',
  ballCalled: 'bingo_ball_called',
  playersChanged: 'bingo_players_changed',
  winner: 'bingo_winner',
  claimRejected: 'bingo_claim_rejected',
  roundReset: 'bingo_round_reset',
  pong: 'bingo_pong',
} as const;

export const bingoClaimSchema = z.object({ round: z.number().int().positive() }).strict();
export const bingoPingSchema = z.object({ clientTime: z.number() }).strict();

export interface BingoPlayerSummary {
  sessionId: string;
  userId: string;
  displayName: string;
  level: number;
}

export interface BingoSnapshotPayload {
  roomCode: string;
  round: number;
  card: number[];
  calledBalls: number[];
  currentBall: number | null;
  nextDrawAt: number;
  drawIntervalMs: number;
  players: BingoPlayerSummary[];
}

export interface BingoBallCalledPayload {
  round: number;
  ball: number;
  calledBalls: number[];
  nextDrawAt: number;
}

export interface BingoWinnerPayload {
  round: number;
  sessionId: string;
  displayName: string;
  winningNumbers: number[];
}

export interface BingoClaimRejectedPayload {
  round: number;
  reason: 'round_changed' | 'incomplete_line' | 'round_locked';
}

export interface BingoRoundResetPayload {
  round: number;
  startsAt: number;
}

export interface BingoPongPayload {
  clientTime: number;
  serverTime: number;
}

export function bingoLetter(ball: number): 'B' | 'I' | 'N' | 'G' | 'O' {
  if (ball <= 15) return 'B';
  if (ball <= 30) return 'I';
  if (ball <= 45) return 'N';
  if (ball <= 60) return 'G';
  return 'O';
}

export function normaliseBingoRoomCode(value: unknown): string {
  if (typeof value !== 'string') return 'TESI-2026';
  const clean = value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, BINGO_ROOM_CODE_MAX_LENGTH);
  return clean || 'TESI-2026';
}
