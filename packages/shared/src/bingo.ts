import type { AvatarAppearance } from './avatar';
import type { ActiveBingoEvent } from './bingoEvents';
import type { SeatOccupancy, SeatRejectionReason } from './bingoSeating';
import type { PrizeBreakdown } from './prizePool';

import { z } from 'zod';

export const BINGO_ROOM_CODE_MAX_LENGTH = 18;
export const ITALIAN_BINGO_BALL_COUNT = 90;
export const ITALIAN_CARD_ROWS = 3;
export const ITALIAN_CARD_COLUMNS = 9;
export const ITALIAN_CARD_CELL_COUNT = ITALIAN_CARD_ROWS * ITALIAN_CARD_COLUMNS;
export const ITALIAN_CARD_NUMBER_COUNT = 15;

export const BINGO_PHASES = [
  'WAITING',
  'CARD_PURCHASE',
  'COUNTDOWN',
  'PLAYING',
  'EVENT_ACTIVE',
  'RESULTS',
  'ENDED',
] as const;
export type BingoPhase = (typeof BINGO_PHASES)[number];

export const BINGO_START_MODES = ['HOST', 'ALL_READY', 'TIMER'] as const;
export type BingoStartMode = (typeof BINGO_START_MODES)[number];

export const BINGO_MARKING_MODES = ['MANUAL', 'AUTOMATIC'] as const;
export type BingoMarkingMode = (typeof BINGO_MARKING_MODES)[number];

export const BINGO_ROOM_TIERS = ['ECONOMY', 'STANDARD', 'PREMIUM'] as const;
export type BingoRoomTier = (typeof BINGO_ROOM_TIERS)[number];

export const BINGO_CHAOS_LEVELS = ['CLASSIC', 'LIGHT', 'CHAOTIC', 'ABSURD'] as const;
export type BingoChaosLevel = (typeof BINGO_CHAOS_LEVELS)[number];

export const BINGO_CLAIM_TIERS = ['CINQUINA', 'BINGO'] as const;
export type BingoClaimTier = (typeof BINGO_CLAIM_TIERS)[number];

export type RoomBingoConfig = {
  minPlayers: number;
  maxPlayers: number;
  startMode: BingoStartMode;
  countdownSeconds: number;
  cardPrice: number;
  maxManualCards: number;
  maxAutomaticCards: number;
  /** Seconds the sellers walk the hall taking orders before the round starts. */
  purchaseSeconds: number;
  numberCallInterval: number;
  enabledEvents: string[];
  /**
   * How busy the hall should be, 0–6, where 3 is "as this hall normally is at
   * this hour". It used to be `npcCount`, a literal number of guests capped at
   * six, which is why a room with 512 chairs never held more than two dozen
   * people. The crowd size now comes from the time of day and the round; this
   * scales it.
   */
  crowdDensity: number;
  tier: BingoRoomTier;
  chaosLevel: BingoChaosLevel;
};

export interface ItalianBingoCard {
  id: string;
  index: number;
  /** Row-major 3x9 grid. Null values are the four blanks in each row. */
  cells: Array<number | null>;
  /** Cell indices marked by this player, including intentional mistakes. */
  markedIndices: number[];
}

export interface BingoPlayerSummary {
  sessionId: string;
  userId: string;
  displayName: string;
  level: number;
  ready: boolean;
  cardCount: number;
  markingMode: BingoMarkingMode;
  appearance: AvatarAppearance;
  isHost: boolean;
  isNpc: boolean;
  connected: boolean;
  loading: boolean;
  balance: number;
}

export interface BingoSnapshotPayload {
  roomName: string;
  roomCode: string;
  round: number;
  phase: BingoPhase;
  phaseChangedAt: number;
  countdownEndsAt: number | null;
  /** When the card sellers stop taking orders, during CARD_PURCHASE. */
  purchaseEndsAt: number | null;
  mySessionId: string;
  hostSessionId: string;
  config: RoomBingoConfig;
  players: BingoPlayerSummary[];
  myCards: ItalianBingoCard[];
  drawnNumbers: number[];
  currentNumber: number | null;
  nextDrawAt: number | null;
  potCredits: number;
  /** Live split of the pot, recomputed on every card sold. */
  prizePool: PrizeBreakdown;
  seedHash: string;
  awardedTiers: BingoClaimTier[];
  /** Server-authoritative event currently affecting the entire room. */
  activeEvent: ActiveBingoEvent | null;
  /** Most recent room events, newest first, useful for reconnects and the thesis HUD. */
  eventHistory: ActiveBingoEvent[];
  /** Who is sitting where. Authoritative: the client never decides this. */
  seating: SeatOccupancy[];
  /** Seats held open for friends, with the moment each hold lapses. */
  reservations: Array<{ seatId: string; holderId: string; expiresAt: number }>;
  /** The seat this player is in, or null while they are standing. */
  mySeatId: string | null;
}

