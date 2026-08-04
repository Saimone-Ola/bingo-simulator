/**
 * Turns a server snapshot into the people you actually see in the hall.
 *
 * Three kinds of body share the same seats: the local player, the other
 * connected players plus the server's NPCs, and purely decorative guests the
 * client adds to fill empty chairs. Only the first two exist for the server —
 * ambient guests never touch game state, they just stop the room feeling empty
 * during a two player thesis demo.
 */

import type { AvatarAppearance, BingoPlayerSummary } from '@bingo/shared';
import type { CharacterPersonality } from '../ProceduralCharacter';
import { assignSeats, freeSeats, type SeatPlacement } from './hallLayout';

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
}

export interface HallOccupancy {
  readonly occupants: readonly HallOccupant[];
  readonly localSeat: SeatPlacement | null;
  readonly seatByOccupant: ReadonlyMap<string, SeatPlacement>;
}

/**
 * Seats everyone the server knows about, then tops the room up with ambient
 * guests. Server occupants always come first so a real player never loses their
 * chair to a decoration when the ambient density changes.
 */
export function buildOccupancy(
  players: readonly BingoPlayerSummary[],
  mySessionId: string,
  options: OccupancyOptions,
): HallOccupancy {
  const seatAssignment = assignSeats(players.map((player) => player.sessionId));
  const occupants: HallOccupant[] = [];
  const taken = new Set<string>();

  for (const player of players) {
    const seat = seatAssignment.get(player.sessionId);
    if (!seat) continue;
    taken.add(seat.id);
    occupants.push({
      id: player.sessionId,
      displayName: player.displayName,
      appearance: player.appearance ?? DEFAULT_APPEARANCE,
      kind: player.isNpc ? 'NPC' : 'PLAYER',
      personality: personalityFor(player.sessionId),
      seat,
      ready: player.ready,
      cardCount: player.cardCount,
      isHost: player.isHost,
      isLocal: player.sessionId === mySessionId,
      phase: (stableHash(player.sessionId) % 1000) / 1000,
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
