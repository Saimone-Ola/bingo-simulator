/**
 * Turns a server snapshot into the people you actually see in the hall.
 *
 * Three kinds of body share the same seats: the local player, the other
 * connected players plus the server's NPCs, and purely decorative guests the
 * client adds to fill empty chairs. Only the first two exist for the server —
 * ambient guests never touch game state, they just stop the room feeling empty
 * during a two player thesis demo.
 */

import type { AvatarAppearance, BingoPlayerSummary, SeatOccupancy } from '@bingo/shared';
import type { CharacterPersonality } from '../ProceduralCharacter';
import { SEATS, freeSeats, type SeatPlacement } from './hallLayout';

export type OccupantKind = 'PLAYER' | 'NPC' | 'AMBIENT';

export interface HallOccupant {
  readonly id: string;
  readonly displayName: string;
  readonly appearance: AvatarAppearance;
  readonly kind: OccupantKind;
  readonly personality: CharacterPersonality;
  readonly seat: SeatPlacement;
  readonly ready: boolean;
  readonly cardCount: number;
  readonly isHost: boolean;
  readonly isLocal: boolean;
  /** Stable 0..1 value used to desynchronise idle animations. */
  readonly phase: number;
}

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  bodyType: 'neutral',
  skinTone: '#e5b795',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#8b7cf6',
  pantsColor: '#4a4585',
  heightCm: 174,
};

const PERSONALITIES: readonly CharacterPersonality[] = [
  'CALM',
  'NERVOUS',
  'LOUD',
  'LUCKY',
  'GRUMPY',
  'DISTRACTED',
  'PRANKSTER',
];

const AMBIENT_NAMES = [
  'Rosa',
  'Enzo',
  'Carla',
  'Pino',
  'Sandra',
  'Aldo',
  'Elvira',
  'Fabio',
  'Giulia',
  'Mimmo',
  'Nadia',
  'Sergio',
  'Wanda',
  'Tonino',
  'Iolanda',
  'Ciro',
] as const;

const AMBIENT_SKIN = ['#f3d1bd', '#e0b49a', '#c98f6b', '#9b6247', '#70432f', '#44291f'] as const;
const AMBIENT_HAIR = ['#17131d', '#2b2118', '#6b3b24', '#b96e38', '#e4c07a', '#8d5fce'] as const;
const AMBIENT_SHIRTS = [
  '#c2557a',
  '#3f8f80',
  '#4a7fb5',
  '#b8813c',
  '#7357bd',
  '#b5553f',
  '#4f9d5e',
  '#a8496f',
] as const;
const AMBIENT_PANTS = ['#2f2a61', '#3f3a52', '#243e62', '#48585c', '#4a3b46', '#332d39'] as const;
const AMBIENT_BODIES = ['neutral', 'slim', 'athletic', 'curvy'] as const;
const AMBIENT_HAIR_STYLES = ['short', 'buzz', 'bob', 'curly', 'long'] as const;

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647;
}

function pick<T>(values: readonly T[], seed: number, fallback: T): T {
  return values[seed % values.length] ?? fallback;
}

export function personalityFor(id: string): CharacterPersonality {
  return pick(PERSONALITIES, stableHash(id), 'CALM');
}

function ambientAppearance(seed: number): AvatarAppearance {
  return {
    bodyType: pick(AMBIENT_BODIES, seed, 'neutral'),
    skinTone: pick(AMBIENT_SKIN, Math.floor(seed / 3), '#e0b49a'),
    hairStyle: pick(AMBIENT_HAIR_STYLES, Math.floor(seed / 5), 'short'),
    hairColor: pick(AMBIENT_HAIR, Math.floor(seed / 7), '#2b2118'),
    shirtColor: pick(AMBIENT_SHIRTS, Math.floor(seed / 11), '#7357bd'),
    pantsColor: pick(AMBIENT_PANTS, Math.floor(seed / 13), '#332d39'),
    heightCm: 158 + (seed % 26),
  };
}