/** Seating chart broadcast on its own, without a whole snapshot. */
export interface BingoSeatingPayload {
  seating: SeatOccupancy[];
  reservations: Array<{ seatId: string; holderId: string; expiresAt: number }>;
}

export interface BingoSeatRejectedPayload {
  seatId: string;
  reason: SeatRejectionReason;
}

export interface BingoBallCalledPayload {
  round: number;
  number: number;
  drawnNumbers: number[];
  nextDrawAt: number;
  subtitle: string;
}

export interface BingoWinnerPayload {
  round: number;
  tier: BingoClaimTier;
  sessionId: string;
  displayName: string;
  cardIndex: number;
  winningNumbers: number[];
  prizeCredits: number;
}

export interface BingoClaimRejectedPayload {
  round: number;
  tier: BingoClaimTier;
  reason:
    | 'round_changed'
    | 'wrong_phase'
    | 'invalid_card'
    | 'incomplete_result'
    | 'already_awarded';
}

export interface BingoActionRejectedPayload {
  action: keyof typeof BINGO_CLIENT_MESSAGES;
  reason:
    | 'invalid_payload'
    | 'wrong_phase'
    | 'host_only'
    | 'minimum_players'
    | 'players_not_ready'
    | 'cards_required'
    | 'already_purchased'
    | 'purchase_in_progress'
    | 'insufficient_credits'
    | 'manual_marking_only'
    | 'invalid_cell'
    | 'not_called'
    | 'configuration_locked';
}

export interface BingoPongPayload {
  clientTime: number;
  serverTime: number;
}

export const BINGO_CLIENT_MESSAGES = {
  purchaseCards: 'bingo_purchase_cards',
  setReady: 'bingo_set_ready',
  updateConfig: 'bingo_update_config',
  startGame: 'bingo_start_game',
  cancelStart: 'bingo_cancel_start',
  markCell: 'bingo_mark_cell',
  claim: 'bingo_claim',
  ping: 'bingo_ping',
  takeSeat: 'bingo_take_seat',
  leaveSeat: 'bingo_leave_seat',
  reserveSeat: 'bingo_reserve_seat',
  cancelReservation: 'bingo_cancel_reservation',
} as const;

export const BINGO_SERVER_MESSAGES = {
  snapshot: 'bingo_snapshot',
  ballCalled: 'bingo_ball_called',
  winner: 'bingo_winner',
  claimRejected: 'bingo_claim_rejected',
  actionRejected: 'bingo_action_rejected',
  pong: 'bingo_pong',
  /** Full seating chart, sent whenever anyone sits, stands or is timed out. */
  seating: 'bingo_seating',
  seatRejected: 'bingo_seat_rejected',
} as const;

const requestIdSchema = z.string().trim().min(8).max(80);

export const bingoPurchaseSchema = z
  .object({
    quantity: z.number().int().min(1).max(12),
    markingMode: z.enum(BINGO_MARKING_MODES),
    requestId: requestIdSchema,
  })
  .strict();

export const bingoReadySchema = z.object({ ready: z.boolean() }).strict();

export const bingoConfigSchema = z
  .object({
    startMode: z.enum(BINGO_START_MODES),
    countdownSeconds: z.number().int().min(5).max(180),
    // The window the sellers work the room in. Thirty seconds is a brisk demo,
    // ten minutes is a real session; two minutes is what a hall actually gives.
    purchaseSeconds: z.number().int().min(30).max(600),
    numberCallInterval: z.number().int().min(2_500).max(12_000),
    crowdDensity: z.number().int().min(0).max(6),
    tier: z.enum(BINGO_ROOM_TIERS),
    chaosLevel: z.enum(BINGO_CHAOS_LEVELS),
  })
  .strict();

export const bingoMarkSchema = z
  .object({
    round: z.number().int().positive(),
    cardIndex: z.number().int().min(0).max(11),
    cellIndex: z.number().int().min(0).max(ITALIAN_CARD_CELL_COUNT - 1),
    marked: z.boolean(),
  })
  .strict();

export const bingoClaimSchema = z
  .object({
    round: z.number().int().positive(),
    tier: z.enum(BINGO_CLAIM_TIERS),
    cardIndex: z.number().int().min(0).max(11),
    requestId: requestIdSchema,
  })
  .strict();

export const bingoEmptySchema = z.object({}).strict();

/** Seat id plus where the player claims to be standing. Both are checked. */
export const bingoSeatSchema = z
  .object({
    seatId: z.string().trim().min(2).max(16),
  })
  .strict();
export const bingoPingSchema = z.object({ clientTime: z.number() }).strict();

export function normaliseBingoRoomCode(value: unknown): string {
  if (typeof value !== 'string') return 'TESI-2026';
  const clean = value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, BINGO_ROOM_CODE_MAX_LENGTH);
  return clean || 'TESI-2026';
}

export function italianColumnRange(column: number): { min: number; max: number } {
  if (column === 0) return { min: 1, max: 9 };
  if (column === 8) return { min: 80, max: 90 };
  return { min: column * 10, max: column * 10 + 9 };
}
