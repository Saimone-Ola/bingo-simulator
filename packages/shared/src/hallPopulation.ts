/**
 * How full the hall is, and how much everyone bought.
 *
 * A hall that is always the same size is scenery. This decides how many guests
 * are present and how many cards each holds, and it varies with the time of day
 * and with the round, so a player who comes back at nine in the evening finds a
 * different room from the one they left at three in the afternoon.
 *
 * Guests are not a decoration bolted on beside the game. They occupy real seats
 * from the same registry players do, they buy cards through the same pot, and
 * they draw from the same numbers — which is why this is a shared, deterministic
 * function rather than a client-side sprinkle. The server decides the crowd, and
 * the crowd is part of the round.
 */

import { HALL_SEATS } from './bingoSeating';

/**
 * Seats the hall physically has.
 *
 * Derived, not typed in. It was a literal 512 with a note about a circular
 * import — there is no cycle, `bingoSeating` imports nothing from here — and a
 * hand-copied capacity is exactly the sort of number that survives a resize of
 * the thing it is supposed to describe.
 */
export const HALL_CAPACITY = HALL_SEATS.length;

/**
 * The crowd dial's neutral notch.
 *
 * A host setting of this value means "leave the hall as busy as it would
 * normally be"; below thins it out, above packs it. Shared so the client's
 * slider and the server's arithmetic cannot disagree about which notch is
 * neutral.
 */
export const DEFAULT_NPC_DENSITY = 3;

/**
 * Fraction of capacity occupied at each hour, local time.
 *
 * Shaped like a real venue: dead in the small hours, a lunchtime bump, and a
 * long evening peak. Never zero — an empty hall is a broken-looking hall — and
 * never full, because a room with no free seat is one a player cannot join.
 */
const HOURLY_OCCUPANCY: readonly number[] = [
  0.06, 0.04, 0.03, 0.03, 0.03, 0.04, // 00–05
  0.08, 0.14, 0.2, 0.26, 0.32, 0.38, // 06–11
  0.46, 0.44, 0.38, 0.36, 0.42, 0.52, // 12–17
  0.64, 0.76, 0.84, 0.8, 0.62, 0.3, // 18–23
];

/** Most and least of the hall that may ever be occupied. */
export const MIN_OCCUPANCY = 0.03;
export const MAX_OCCUPANCY = 0.88;

export interface CrowdShape {
  /** Guests to seat, real players included. */
  totalPresent: number;
  /** Of those, how many are guests the room brings itself. */
  npcCount: number;
  /** Cards the guests hold in total, which feeds the pot. */
  npcCards: number;
}

function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0) / 0x100000000;
}

/**
 * Interpolated occupancy, so the room fills and empties smoothly.
 *
 * Stepping between hourly figures would make forty guests appear at the stroke
 * of the hour, which is exactly the kind of thing that reads as a bug.
 */
export function occupancyAt(date: Date): number {
  const hour = date.getHours();
  const progress = date.getMinutes() / 60;
  const current = HOURLY_OCCUPANCY[hour] ?? 0.3;
  const next = HOURLY_OCCUPANCY[(hour + 1) % 24] ?? current;
  return current + (next - current) * progress;
}

export interface CrowdOptions {
  capacity?: number;
  /** Real players already in the room; guests fill in around them. */
  humans?: number;
  /** Multiplier a room owner sets, from a quiet room to a packed one. */
  density?: number;
  /** Hard cap a room owner sets on guests. */
  maxNpcs?: number;
}

/**
 * Works out the crowd for one round.
 *
 * Deterministic in `seed`, so the server and any replay agree, and so a round
 * can be reproduced when someone asks why the hall was that full.
 */
export function crowdFor(seed: string, at: Date, options: CrowdOptions = {}): CrowdShape {
  const capacity = Math.max(1, Math.floor(options.capacity ?? HALL_CAPACITY));
  const humans = Math.max(0, Math.floor(options.humans ?? 0));
  const density = Math.max(0, options.density ?? 1);

  // Round to round wobble, so two rounds an hour apart are not identical.
  const jitter = 0.82 + hash(`${seed}:crowd`) * 0.36;
  const share = Math.min(
    MAX_OCCUPANCY,
    Math.max(MIN_OCCUPANCY, occupancyAt(at) * density * jitter),
  );

  const totalPresent = Math.min(capacity, Math.max(humans, Math.round(capacity * share)));
  const cap = options.maxNpcs ?? capacity;
  const npcCount = Math.max(0, Math.min(totalPresent - humans, Math.floor(cap)));

  return { totalPresent, npcCount, npcCards: npcCardTotal(seed, npcCount) };
}

/**
 * How many cards one guest buys.
 *
 * Most people buy one or two; a few buy the full sestina. The distribution is
 * deliberately skewed rather than uniform, because a uniform one produces a pot
 * that grows suspiciously linearly with the crowd.
 */
export function npcCardCount(seed: string, index: number): number {
  const roll = hash(`${seed}:cards:${index}`);
  if (roll < 0.42) return 1;
  if (roll < 0.72) return 2;
  if (roll < 0.88) return 3;
  if (roll < 0.97) return 4;
  return 6;
}

export function npcCardTotal(seed: string, npcCount: number): number {
  let total = 0;
  for (let index = 0; index < npcCount; index += 1) total += npcCardCount(seed, index);
  return total;
}

/**
 * How many guests to draw at full detail.
 *
 * Five hundred articulated characters is not a frame budget any laptop has. The
 * nearest few dozen are drawn properly and the rest are simplified — the
 * renderer decides how, but the count is decided here so the server and the
 * client agree on what "full" means.
 */
export const DETAILED_GUEST_BUDGET = 28;
