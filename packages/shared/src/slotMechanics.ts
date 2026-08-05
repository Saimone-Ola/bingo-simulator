/**
 * Slot mechanics beyond fixed paylines.
 *
 * The original engine knew one way to win: a symbol repeating along a declared
 * line. That covers maybe four of the ten machine families a modern arcade
 * needs, and the missing six are not skins over the same maths — they change
 * what "a win" *is*. So they live here as separate evaluators over the same
 * grid, and a machine declares which one it uses.
 *
 * Everything is pure and takes the grid it is given. Nothing draws, nothing
 * randomises, nothing decides an outcome: `slots.ts` still owns that, and the
 * server still owns `slots.ts`.
 */

import type { Credits } from './credits';
import type { SlotConfig, SlotSymbol } from './slots';

export const SLOT_MECHANICS = ['LINES', 'WAYS', 'CLUSTER', 'MEGAWAYS'] as const;
export type SlotMechanic = (typeof SLOT_MECHANICS)[number];

export const SLOT_MECHANIC_LABELS: Record<SlotMechanic, string> = {
  LINES: 'Linee di pagamento',
  WAYS: 'Modi di vincita',
  CLUSTER: 'Gruppi adiacenti',
  MEGAWAYS: 'Rulli ad altezza variabile',
};

/** Smallest group that pays in a cluster machine. */
export const DEFAULT_MIN_CLUSTER = 5;

function symbolOf(config: SlotConfig, id: string): SlotSymbol | undefined {
  return config.symbols.find((symbol) => symbol.id === id);
}

function isWild(config: SlotConfig, id: string): boolean {
  return symbolOf(config, id)?.kind === 'wild';
}

function isScatter(config: SlotConfig, id: string): boolean {
  return symbolOf(config, id)?.kind === 'scatter';
}

function payoutFor(config: SlotConfig, symbolId: string, length: number): number {
  return config.paytable[symbolId]?.[length] ?? 0;
}

/* ------------------------------------------------------------------ *
 * Ways to win
 * ------------------------------------------------------------------ */

export interface WaysWin {
  symbolId: string;
  /** Reels the run covers, always starting at the leftmost. */
  reels: number;
  /** How many distinct paths through those reels make the run. */
  ways: number;
  multiplier: number;
  credits: Credits;
}

/**
 * "243 ways": a symbol pays if it appears anywhere on consecutive reels from
 * the left, and the prize multiplies by how many positions it occupies on each.
 *
 * There are no lines to declare, which is why a 5x3 machine has 3^5 = 243 ways.
 * The bet is per *spin* rather than per line, so the multiplier is applied to
 * the total bet and not to a line stake.
 */
export function evaluateWays(
  config: SlotConfig,
  grid: readonly (readonly string[])[],
  betCredits: Credits,
): WaysWin[] {
  const wins: WaysWin[] = [];

  for (const symbol of config.symbols) {
    if (symbol.kind === 'scatter') continue;

    const counts: number[] = [];
    for (let reel = 0; reel < config.reels; reel += 1) {
      const column = grid[reel] ?? [];
      const hits = column.filter(
        (cell) => cell === symbol.id || (symbol.kind !== 'wild' && isWild(config, cell)),
      ).length;
      if (hits === 0) break;
      counts.push(hits);
    }

    if (counts.length === 0) continue;
    const multiplier = payoutFor(config, symbol.id, counts.length);
    if (multiplier <= 0) continue;

    const ways = counts.reduce((product, hits) => product * hits, 1);
    wins.push({
      symbolId: symbol.id,
      reels: counts.length,
      ways,
      multiplier,
      credits: Math.floor(multiplier * ways * betCredits),
    });
  }

  return wins;
}

/** How many ways a grid offers in principle, which is the machine's headline. */
export function waysCount(rowsPerReel: readonly number[]): number {
  return rowsPerReel.reduce((product, rows) => product * Math.max(1, rows), 1);
}

/* ------------------------------------------------------------------ *
 * Cluster pays
 * ------------------------------------------------------------------ */

export interface ClusterWin {
  symbolId: string;
  size: number;
  /** Grid positions in the cluster, as `reel * rows + row`. */
  cells: number[];
  multiplier: number;
  credits: Credits;
}