export interface OccupancyOptions {
  /** How many decorative guests to add, 0 disables them entirely. */
  readonly ambientCount: number;
  /** Seed so the same room always produces the same faces. */
  readonly roomSeed: string;
  /**
   * The seat the *server* says the local player is in, or null while standing.
   *
   * This module used to hand the local player a chair of its own choosing,
   * which was defensible when no one owned seating and is wrong now that the
   * room does: it meant a player was seated the instant they walked in, at a
   * table nobody had picked, with the camera starting in the middle of the
   * hall rather than at the door.
   */
  readonly mySeatId?: string | null;
  /** This client's own user id, to find itself in the seating chart. */
  readonly myUserId?: string | null;
}

export interface HallOccupancy {
  readonly occupants: readonly HallOccupant[];
  readonly localSeat: SeatPlacement | null;
  readonly seatByOccupant: ReadonlyMap<string, SeatPlacement>;
}

/**
 * Draws everyone where the server says they are, then tops the room up with
 * ambient guests.
 *
 * The seating chart is the authority. This module used to assign chairs itself
 * from the player list, which meant the hall drew people in seats the room had
 * never given them: the overlay map and the 3D floor disagreed about where you
 * were sitting, and two clients disagreed with each other. The registry that
 * settles who gets which chair is the same one drawn here.
 *
 * Drawing from the chart is also what makes a full hall affordable. A guest's
 * appearance is derived from their id rather than sent, so five hundred of them
 * cost one row each — a seat and a name — instead of a full player summary.
 */
export function buildOccupancy(
  players: readonly BingoPlayerSummary[],
  options: OccupancyOptions,
  seating: readonly SeatOccupancy[] = [],
): HallOccupancy {
  const occupants: HallOccupant[] = [];
  const taken = new Set<string>();
  const byUserId = new Map(players.map((player) => [player.userId, player]));
  const seatById = new Map(SEATS.map((seat) => [seat.id, seat]));

  for (const row of seating) {
    const seat = seatById.get(row.seatId);
    if (!seat) continue;
    const player = byUserId.get(row.occupantId);
    const isLocal = row.occupantId === options.myUserId;
    // A standing player has no chair to draw them in.
    if (isLocal && !options.mySeatId) continue;
    taken.add(seat.id);
    const seed = stableHash(row.occupantId);
    occupants.push({
      id: player?.sessionId ?? row.occupantId,
      displayName: row.displayName,
      // A guest the server only names gets a face derived from that name's id,
      // which is deterministic, so every client draws the same person.
      appearance: player?.appearance ?? (player ? DEFAULT_APPEARANCE : ambientAppearance(seed)),
      kind: row.kind === 'NPC' ? 'NPC' : 'PLAYER',
      personality: personalityFor(row.occupantId),
      seat,
      ready: player?.ready ?? true,
      cardCount: player?.cardCount ?? 1,
      isHost: player?.isHost ?? false,
      isLocal,
      phase: (seed % 1000) / 1000,
    });
  }

  const available = freeSeats(taken);
  const ambientCount = Math.max(0, Math.min(options.ambientCount, available.length));
  for (let index = 0; index < ambientCount; index += 1) {
    // Spread ambient guests over the free chairs instead of packing them into
    // the first table, which would leave half the hall visibly deserted.
    const stride = Math.max(1, Math.floor(available.length / Math.max(1, ambientCount)));
    const seat = available[(index * stride) % available.length];
    if (!seat) continue;
    const seed = stableHash(`${options.roomSeed}:${seat.id}`);
    occupants.push({
      id: `ambient-${seat.id}`,
      displayName: pick(AMBIENT_NAMES, seed, 'Ospite'),
      appearance: ambientAppearance(seed),
      kind: 'AMBIENT',
      personality: pick(PERSONALITIES, Math.floor(seed / 17), 'CALM'),
      seat,
      ready: true,
      cardCount: 1,
      isHost: false,
      isLocal: false,
      phase: (seed % 1000) / 1000,
    });
  }

  const seatByOccupant = new Map<string, SeatPlacement>(
    occupants.map((occupant) => [occupant.id, occupant.seat]),
  );
  const local = occupants.find((occupant) => occupant.isLocal);
  return { occupants, localSeat: local?.seat ?? null, seatByOccupant };
}
