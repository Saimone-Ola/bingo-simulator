/**
 * Wire contract for the slot machine API.
 *
 * The asymmetry here is the point. The client may send a *configuration* and a
 * *bet*; it may never send a grid, a seed, a win, or an RTP. Everything the
 * server returns about an outcome is something the server itself computed.
 */

import { z } from 'zod';
import {
  SLOT_MIN_MATCH,
  SLOT_SYMBOL_KINDS,
  SLOT_VOLATILITIES,
  type SlotConfig,
  type SlotLineWin,
  type SlotVolatility,
} from './slots';

export const SLOT_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SLOT_NAME_MAX = 48;
export const SLOT_DESCRIPTION_MAX = 280;
/** Spins a caller may ask the editor's simulation for in one request. */
export const SLOT_SIMULATION_MAX_SPINS = 200_000;
/** Spins the server runs itself before letting a machine be published. */
export const SLOT_PUBLISH_SIMULATION_SPINS = 1_000_000;

const symbolSchema = z
  .object({
    id: z.string().trim().min(1).max(24),
    name: z.string().trim().min(1).max(24),
    kind: z.enum(SLOT_SYMBOL_KINDS),
    weights: z.array(z.number().int().min(0).max(1_000)).min(3).max(5),
  })
  .strict();

/** Run length -> multiplier. Keys arrive as strings because JSON has no ints. */
const paytableSchema = z.record(
  z.string(),
  z.record(
    z.string().regex(/^[1-5]$/),
    z.number().min(0).max(100_000),
  ),
);

export const slotConfigSchema = z
  .object({
    reels: z.union([z.literal(3), z.literal(5)]),
    rows: z.number().int().min(1).max(5),
    paylines: z.array(z.array(z.number().int().min(0).max(4)).min(3).max(5)).min(1).max(50),
    symbols: z.array(symbolSchema).min(2).max(12),
    paytable: paytableSchema,
    features: z
      .object({
        freeSpins: z
          .object({
            triggerScatters: z.number().int().min(2).max(5),
            spins: z.number().int().min(1).max(50),
            multiplier: z.number().int().min(1).max(10),
          })
          .strict()
          .optional(),
      })
      .strict(),
    volatility: z.enum(SLOT_VOLATILITIES),
  })
  .strict();

export const slotCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(SLOT_NAME_MAX),
    description: z.string().trim().max(SLOT_DESCRIPTION_MAX).optional(),
    config: slotConfigSchema,
    minBetCredits: z.number().int().min(1).max(10_000).default(1),
    maxBetCredits: z.number().int().min(1).max(100_000).default(100),
  })
  .strict();

export const slotUpdateSchema = slotCreateSchema.partial().strict();

export const slotSimulateSchema = z
  .object({
    config: slotConfigSchema,
    spins: z.number().int().min(1_000).max(SLOT_SIMULATION_MAX_SPINS).default(10_000),
  })
  .strict();

export const slotSpinSchema = z
  .object({
    betPerLine: z.number().int().min(1).max(10_000),
    /** Stable per attempt, so a retried request cannot bet twice. */
    requestId: z.string().trim().min(8).max(80),
  })
  .strict();

export const slotListQuerySchema = z
  .object({
    mine: z.coerce.boolean().optional(),
    volatility: z.enum(SLOT_VOLATILITIES).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type SlotCreateRequest = z.infer<typeof slotCreateSchema>;
export type SlotSimulateRequest = z.infer<typeof slotSimulateSchema>;
export type SlotSpinRequest = z.infer<typeof slotSpinSchema>;

export interface SlotMachineSummary {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  volatility: SlotVolatility;
  status: SlotStatus;
  version: number;
  minBetCredits: number;
  maxBetCredits: number;
  /** Computed by the server from the reels and the paytable. Never sent up. */
  rtpTheoretical: number | null;
  rtpSimulated: number | null;
  rtpSimulationSpins: number | null;
  paylineCount: number;
  totalSpins: number;
  isMine: boolean;
}

export interface SlotMachineDetail extends SlotMachineSummary {
  config: SlotConfig;
  configHash: string | null;
  rejectionReason: string | null;
}

export interface SlotSimulationReport {
  spins: number;
  rtp: number;
  analyticLineRtp: number;
  drift: number;
  hitFrequency: number;
  maxWinMultiplier: number;
  freeSpinTriggerRate: number;
  distribution: Record<string, number>;
  withinPublishWindow: boolean;
  /** Structural problems, empty when the machine is well formed. */
  problems: string[];
}

export interface SlotSpinResponse {
  spinId: string;
  machineId: string;
  machineVersion: number;
  nonce: number;
  /** Committed before the spin and verifiable against the revealed seed. */
  serverSeedHash: string;
  /** Revealed with the outcome, so the grid can be recomputed independently. */
  serverSeed: string;
  grid: string[][];
  lineWins: SlotLineWin[];
  scatterCount: number;
  scatterCredits: number;
  freeSpinsAwarded: number;
  /** Wins from any free spins the trigger awarded, already resolved. */
  freeSpinWin: number;
  betCredits: number;
  winCredits: number;
  nearMiss: boolean;
  balanceAfter: number;
}

/** Commitments for the next spins, published before any of them is played. */
export interface SlotCommitment {
  machineId: string;
  entries: Array<{ nonce: number; serverSeedHash: string }>;
}

export const SLOT_REJECTION_REASONS = {
  not_found: 'Questa slot non esiste o non è più disponibile.',
  not_published: 'Questa slot non è ancora pubblicata.',
  not_owner: 'Solo chi ha creato la macchina può modificarla.',
  invalid_config: 'La configurazione della macchina non è valida.',
  rtp_out_of_window: 'L’RTP calcolato è fuori dalla finestra consentita.',
  bet_out_of_range: 'La puntata non rientra nei limiti della macchina.',
  insufficient_credits: 'Crediti virtuali insufficienti per questa puntata.',
} as const;

export type SlotRejectionReason = keyof typeof SLOT_REJECTION_REASONS;

/**
 * Total bet for one spin. One line is bet per payline, always: a machine with
 * ten lines costs ten times the line bet, which is what the paytable's
 * multipliers are relative to.
 */
export function slotTotalBet(config: SlotConfig, betPerLine: number): number {
  return betPerLine * config.paylines.length;
}

/** Re-exported so the editor can show the rule it is validating against. */
export { SLOT_MIN_MATCH };
