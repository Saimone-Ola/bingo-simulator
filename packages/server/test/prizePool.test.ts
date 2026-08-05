import { describe, expect, it } from 'vitest';
import {
  BINGO_PRIZE_TIERS,
  DEFAULT_PRIZE_POOL_CONFIG,
  DEFAULT_PRIZE_SPLIT,
  computePrizePool,
  normaliseSplit,
  potentialWin,
  projectedPool,
  shareBetween,
  type PrizePoolConfig,
} from '@bingo/shared';

const config: PrizePoolConfig = { ...DEFAULT_PRIZE_POOL_CONFIG };

function total(perTier: Record<string, number>): number {
  return Object.values(perTier).reduce((sum, value) => sum + value, 0);
}

describe('prize pool', () => {
  it('pays out exactly what it takes in, less the house edge', () => {
    // The invariant that matters: the parts sum to the whole. Splitting an
    // integer pot by percentages does not give integers, and a naive round
    // would either overpay the room or leak credits into nothing.
    for (const cards of [0, 1, 3, 7, 13, 50, 137, 1_000]) {
      const pool = computePrizePool(cards, config);
      expect(total(pool.perTier), `${cards} cards`).toBe(pool.distributedCredits);
    }
  });

  it('never distributes more than it took', () => {
    for (let cards = 0; cards < 200; cards += 1) {
      const pool = computePrizePool(cards, config);
      expect(pool.distributedCredits).toBeLessThanOrEqual(pool.takingsCredits);
    }
  });

  it('grows the pot with every card sold', () => {
    let previous = -1;
    for (let cards = 0; cards <= 100; cards += 1) {
      const pool = computePrizePool(cards, config);
      expect(pool.distributedCredits).toBeGreaterThanOrEqual(previous);
      previous = pool.distributedCredits;
    }
  });

  it('gives the remainder to the top prize rather than losing it', () => {
    // 7 cards at 10 credits with a 10% edge is 63, which no split divides
    // cleanly; the dust has to land somewhere accountable.
    const pool = computePrizePool(7, config);
    expect(pool.distributedCredits).toBe(63);
    expect(total(pool.perTier)).toBe(63);
  });

  it('keeps a guarantee as a floor, never a ceiling', () => {
    const guaranteed: PrizePoolConfig = { ...config, guaranteedMinimumCredits: 500 };

    const thin = computePrizePool(1, guaranteed);
    expect(thin.distributedCredits).toBe(500);
    expect(thin.subsidisedCredits).toBeGreaterThan(0);
    expect(total(thin.perTier)).toBe(500);

    const rich = computePrizePool(500, guaranteed);
    expect(rich.distributedCredits).toBeGreaterThan(500);
    expect(rich.subsidisedCredits).toBe(0);
  });

  it('pays nothing at all when nothing was sold', () => {
    const empty = computePrizePool(0, { ...config, guaranteedMinimumCredits: 500 });
    expect(empty.distributedCredits).toBe(0);
    expect(total(empty.perTier)).toBe(0);
  });

  it('has a tier for every tier, always', () => {
    const pool = computePrizePool(40, config);
    for (const tier of BINGO_PRIZE_TIERS) {
      expect(pool.perTier[tier], tier).toBeGreaterThanOrEqual(0);
    }
  });

  it('makes bingo the largest prize under the default split', () => {
    const pool = computePrizePool(100, config);
    for (const tier of BINGO_PRIZE_TIERS) {
      if (tier === 'BINGO') continue;
      expect(pool.perTier.BINGO).toBeGreaterThan(pool.perTier[tier]);
    }
  });
});

describe('configuration', () => {
  it('normalises a split that does not sum to one', () => {
    const doubled = normaliseSplit(
      Object.fromEntries(
        BINGO_PRIZE_TIERS.map((tier) => [tier, DEFAULT_PRIZE_SPLIT[tier] * 2]),
      ) as typeof DEFAULT_PRIZE_SPLIT,
    );
    for (const tier of BINGO_PRIZE_TIERS) {
      expect(doubled[tier]).toBeCloseTo(DEFAULT_PRIZE_SPLIT[tier], 10);
    }
  });

  it('falls back rather than dividing by zero on an empty split', () => {
    const zeroed = normaliseSplit(
      Object.fromEntries(BINGO_PRIZE_TIERS.map((tier) => [tier, 0])) as typeof DEFAULT_PRIZE_SPLIT,
    );
    expect(zeroed).toEqual(DEFAULT_PRIZE_SPLIT);
  });

  it('clamps a house edge a room owner should not be able to set', () => {
    const greedy = computePrizePool(100, { ...config, houseEdge: 5 });
    // Half is the most the room may keep, whatever was configured.
    expect(greedy.distributedCredits).toBe(500);

    const generous = computePrizePool(100, { ...config, houseEdge: -3 });
    expect(generous.distributedCredits).toBe(1_000);
  });

  it('ignores a negative or fractional card count', () => {
    expect(computePrizePool(-5, config).cardsSold).toBe(0);
    expect(computePrizePool(3.7, config).cardsSold).toBe(3);
  });
});

describe('what a player sees', () => {
  it('shows a sole winner the whole tier prize', () => {
    const pool = computePrizePool(40, config);
    expect(potentialWin(pool, 'BINGO')).toBe(pool.perTier.BINGO);
  });

  it('divides the figure when several would claim together', () => {
    const pool = computePrizePool(40, config);
    expect(potentialWin(pool, 'BINGO', 3)).toBe(Math.floor(pool.perTier.BINGO / 3));
  });

  it('projects a bigger pot when more players arrive', () => {
    const now = computePrizePool(10, config);
    const later = projectedPool(10, 20, config);
    expect(later.distributedCredits).toBeGreaterThan(now.distributedCredits);
  });
});

describe('joint winners', () => {
  it('splits a prize without losing or inventing a credit', () => {
    for (const prize of [0, 1, 7, 100, 1_001]) {
      for (const winners of [1, 2, 3, 7]) {
        const shares = shareBetween(prize, winners);
        expect(shares).toHaveLength(winners);
        expect(shares.reduce((sum, value) => sum + value, 0), `${prize}/${winners}`).toBe(prize);
      }
    }
  });

  it('gives the odd credit to the earliest claimant', () => {
    expect(shareBetween(10, 3)).toEqual([4, 3, 3]);
  });

  it('treats a nonsense winner count as one winner', () => {
    expect(shareBetween(50, 0)).toEqual([50]);
  });
});