/**
 * Groups of touching symbols pay, regardless of alignment.
 *
 * Adjacency is orthogonal — diagonals do not connect — which is the usual rule
 * and matters because diagonal connectivity roughly doubles the average cluster
 * size and would wreck any paytable calibrated without it.
 *
 * Wilds join any cluster but never seed one: a blob of wilds alone is not a win,
 * or a machine could pay for a symbol nobody chose.
 */
export function evaluateCluster(
  config: SlotConfig,
  grid: readonly (readonly string[])[],
  betCredits: Credits,
  minSize = DEFAULT_MIN_CLUSTER,
): ClusterWin[] {
  const rows = config.rows;
  const reels = config.reels;
  const wins: ClusterWin[] = [];
  const claimed = new Set<number>();

  const at = (reel: number, row: number): string | undefined => grid[reel]?.[row];
  const index = (reel: number, row: number) => reel * rows + row;

  for (let reel = 0; reel < reels; reel += 1) {
    for (let row = 0; row < rows; row += 1) {
      const start = at(reel, row);
      if (!start || claimed.has(index(reel, row))) continue;
      if (isWild(config, start) || isScatter(config, start)) continue;

      // Flood fill over cells that are this symbol or a wild.
      const cluster: number[] = [];
      const stack = [[reel, row] as const];
      const seen = new Set<number>([index(reel, row)]);

      while (stack.length > 0) {
        const [r, y] = stack.pop()!;
        const cell = at(r, y);
        if (!cell) continue;
        if (cell !== start && !isWild(config, cell)) continue;

        cluster.push(index(r, y));
        for (const [dr, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nr = r + dr;
          const ny = y + dy;
          if (nr < 0 || nr >= reels || ny < 0 || ny >= rows) continue;
          const key = index(nr, ny);
          if (seen.has(key)) continue;
          const neighbour = at(nr, ny);
          if (neighbour === start || (neighbour !== undefined && isWild(config, neighbour))) {
            seen.add(key);
            stack.push([nr, ny]);
          }
        }
      }

      if (cluster.length < minSize) continue;

      // Paytable keys run 3..5; a cluster can be far bigger, so it is capped to
      // the largest declared payout rather than falling through to nothing.
      const table = config.paytable[start] ?? {};
      const declared = Object.keys(table)
        .map(Number)
        .filter((key) => Number.isFinite(key))
        .sort((a, b) => a - b);
      const band = declared.filter((key) => key <= cluster.length).pop() ?? declared[0];
      const multiplier = band === undefined ? 0 : (table[band] ?? 0);
      if (multiplier <= 0) continue;

      // Bigger clusters pay more than the band alone, or every cluster above
      // the top band would be worth the same and size would stop mattering.
      const overflow = 1 + Math.max(0, cluster.length - (band ?? cluster.length)) * 0.25;
      for (const cell of cluster) claimed.add(cell);

      wins.push({
        symbolId: start,
        size: cluster.length,
        cells: cluster,
        multiplier,
        credits: Math.floor(multiplier * overflow * betCredits),
      });
    }
  }

  return wins;
}

/* ------------------------------------------------------------------ *
 * Megaways: reels of different heights, redrawn each spin
 * ------------------------------------------------------------------ */

export const MEGAWAYS_MIN_ROWS = 2;
export const MEGAWAYS_MAX_ROWS = 7;

/**
 * Picks how tall each reel is this spin.
 *
 * The variable height *is* the mechanic: the number of ways changes from spin
 * to spin, which is what makes the machine feel different from a fixed grid
 * even though the symbols are the same.
 */
export function rollReelHeights(reels: number, random: () => number): number[] {
  return Array.from({ length: reels }, () => {
    const span = MEGAWAYS_MAX_ROWS - MEGAWAYS_MIN_ROWS + 1;
    return MEGAWAYS_MIN_ROWS + Math.floor(random() * span);
  });
}

/* ------------------------------------------------------------------ *
 * Cascades
 * ------------------------------------------------------------------ */

export interface CascadeStep {
  /** Cells removed at this step, as `reel * rows + row`. */
  cleared: number[];
  creditsWon: Credits;
  /** 1 for the first drop, rising with each consecutive one. */
  multiplier: number;
}

/**
 * Multiplier applied to the nth consecutive cascade.
 *
 * Rising with the chain is what makes a cascade machine's big wins feel earned
 * rather than accidental, and it is also where most of its volatility comes
 * from: the tail is long because chains are rare and compound.
 */
export function cascadeMultiplier(step: number): number {
  return 1 + Math.max(0, step);
}

/**
 * Removes winning cells and drops the column above them down.
 *
 * Returns the new grid; refilling the gaps at the top is the caller's job
 * because it needs the random source, and this stays pure.
 */
export function collapseGrid(
  grid: readonly (readonly string[])[],
  cleared: readonly number[],
  rows: number,
): (string | null)[][] {
  const next: (string | null)[][] = grid.map((column) => [...column]);
  const gone = new Set(cleared);

  for (let reel = 0; reel < next.length; reel += 1) {
    const column = next[reel]!;
    const kept: (string | null)[] = [];
    for (let row = 0; row < rows; row += 1) {
      if (!gone.has(reel * rows + row)) kept.push(column[row] ?? null);
    }
    // Survivors fall to the bottom; the gaps open at the top.
    while (kept.length < rows) kept.unshift(null);
    next[reel] = kept;
  }

  return next;
}

/* ------------------------------------------------------------------ *
 * Hold and spin
 * ------------------------------------------------------------------ */

export interface HoldAndSpinState {
  /** Locked prize cells, as `reel * rows + row` to credit value. */
  held: Map<number, Credits>;
  respinsLeft: number;
}

export const HOLD_AND_SPIN_RESPINS = 3;

/**
 * One respin of a hold-and-spin round.
 *
 * The rule that makes it tense: landing a new prize symbol *resets* the respin
 * counter. A round therefore ends only when a full respin lands nothing, which
 * is why filling the screen feels reachable right up until it isn't.
 */
export function applyHoldAndSpin(
  state: HoldAndSpinState,
  landed: ReadonlyMap<number, Credits>,
): HoldAndSpinState {
  const held = new Map(state.held);
  let landedNew = false;

  for (const [cell, value] of landed) {
    if (held.has(cell)) continue;
    held.set(cell, value);
    landedNew = true;
  }

  return {
    held,
    respinsLeft: landedNew ? HOLD_AND_SPIN_RESPINS : state.respinsLeft - 1,
  };
}

export function holdAndSpinTotal(state: HoldAndSpinState): Credits {
  let total = 0;
  for (const value of state.held.values()) total += value;
  return total;
}

/* ------------------------------------------------------------------ *
 * Progressive jackpots
 * ------------------------------------------------------------------ */

export const JACKPOT_LEVELS = ['MINI', 'MINOR', 'MAJOR', 'GRAND'] as const;
export type JackpotLevel = (typeof JACKPOT_LEVELS)[number];

export const JACKPOT_LABELS: Record<JackpotLevel, string> = {
  MINI: 'Mini',
  MINOR: 'Minore',
  MAJOR: 'Maggiore',
  GRAND: 'Grande',
};

/** Seed each level resets to after it is won. */
export const JACKPOT_SEEDS: Record<JackpotLevel, Credits> = {
  MINI: 50,
  MINOR: 250,
  MAJOR: 2_500,
  GRAND: 25_000,
};

/** Share of every bet that feeds each level. */
export const JACKPOT_CONTRIBUTION: Record<JackpotLevel, number> = {
  MINI: 0.004,
  MINOR: 0.003,
  MAJOR: 0.002,
  GRAND: 0.001,
};

/**
 * How much of a bet goes into the jackpots.
 *
 * This comes out of the machine's return, so a machine with jackpots must be
 * calibrated with the contribution included or its measured RTP will sit below
 * the published one. Total here is one per cent of every bet.
 */
export function jackpotContribution(betCredits: Credits): Record<JackpotLevel, Credits> {
  const shares = {} as Record<JackpotLevel, Credits>;
  for (const level of JACKPOT_LEVELS) {
    shares[level] = Math.floor(betCredits * JACKPOT_CONTRIBUTION[level] * 100) / 100;
  }
  return shares;
}

export function totalJackpotContribution(): number {
  return JACKPOT_LEVELS.reduce((sum, level) => sum + JACKPOT_CONTRIBUTION[level], 0);
}
