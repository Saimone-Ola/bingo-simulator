import { describe, expect, it } from 'vitest';
import { HALL_SEATS } from '@bingo/shared';
import {
  CROWD_BUDGETS,
  FULL_RADIUS,
  SIMPLE_RADIUS,
  budgetFor,
  selectCrowdTiers,
  type CrowdCandidate,
} from '../crowdLod';

/**
 * Crowd level of detail.
 *
 * The hall seats 512. Drawing 512 articulated characters is not a frame budget
 * any laptop has, so the question this answers is which ones are worth the
 * cost — and the answer has to hold for a viewer anywhere in the room, not just
 * the one spot someone happened to screenshot.
 */

/** One candidate per seat, which is the worst case: a completely full hall. */
const everySeat: CrowdCandidate[] = HALL_SEATS.map((seat) => ({
  id: seat.id,
  x: seat.x,
  z: seat.z,
}));

describe('tiering', () => {
  it('accounts for every guest exactly once', () => {
    const { full, simple, instanced } = selectCrowdTiers(everySeat, 0, 0);
    expect(full.length + simple.length + instanced.length).toBe(everySeat.length);

    const ids = [...full, ...simple, ...instanced].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(everySeat.length);
  });

  it('never exceeds the budget, wherever the viewer stands', () => {
    // A full hall around a viewer in the middle is the worst case there is.
    for (const [x, z] of [
      [0, 0],
      [-18, -14],
      [18, 22],
      [0, 30],
    ]) {
      const tiers = selectCrowdTiers(everySeat, x!, z!, { fullBudget: 28, simpleBudget: 120 });
      expect(tiers.full.length, `at ${x},${z}`).toBeLessThanOrEqual(28);
      expect(tiers.simple.length, `at ${x},${z}`).toBeLessThanOrEqual(120);
    }
  });

  it('gives the nearest guests the full treatment', () => {
    const seat = HALL_SEATS[0]!;
    const tiers = selectCrowdTiers(everySeat, seat.x, seat.z);
    expect(tiers.full[0]?.id).toBe(seat.id);
  });

  it('never promotes someone far away just because the budget has room', () => {
    // Standing alone in a corner must not pull thirty distant guests into full
    // detail: distance decides the tier and the budget only ever demotes.
    const far: CrowdCandidate[] = [{ id: 'far', x: 100, z: 100 }];
    const tiers = selectCrowdTiers(far, 0, 0, { fullBudget: 50 });
    expect(tiers.full).toHaveLength(0);
    expect(tiers.instanced).toHaveLength(1);
  });

  it('puts guests in the tier their distance says', () => {
    const candidates: CrowdCandidate[] = [
      { id: 'near', x: 1, z: 0 },
      { id: 'mid', x: (FULL_RADIUS + SIMPLE_RADIUS) / 2, z: 0 },
      { id: 'far', x: SIMPLE_RADIUS + 5, z: 0 },
    ];
    const tiers = selectCrowdTiers(candidates, 0, 0);
    expect(tiers.full.map((e) => e.id)).toEqual(['near']);
    expect(tiers.simple.map((e) => e.id)).toEqual(['mid']);
    expect(tiers.instanced.map((e) => e.id)).toEqual(['far']);
  });

  it('demotes rather than drops when the budget is tight', () => {
    const tiers = selectCrowdTiers(everySeat, 0, 8, { fullBudget: 3, simpleBudget: 5 });
    expect(tiers.full).toHaveLength(3);
    expect(tiers.simple).toHaveLength(5);
    // Nobody vanished: the rest became instances.
    expect(tiers.instanced.length).toBe(everySeat.length - 8);
  });

  it('copes with an empty room', () => {
    const tiers = selectCrowdTiers([], 0, 0);
    expect(tiers.full).toEqual([]);
    expect(tiers.simple).toEqual([]);
    expect(tiers.instanced).toEqual([]);
  });
});

describe('quality settings', () => {
  it('draws nobody at full detail on the lowest setting', () => {
    // A machine that cannot hold the frame rate is better served by a room
    // visibly full of simple people than by eight good ones and a slideshow.
    expect(CROWD_BUDGETS.LOW!.fullBudget).toBe(0);
    const tiers = selectCrowdTiers(everySeat, 0, 8, budgetFor('LOW'));
    expect(tiers.full).toHaveLength(0);
    expect(tiers.simple.length).toBeGreaterThan(0);
  });

  it('spends more as the setting rises', () => {
    const budgets = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'].map((q) => budgetFor(q).fullBudget ?? 0);
    for (let index = 1; index < budgets.length; index += 1) {
      expect(budgets[index]!).toBeGreaterThan(budgets[index - 1]!);
    }
  });

  it('falls back rather than drawing nothing for an unknown setting', () => {
    expect(budgetFor('NONSENSE')).toEqual(CROWD_BUDGETS.MEDIUM);
  });

  it('keeps the whole hall drawable at every setting', () => {
    for (const quality of ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']) {
      const tiers = selectCrowdTiers(everySeat, 0, 8, budgetFor(quality));
      expect(
        tiers.full.length + tiers.simple.length + tiers.instanced.length,
        quality,
      ).toBe(everySeat.length);
    }
  });
});
