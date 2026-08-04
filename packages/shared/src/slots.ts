/**
 * Slot machine engine.
 *
 * Pure and deterministic: given a configuration, a server seed and a nonce it
 * returns exactly one grid and exactly one set of wins, on both ends of the
 * wire. That is what makes a spin auditable — the server can replay any past
 * spin from `slot_spins.server_seed` and `nonce`, and so can a player once the
 * seed is revealed.
 *
 * Nothing here touches credits, the ledger, or the database. It computes what
 * happened; deciding whether the player could afford it, and writing the money
 * movements, belongs to the server.
 */

import { SLOT_RTP_MAX, SLOT_RTP_MIN } from './constants';
import type { Credits } from './credits';

export const SLOT_SYMBOL_KINDS = ['normal', 'wild', 'scatter'] as const;
export type SlotSymbolKind = (typeof SLOT_SYMBOL_KINDS)[number];

export const SLOT_VOLATILITIES = ['low', 'medium', 'high', 'extreme'] as const;
export type SlotVolatility = (typeof SLOT_VOLATILITIES)[number];

/** Shortest run that can pay anything, on any machine. */
export const SLOT_MIN_MATCH = 3;

export interface SlotSymbol {
  id: string;
  name: string;
  kind: SlotSymbolKind;
  /**
   * Weight on each reel, one entry per reel.
   *
   * Per-reel strips are what let a designer make a symbol common on the left
   * and rare on the right — the usual way to shape a slot's feel without
   * touching the paytable.
   */
  weights: number[];
}

export interface SlotFreeSpins {
  /** Scatters on screen needed to trigger. */
  triggerScatters: number;
  spins: number;
  /** Applied to every win during the free spins. */
  multiplier: number;
}

export interface SlotFeatures {
  freeSpins?: SlotFreeSpins;
}

export interface SlotConfig {
  reels: number;
  rows: number;
  /** One entry per payline: the row index to read on each reel. */
  paylines: number[][];
  symbols: SlotSymbol[];
  /** symbol id -> run length -> multiplier of the line bet. */
  paytable: Record<string, Record<number, number>>;
  features: SlotFeatures;
  volatility: SlotVolatility;
}

export interface SlotLineWin {
  paylineIndex: number;
  symbolId: string;
  matchLength: number;
  /** Multiplier of the *line* bet. */
  multiplier: number;
  credits: Credits;
}

export interface SlotSpinResult {
  /** `grid[reel][row]` holds a symbol id. */
  grid: string[][];
  lineWins: SlotLineWin[];
  scatterCount: number;
  /** Multiplier of the *total* bet paid by scatters. */
  scatterMultiplier: number;
  scatterCredits: Credits;
  freeSpinsAwarded: number;
  totalWin: Credits;
  /**
   * One symbol short of a win, on a payline or on the scatter trigger.
   *
   * Reported so the presentation layer can hold the last reel a beat longer.
   * It is an observation about the result, never an input to it: the engine
   * does not manufacture near misses, which is the difference between a slot
   * that feels tense and one that is rigged.
   */
  nearMiss: boolean;
}

/* ------------------------------------------------------------------ *
 * Deterministic randomness
 * ------------------------------------------------------------------ */

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Stream of uniforms for one spin.
 *
 * Seeded from the server seed and the nonce together, so the same seed used at
 * a different nonce produces a completely different spin, and the whole
 * sequence for a machine is replayable from its two stored numbers.
 */
export class SlotRandom {
  private state: number;

  constructor(serverSeed: string, nonce: number) {
    this.state = hashSeed(`${serverSeed}:${nonce}`);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  }
}

/* ------------------------------------------------------------------ *
 * Reels
 * ------------------------------------------------------------------ */

/** Total symbol weight on one reel. Zero means the reel cannot be spun. */
export function reelWeight(config: SlotConfig, reel: number): number {
  let total = 0;
  for (const symbol of config.symbols) {
    total += Math.max(0, symbol.weights[reel] ?? 0);
  }
  return total;
}

