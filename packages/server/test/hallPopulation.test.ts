import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NPC_DENSITY,
  HALL_CAPACITY,
  HALL_SEATS,
  HALL_TABLES,
  MAX_OCCUPANCY,
  MIN_OCCUPANCY,
  SEATS_PER_TABLE,
  SeatRegistry,
  crowdFor,
  npcCardCount,
  npcCardTotal,
  occupancyAt,
} from '@bingo/shared';

/**
 * The size of the hall, and how full it is.
 *
 * A room that seats forty reads as a meeting room with a stage in it, and a
 * crowd that never changes is scenery. Both are asserted here because both are
 * things a screenshot flatters and a player notices.
 */

const at = (hour: number, minute = 0) => new Date(2026, 7, 6, hour, minute, 0);

describe('the hall', () => {
  it('seats at least five hundred', () => {
    expect(HALL_SEATS.length).toBeGreaterThanOrEqual(500);
    expect(HALL_SEATS.length).toBe(HALL_CAPACITY);
  });

  it('gives every table at least eight chairs', () => {
    expect(SEATS_PER_TABLE).toBeGreaterThanOrEqual(8);
    for (const table of HALL_TABLES) {
      expect(table.seatCount, `table ${table.label}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('has a seat for every chair it claims', () => {
    const claimed = HALL_TABLES.reduce((sum, table) => sum + table.seatCount, 0);
    expect(HALL_SEATS.length).toBe(claimed);
  });

  it('keeps every seat id unique across five hundred of them', () => {
    expect(new Set(HALL_SEATS.map((seat) => seat.id)).size).toBe(HALL_SEATS.length);
  });

  it('spaces tables far enough apart that their chair rings do not overlap', () => {
    // Two tables whose rings intersect would put one chair inside another.
    for (let a = 0; a < HALL_TABLES.length; a += 1) {
      for (let b = a + 1; b < HALL_TABLES.length; b += 1) {
        const first = HALL_TABLES[a]!;
        const second = HALL_TABLES[b]!;
        const gap = Math.hypot(first.x - second.x, first.z - second.z);
        expect(gap, `tables ${first.label} and ${second.label}`).toBeGreaterThan(2 * 2.05);
      }
    }
  });

  it('lets a player sit in any free chair, all five hundred of them', () => {
    // The brief asks for exactly this: every empty seat is a seat you can take.
    const registry = new SeatRegistry();
    let seated = 0;
    for (const seat of HALL_SEATS) {
      if (registry.claim(seat.id, `p${seated}`, `P${seated}`, 'PLAYER', 1_000).ok) seated += 1;
    }
    expect(seated).toBe(HALL_SEATS.length);
  });
});

describe('how full it is', () => {
  it('is never empty and never completely full', () => {
    // An empty hall looks broken; a full one cannot be joined.
    for (let hour = 0; hour < 24; hour += 1) {
      const share = occupancyAt(at(hour));
      expect(share, `${hour}:00`).toBeGreaterThanOrEqual(MIN_OCCUPANCY);
      expect(share, `${hour}:00`).toBeLessThanOrEqual(MAX_OCCUPANCY);
    }
  });

  it('fills up in the evening and empties overnight', () => {
    expect(occupancyAt(at(20))).toBeGreaterThan(occupancyAt(at(15)));
    expect(occupancyAt(at(15))).toBeGreaterThan(occupancyAt(at(3)));
  });

  it('changes smoothly rather than in steps on the hour', () => {
    // Forty guests appearing at the stroke of the hour reads as a bug.
    const before = occupancyAt(at(19, 59));
    const after = occupancyAt(at(20, 1));
    expect(Math.abs(after - before)).toBeLessThan(0.01);
  });

  it('varies from round to round at the same moment', () => {
    const counts = new Set(
      Array.from({ length: 20 }, (_v, index) => crowdFor(`round-${index}`, at(20)).npcCount),
    );
    expect(counts.size).toBeGreaterThan(5);
  });

  it('never seats more people than there are chairs', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const density of [0.5, 1, 4, 50]) {
        const crowd = crowdFor(`h${hour}d${density}`, at(hour), { density });
        expect(crowd.totalPresent).toBeLessThanOrEqual(HALL_CAPACITY);
        expect(crowd.npcCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('leaves room for the real players already present', () => {
    const crowd = crowdFor('busy', at(20), { humans: 12 });
    expect(crowd.totalPresent).toBeGreaterThanOrEqual(12);
    expect(crowd.npcCount + 12).toBe(crowd.totalPresent);
  });

  it('never fills a room past its own capacity with humans alone', () => {
    const crowd = crowdFor('packed', at(4), { humans: HALL_CAPACITY });
    expect(crowd.npcCount).toBe(0);
    expect(crowd.totalPresent).toBe(HALL_CAPACITY);
  });

  it('respects a room owner turning guests down or off', () => {
    expect(crowdFor('quiet', at(20), { maxNpcs: 0 }).npcCount).toBe(0);
    const capped = crowdFor('capped', at(20), { maxNpcs: 30 });
    expect(capped.npcCount).toBeLessThanOrEqual(30);
  });

  it('is reproducible from its seed', () => {
    const first = crowdFor('same', at(20));
    const again = crowdFor('same', at(20));
    expect(again).toEqual(first);
  });
});

describe('what the crowd bought', () => {
  it('gives everyone at least one card and nobody an absurd pile', () => {
    for (let index = 0; index < 500; index += 1) {
      const cards = npcCardCount('seed', index);
      expect(cards).toBeGreaterThanOrEqual(1);
      expect(cards).toBeLessThanOrEqual(6);
    }
  });

  it('is skewed rather than uniform, so the pot does not grow linearly', () => {
    const counts = new Map<number, number>();
    for (let index = 0; index < 2_000; index += 1) {
      const cards = npcCardCount('spread', index);
      counts.set(cards, (counts.get(cards) ?? 0) + 1);
    }
    // One card must be much commoner than six, or everyone buys the same and
    // the crowd stops being a crowd of individuals.
    expect(counts.get(1)!).toBeGreaterThan((counts.get(6) ?? 0) * 4);
  });

  it('totals what the individual draws add up to', () => {
    const manual = Array.from({ length: 40 }, (_v, i) => npcCardCount('t', i)).reduce(
      (sum, value) => sum + value,
      0,
    );
    expect(npcCardTotal('t', 40)).toBe(manual);
  });

  it('buys more cards when more guests are present', () => {
    expect(npcCardTotal('x', 200)).toBeGreaterThan(npcCardTotal('x', 20));
  });
});

describe('the crowd the room actually seats', () => {
  /**
   * These guard the wiring, not the arithmetic.
   *
   * `crowdFor` was written, tested and then never called: the room seated a
   * fixed `npcCount` capped at six, so a hall with 512 chairs held about two
   * dozen people whatever the hour. The numbers below are the ones a player
   * sees, so they are asserted against the capacity of the room rather than
   * against a literal.
   */
  const density = (notch: number) => notch / DEFAULT_NPC_DENSITY;

  it('fills a real fraction of the hall at the neutral setting', () => {
    // Evening: the hall should be visibly busy, not a handful of guests.
    const crowd = crowdFor('round-1', new Date('2026-08-06T20:30:00'), {
      density: density(DEFAULT_NPC_DENSITY),
    });
    expect(crowd.npcCount).toBeGreaterThan(HALL_CAPACITY * 0.4);
    expect(crowd.npcCount).toBeLessThanOrEqual(HALL_CAPACITY);
  });

  it('is still a room and not a cathedral at three in the morning', () => {
    const crowd = crowdFor('round-1', new Date('2026-08-06T03:00:00'), {
      density: density(DEFAULT_NPC_DENSITY),
    });
    expect(crowd.npcCount).toBeGreaterThan(0);
    expect(crowd.npcCount).toBeLessThan(HALL_CAPACITY * 0.2);
  });

  it('follows the host dial in both directions', () => {
    const at = new Date('2026-08-06T20:30:00');
    const counts = [0, 1, 3, 5, 6].map(
      (notch) => crowdFor('round-1', at, { density: density(notch) }).npcCount,
    );
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]!, `notch ${index}`).toBeGreaterThanOrEqual(counts[index - 1]!);
    }
    // The bottom notch is an empty hall, which is what the label promises.
    expect(counts[0]).toBeLessThan(counts[2]!);
    expect(counts.at(-1)!).toBeGreaterThan(counts[2]!);
  });

  it('never seats a guest in a chair a player needs', () => {
    // The room admits one client per chair; guests must give way to all of them.
    const crowd = crowdFor('round-1', new Date('2026-08-06T21:00:00'), {
      humans: 40,
      density: density(6),
      maxNpcs: HALL_CAPACITY - 40,
    });
    expect(crowd.npcCount + 40).toBeLessThanOrEqual(HALL_CAPACITY);
  });

  it('leaves the hall alone when a full house of players turns up', () => {
    const crowd = crowdFor('round-1', new Date('2026-08-06T21:00:00'), {
      humans: HALL_CAPACITY,
      density: density(6),
      maxNpcs: 0,
    });
    expect(crowd.npcCount).toBe(0);
  });
});
