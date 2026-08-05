/**
 * The prize pool, and how it splits.
 *
 * A pure function of what has been sold and how the room was configured, so the
 * figure on the panel and the figure the server pays out are the same
 * computation rather than two that agree most of the time. The client renders
 * this; it never decides it.
 *
 * The rounding is the interesting part. Splitting an integer pot by
 * percentages does not give integers, and paying out the rounded pieces would
 * either exceed the pot or quietly leak credits into nothing. Every share is
 * floored and the remainder goes to the final tier — the room keeps its books
 * balanced to the credit, and the biggest prize absorbs the dust.
 */

import type { Credits } from './credits';

export const BINGO_PRIZE_TIERS = ['AMBO', 'TERNA', 'QUATERNA', 'CINQUINA', 'BINGO'] as const;
export type BingoPrizeTier = (typeof BINGO_PRIZE_TIERS)[number];

export const BINGO_PRIZE_TIER_LABELS: Record<BingoPrizeTier, string> = {
  AMBO: 'Ambo',
  TERNA: 'Terna',
  QUATERNA: 'Quaterna',
  CINQUINA: 'Cinquina',
  BINGO: 'Bingo',
};

/** Numbers needed on one line for each tier. */
export const BINGO_TIER_MATCH_COUNT: Record<BingoPrizeTier, number> = {
  AMBO: 2,
  TERNA: 3,
  QUATERNA: 4,
  CINQUINA: 5,
  BINGO: 15,
};

/** Share of the distributed pot going to each tier. Must sum to 1. */
export type PrizeSplit = Record<BingoPrizeTier, number>;

export const DEFAULT_PRIZE_SPLIT: PrizeSplit = {
  AMBO: 0.06,
  TERNA: 0.09,
  QUATERNA: 0.13,
  CINQUINA: 0.2,
  BINGO: 0.52,
};

export interface PrizePoolConfig {
  cardPriceCredits: Credits;
  /** Share of takings the room keeps rather than paying out, 0 to 0.5. */
  houseEdge: number;
  split: PrizeSplit;
  /** Paid even when takings alone would not cover it. */
  guaranteedMinimumCredits: Credits;
  /** Progressive jackpot carried between rounds, shown alongside. */
  jackpotCredits: Credits;
}

export const DEFAULT_PRIZE_POOL_CONFIG: PrizePoolConfig = {
  cardPriceCredits: 10,
  houseEdge: 0.1,
  split: DEFAULT_PRIZE_SPLIT,
  guaranteedMinimumCredits: 0,
  jackpotCredits: 0,
};

export interface PrizeBreakdown {
  /** Everything taken in from card sales. */
  takingsCredits: Credits;
  /** What is actually shared out, after the house edge and the guarantee. */
  distributedCredits: Credits;
  /** Topped up from the guarantee because sales did not cover it. */
  subsidisedCredits: Credits;
  cardsSold: number;
  perTier: Record<BingoPrizeTier, Credits>;
  jackpotCredits: Credits;
}

export function normaliseSplit(split: PrizeSplit): PrizeSplit {
  const total = BINGO_PRIZE_TIERS.reduce((sum, tier) => sum + Math.max(0, split[tier]), 0);
  if (total <= 0) return { ...DEFAULT_PRIZE_SPLIT };
  const normalised = {} as PrizeSplit;
  for (const tier of BINGO_PRIZE_TIERS) normalised[tier] = Math.max(0, split[tier]) / total;
  return normalised;
}

export function computePrizePool(cardsSold: number, config: PrizePoolConfig): PrizeBreakdown {
  const cards = Math.max(0, Math.floor(cardsSold));
  const takings = cards * Math.max(0, config.cardPriceCredits);
  const edge = Math.min(0.5, Math.max(0, config.houseEdge));

  const afterEdge = Math.floor(takings * (1 - edge));
  const guaranteed = Math.max(0, Math.floor(config.guaranteedMinimumCredits));
  // A guarantee is a promise the room keeps out of its own pocket when sales
  // fall short; it never reduces a pot that already exceeds it.
  const distributed = Math.max(afterEdge, cards > 0 ? guaranteed : 0);

  const split = normaliseSplit(config.split);
  const perTier = {} as Record<BingoPrizeTier, Credits>;
  let assigned = 0;

  // Everything but the last tier is floored; the remainder lands on BINGO, so
  // the parts always sum to exactly the distributed pot.
  for (const tier of BINGO_PRIZE_TIERS) {
    if (tier === 'BINGO') continue;
    const share = Math.floor(distributed * split[tier]);
    perTier[tier] = share;
    assigned += share;
  }
  perTier.BINGO = Math.max(0, distributed - assigned);

  return {
    takingsCredits: takings,
    distributedCredits: distributed,
    subsidisedCredits: Math.max(0, distributed - afterEdge),
    cardsSold: cards,
    perTier,
    jackpotCredits: Math.max(0, Math.floor(config.jackpotCredits)),
  };
}

/**
 * What one player would win at each tier, if they claimed it right now.
 *
 * A tier is shared between everyone who claims it in the same call, so the
 * honest figure to show is the prize divided by the claimants — but before the
 * game starts nobody has claimed anything, so this is the prize for a sole
 * winner. Shown as "se vincessi adesso", not as a promise.
 */
export function potentialWin(
  breakdown: PrizeBreakdown,
  tier: BingoPrizeTier,
  claimants = 1,
): Credits {
  const prize = breakdown.perTier[tier];
  return Math.floor(prize / Math.max(1, claimants));
}

/**
 * How much the pot would grow if `extraCards` more were sold.
 *
 * Drives the bar showing what happens when more players arrive, which is the
 * whole reason the panel is worth looking at during the purchase phase.
 */
export function projectedPool(
  cardsSold: number,
  extraCards: number,
  config: PrizePoolConfig,
): PrizeBreakdown {
  return computePrizePool(cardsSold + Math.max(0, extraCards), config);
}

/** Splits a tier prize between joint winners without losing a credit. */
export function shareBetween(prize: Credits, winners: number): Credits[] {
  const count = Math.max(1, Math.floor(winners));
  const base = Math.floor(prize / count);
  const remainder = prize - base * count;
  // The remainder goes to the earliest claimants rather than evaporating.
  return Array.from({ length: count }, (_value, index) => base + (index < remainder ? 1 : 0));
}