function pickSymbol(config: SlotConfig, reel: number, roll: number): string {
  const total = reelWeight(config, reel);
  if (total <= 0) return config.symbols[0]?.id ?? '';
  let cursor = roll * total;
  for (const symbol of config.symbols) {
    cursor -= Math.max(0, symbol.weights[reel] ?? 0);
    if (cursor <= 0) return symbol.id;
  }
  return config.symbols[config.symbols.length - 1]?.id ?? '';
}

/** Probability of a symbol landing on a given reel cell. */
export function symbolProbability(config: SlotConfig, symbolId: string, reel: number): number {
  const total = reelWeight(config, reel);
  if (total <= 0) return 0;
  const symbol = config.symbols.find((entry) => entry.id === symbolId);
  return Math.max(0, symbol?.weights[reel] ?? 0) / total;
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

function symbolKind(config: SlotConfig, symbolId: string): SlotSymbolKind {
  return config.symbols.find((symbol) => symbol.id === symbolId)?.kind ?? 'normal';
}

function payout(config: SlotConfig, symbolId: string, matchLength: number): number {
  return config.paytable[symbolId]?.[matchLength] ?? 0;
}

function cellAt(grid: string[][], reel: number, row: number): string {
  return grid[reel]?.[row] ?? '';
}

/**
 * Best win on one payline, read left to right.
 *
 * A wild stands in for any normal symbol, so the paying symbol is the first
 * non-wild one along the line. A run made only of wilds is scored twice — once
 * as wilds, once as whatever symbol continues after them — and the better of
 * the two is paid, which is the convention players expect.
 */
export function evaluatePayline(
  config: SlotConfig,
  grid: string[][],
  payline: number[],
  betPerLine: Credits,
): { multiplier: number; symbolId: string; matchLength: number } | null {
  const wildId = config.symbols.find((symbol) => symbol.kind === 'wild')?.id;

  const runFor = (target: string): number => {
    let length = 0;
    for (let reel = 0; reel < config.reels; reel += 1) {
      const row = payline[reel];
      if (row === undefined) break;
      const symbolId = cellAt(grid, reel, row);
      if (symbolId === target || (wildId !== undefined && symbolId === wildId)) {
        length += 1;
        continue;
      }
      break;
    }
    return length;
  };

  // Candidate paying symbols: the first non-wild along the line, plus the wild
  // itself when the machine pays for wilds in their own right.
  const candidates = new Set<string>();
  for (let reel = 0; reel < config.reels; reel += 1) {
    const row = payline[reel];
    if (row === undefined) continue;
    const symbolId = cellAt(grid, reel, row);
    if (symbolId === '' || symbolId === wildId) continue;
    if (symbolKind(config, symbolId) === 'scatter') break;
    candidates.add(symbolId);
    break;
  }
  if (wildId !== undefined) candidates.add(wildId);

  let best: { multiplier: number; symbolId: string; matchLength: number } | null = null;
  for (const symbolId of candidates) {
    const length = runFor(symbolId);
    if (length < SLOT_MIN_MATCH) continue;
    // A shorter run can pay more than a longer one only on a broken paytable,
    // but checking every length costs nothing and cannot be wrong.
    for (let matchLength = length; matchLength >= SLOT_MIN_MATCH; matchLength -= 1) {
      const multiplier = payout(config, symbolId, matchLength);
      if (multiplier <= 0) continue;
      if (!best || multiplier > best.multiplier) {
        best = { multiplier, symbolId, matchLength };
      }
      break;
    }
  }

  if (!best || betPerLine < 0) return best;
  return best;
}

function countScatters(config: SlotConfig, grid: string[][]): number {
  const scatterId = config.symbols.find((symbol) => symbol.kind === 'scatter')?.id;
  if (scatterId === undefined) return 0;
  let count = 0;
  for (let reel = 0; reel < config.reels; reel += 1) {
    for (let row = 0; row < config.rows; row += 1) {
      if (cellAt(grid, reel, row) === scatterId) count += 1;
    }
  }
  return count;
}

/** Longest run on any payline, used to spot a result that just missed. */
function longestRun(config: SlotConfig, grid: string[][]): number {
  const wildId = config.symbols.find((symbol) => symbol.kind === 'wild')?.id;
  let longest = 0;
  for (const payline of config.paylines) {
    const firstRow = payline[0];
    if (firstRow === undefined) continue;
    const first = cellAt(grid, 0, firstRow);
    if (first === '') continue;
    let length = 1;
    for (let reel = 1; reel < config.reels; reel += 1) {
      const row = payline[reel];
      if (row === undefined) break;
      const symbolId = cellAt(grid, reel, row);
      if (symbolId === first || symbolId === wildId || first === wildId) {
        length += 1;
        continue;
      }
      break;
    }
    if (length > longest) longest = length;
  }
  return longest;
}

/** Draws the grid for one spin. Exposed so the editor can preview a strip. */
export function drawGrid(config: SlotConfig, random: SlotRandom): string[][] {
  const grid: string[][] = [];
  for (let reel = 0; reel < config.reels; reel += 1) {
    const column: string[] = [];
    for (let row = 0; row < config.rows; row += 1) {
      column.push(pickSymbol(config, reel, random.next()));
    }
    grid.push(column);
  }
  return grid;
}

/**
 * Resolves one spin.
 *
 * `betPerLine` is in credits; the total bet is `betPerLine * paylines.length`.
 * `multiplier` scales every win and is how free spins pay more than the base
 * game without needing a second code path.
 */
export function spinSlot(
  config: SlotConfig,
  serverSeed: string,
  nonce: number,
  betPerLine: Credits,
  multiplier = 1,
): SlotSpinResult {
  const random = new SlotRandom(serverSeed, nonce);
  const grid = drawGrid(config, random);
  return resolveGrid(config, grid, betPerLine, multiplier);
}

/** Scores an already drawn grid. Separated so tests can hand-build a result. */
export function resolveGrid(
  config: SlotConfig,
  grid: string[][],
  betPerLine: Credits,
  multiplier = 1,
): SlotSpinResult {
  const lineWins: SlotLineWin[] = [];

  for (let index = 0; index < config.paylines.length; index += 1) {
    const payline = config.paylines[index];
    if (!payline) continue;
    const win = evaluatePayline(config, grid, payline, betPerLine);
    if (!win) continue;
    lineWins.push({
      paylineIndex: index,
      symbolId: win.symbolId,
      matchLength: win.matchLength,
      multiplier: win.multiplier,
      credits: Math.round(win.multiplier * betPerLine * multiplier),
    });
  }

  const totalBet = betPerLine * config.paylines.length;
  const scatterId = config.symbols.find((symbol) => symbol.kind === 'scatter')?.id;
  const scatterCount = countScatters(config, grid);
  const scatterMultiplier =
    scatterId === undefined ? 0 : payout(config, scatterId, scatterCount);
  const scatterCredits = Math.round(scatterMultiplier * totalBet * multiplier);

  const trigger = config.features.freeSpins;
  const freeSpinsAwarded =
    trigger && scatterCount >= trigger.triggerScatters ? trigger.spins : 0;

  const lineCredits = lineWins.reduce((sum, win) => sum + win.credits, 0);

  return {
    grid,
    lineWins,
    scatterCount,
    scatterMultiplier,
    scatterCredits,
    freeSpinsAwarded,
    totalWin: lineCredits + scatterCredits,
    nearMiss:
      lineWins.length === 0 &&
      (longestRun(config, grid) === SLOT_MIN_MATCH - 1 ||
        (trigger !== undefined && scatterCount === trigger.triggerScatters - 1)),
  };
}

/* ------------------------------------------------------------------ *
 * Return to player
 * ------------------------------------------------------------------ */

/**
 * Exact return of the line game, computed rather than sampled.
 *
 * Reels are independent, so for a symbol S the chance of a run of exactly L is
 * the product of P(S or wild) over the first L reels times P(neither) on reel
 * L+1. Summed over every symbol, length and payline this is the whole line
 * component of the RTP with no sampling error at all.
 *
 * Scatters and free spins are deliberately *not* included: scatter pays depend
 * on positions across the whole grid rather than along a line, and free spins
 * feed back into themselves. Those come from the simulation, and
 * {@link compareSlotRtp} is what puts the two side by side.
 */
export function analyticLineRtp(config: SlotConfig): number {
  const wildId = config.symbols.find((symbol) => symbol.kind === 'wild')?.id;
  let expected = 0;

  for (const symbol of config.symbols) {
    if (symbol.kind === 'scatter') continue;
    const table = config.paytable[symbol.id];
    if (!table) continue;

    // P(reel shows this symbol or a wild) per reel.
    const hit: number[] = [];
    for (let reel = 0; reel < config.reels; reel += 1) {
      const own = symbolProbability(config, symbol.id, reel);
      const wild =
        wildId === undefined || wildId === symbol.id
          ? 0
          : symbolProbability(config, wildId, reel);
      hit.push(Math.min(1, own + wild));
    }

    for (let length = SLOT_MIN_MATCH; length <= config.reels; length += 1) {
      const multiplier = table[length] ?? 0;
      if (multiplier <= 0) continue;
      let probability = 1;
      for (let reel = 0; reel < length; reel += 1) probability *= hit[reel] ?? 0;
      // Exactly this long: the next reel must break the run.
      if (length < config.reels) probability *= 1 - (hit[length] ?? 0);
      expected += probability * multiplier;
    }
  }

  // Each payline is bet on separately and pays a multiple of its own line bet,
  // so the per-line expectation *is* the RTP of the line game.
  return expected;
}

export interface SlotSimulation {
  spins: number;
  wagered: number;
  won: number;
  rtp: number;
  /** Share of spins that returned anything at all. */
  hitFrequency: number;
  /** Largest single spin win, as a multiple of the total bet. */
  maxWinMultiplier: number;
  freeSpinTriggers: number;
  /** Spin counts bucketed by win size, as a multiple of the total bet. */
  distribution: Record<string, number>;
}

export const SLOT_WIN_BUCKETS = [0, 1, 2, 5, 10, 25, 50, 100] as const;

function emptyDistribution(): Record<string, number> {
  const distribution: Record<string, number> = { '0': 0 };
  for (let index = 1; index < SLOT_WIN_BUCKETS.length; index += 1) {
    distribution[String(SLOT_WIN_BUCKETS[index])] = 0;
  }
  return distribution;
}

function bucketFor(ratio: number): string {
  if (ratio <= 0) return '0';
  let bucket: number = SLOT_WIN_BUCKETS[1] ?? 1;
  for (const edge of SLOT_WIN_BUCKETS) {
    if (ratio >= edge && edge > 0) bucket = edge;
  }
  return String(bucket);
}

export function emptySimulation(): SlotSimulation {
  return {
    spins: 0,
    wagered: 0,
    won: 0,
    rtp: 0,
    hitFrequency: 0,
    maxWinMultiplier: 0,
    freeSpinTriggers: 0,
    distribution: emptyDistribution(),
  };
}

/**
 * Runs a batch of spins and folds them into `into`.
 *
 * Additive on purpose: a million-spin run has to be chopped into slices so the
 * server can yield between them, and the caller just keeps handing the same
 * accumulator back. Free spins are played out at their multiplier, so the
 * measured RTP includes the feature the analytic figure leaves out.
 */
export function simulateSlotBatch(
  config: SlotConfig,
  serverSeed: string,
  startNonce: number,
  spins: number,
  into: SlotSimulation = emptySimulation(),
  betPerLine = 1,
): SlotSimulation {
  const totalBet = betPerLine * config.paylines.length;
  const feature = config.features.freeSpins;

  for (let index = 0; index < spins; index += 1) {
    const nonce = startNonce + index;
    const result = spinSlot(config, serverSeed, nonce, betPerLine);
    let won = result.totalWin;

    if (result.freeSpinsAwarded > 0 && feature) {
      into.freeSpinTriggers += 1;
      for (let free = 0; free < result.freeSpinsAwarded; free += 1) {
        // Free spins are not wagered, so they add to `won` and not `wagered`.
        won += spinSlot(
          config,
          `${serverSeed}:free`,
          nonce * 1000 + free,
          betPerLine,
          feature.multiplier,
        ).totalWin;
      }
    }

    into.spins += 1;
    into.wagered += totalBet;
    into.won += won;
    if (won > 0) into.hitFrequency += 1;

    const ratio = totalBet > 0 ? won / totalBet : 0;
    if (ratio > into.maxWinMultiplier) into.maxWinMultiplier = ratio;
    const bucket = bucketFor(ratio);
    into.distribution[bucket] = (into.distribution[bucket] ?? 0) + 1;
  }

  into.rtp = into.wagered > 0 ? into.won / into.wagered : 0;
  return into;
}

export interface SlotRtpComparison {
  analyticLineRtp: number;
  simulatedRtp: number;
  /** Difference between the two, as a share of the simulated figure. */
  drift: number;
  withinPublishWindow: boolean;
}

/**
 * Puts the computed line RTP next to a measured one.
 *
 * The two will not match exactly — the analytic figure covers only the line
 * game — but the line component dominates, so a wide gap means either the
 * scatter pays are doing far more work than intended or something is wrong.
 */
export function compareSlotRtp(config: SlotConfig, simulation: SlotSimulation): SlotRtpComparison {
  const analytic = analyticLineRtp(config);
  const simulated = simulation.rtp;
  return {
    analyticLineRtp: analytic,
    simulatedRtp: simulated,
    drift: simulated > 0 ? (simulated - analytic) / simulated : 0,
    withinPublishWindow: simulated >= SLOT_RTP_MIN && simulated <= SLOT_RTP_MAX,
  };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type SlotConfigProblem =
  | 'no_symbols'
  | 'no_paylines'
  | 'bad_reel_count'
  | 'bad_row_count'
  | 'payline_length'
  | 'payline_row_range'
  | 'symbol_weights'
  | 'empty_reel'
  | 'multiple_wilds'
  | 'multiple_scatters'
  | 'paytable_unknown_symbol'
  | 'paytable_bad_length';

/**
 * Structural problems that make a configuration unplayable.
 *
 * Separate from the RTP window: a machine can be perfectly well formed and
 * still be refused publication for paying too much or too little.
 */
export function validateSlotConfig(config: SlotConfig): SlotConfigProblem[] {
  const problems: SlotConfigProblem[] = [];

  if (config.symbols.length === 0) problems.push('no_symbols');
  if (config.paylines.length === 0) problems.push('no_paylines');
  if (config.reels !== 3 && config.reels !== 5) problems.push('bad_reel_count');
  if (config.rows < 1 || config.rows > 5) problems.push('bad_row_count');

  for (const payline of config.paylines) {
    if (payline.length !== config.reels) {
      problems.push('payline_length');
      break;
    }
  }
  for (const payline of config.paylines) {
    if (payline.some((row) => !Number.isInteger(row) || row < 0 || row >= config.rows)) {
      problems.push('payline_row_range');
      break;
    }
  }

  for (const symbol of config.symbols) {
    if (
      symbol.weights.length !== config.reels ||
      symbol.weights.some((weight) => !Number.isFinite(weight) || weight < 0)
    ) {
      problems.push('symbol_weights');
      break;
    }
  }

  for (let reel = 0; reel < config.reels; reel += 1) {
    if (reelWeight(config, reel) <= 0) {
      problems.push('empty_reel');
      break;
    }
  }

  if (config.symbols.filter((symbol) => symbol.kind === 'wild').length > 1) {
    problems.push('multiple_wilds');
  }
  if (config.symbols.filter((symbol) => symbol.kind === 'scatter').length > 1) {
    problems.push('multiple_scatters');
  }

  const known = new Set(config.symbols.map((symbol) => symbol.id));
  for (const [symbolId, table] of Object.entries(config.paytable)) {
    if (!known.has(symbolId)) {
      problems.push('paytable_unknown_symbol');
      break;
    }
    if (
      Object.keys(table).some((length) => {
        const value = Number(length);
        return !Number.isInteger(value) || value < 1 || value > config.reels;
      })
    ) {
      problems.push('paytable_bad_length');
      break;
    }
  }

  return [...new Set(problems)];
}

/** A configuration hash, so a spin records exactly what it was resolved against. */
export function slotConfigFingerprint(config: SlotConfig): string {
  const canonical = JSON.stringify({
    reels: config.reels,
    rows: config.rows,
    paylines: config.paylines,
    symbols: config.symbols.map((symbol) => [symbol.id, symbol.kind, symbol.weights]),
    paytable: Object.keys(config.paytable)
      .sort()
      .map((key) => [key, config.paytable[key]]),
    features: config.features,
  });
  // FNV-1a over the canonical form: enough to notice an edit, and the database
  // column is the authority on which version a spin belongs to anyway.
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
