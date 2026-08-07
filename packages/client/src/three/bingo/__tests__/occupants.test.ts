import { describe, expect, it } from 'vitest';
import type { BingoPlayerSummary, SeatOccupancy } from '@bingo/shared';
import { SEATS } from '../hallLayout';
import { DEFAULT_APPEARANCE, buildOccupancy, personalityFor, stableHash } from '../occupants';

/**
 * Who is drawn, and in which chair.
 *
 * The seating chart is the server's. These tests exist because the hall used to
 * assign chairs itself from the player list: the 3D floor and the overlay map
 * disagreed about where you were sitting, and so did two clients looking at the
 * same room.
 */

function player(overrides: Partial<BingoPlayerSummary> & { sessionId: string }): BingoPlayerSummary {
  return {
    userId: overrides.sessionId,
    displayName: overrides.sessionId,
    level: 1,
    ready: false,
    cardCount: 0,
    markingMode: 'MANUAL',
    appearance: DEFAULT_APPEARANCE,
    isHost: false,
    isNpc: false,
    connected: true,
    loading: false,
    balance: 100,
    ...overrides,
  };
}

function seatedAt(occupantId: string, index: number, kind: SeatOccupancy['kind'] = 'PLAYER'): SeatOccupancy {
  return {
    seatId: SEATS[index]!.id,
    occupantId,
    displayName: occupantId,
    kind,
    disconnected: false,
  };
}

const options = { ambientCount: 6, roomSeed: 'TESI-2026', mySeatId: SEATS[0]!.id, myUserId: 'me' };

describe('buildOccupancy', () => {
  it('draws everyone the chart seats', () => {
    const players = [player({ sessionId: 'me', isHost: true }), player({ sessionId: 'other' })];
    const seating = [seatedAt('me', 0), seatedAt('other', 1), seatedAt('npc-1', 2, 'NPC')];
    const { occupants } = buildOccupancy(players, options, seating);
    for (const id of ['me', 'other', 'npc-1']) {
      expect(occupants.some((occupant) => occupant.id === id), id).toBe(true);
    }
  });

  it('puts each player in the chair the server gave them, not one of its own', () => {
    const seating = [seatedAt('other', 41)];
    const { occupants } = buildOccupancy([player({ sessionId: 'other' })], options, seating);
    expect(occupants.find((occupant) => occupant.id === 'other')?.seat.id).toBe(SEATS[41]!.id);
  });

  it('marks exactly one occupant as local and exposes their seat', () => {
    const seating = [seatedAt('me', 0), seatedAt('other', 1)];
    const { occupants, localSeat } = buildOccupancy(
      [player({ sessionId: 'me' }), player({ sessionId: 'other' })],
      options,
      seating,
    );
    expect(occupants.filter((occupant) => occupant.isLocal)).toHaveLength(1);
    expect(localSeat?.id).toBe(SEATS[0]!.id);
  });

  it('leaves a standing player out of the hall entirely', () => {
    // Standing means the camera is the body: drawing them in a chair as well
    // would put the player inside their own head.
    const { occupants, localSeat } = buildOccupancy(
      [player({ sessionId: 'me' })],
      { ...options, mySeatId: null },
      [seatedAt('me', 0)],
    );
    expect(occupants.some((occupant) => occupant.isLocal)).toBe(false);
    expect(localSeat).toBeNull();
  });

  it('never puts two occupants on the same chair', () => {
    const players = Array.from({ length: 12 }, (_value, index) => player({ sessionId: `p${index}` }));
    const seating = players.map((entry, index) => seatedAt(entry.sessionId, index));
    const { occupants } = buildOccupancy(
      players,
      { ambientCount: 20, roomSeed: 'x', myUserId: null, mySeatId: null },
      seating,
    );
    const seatIds = occupants.map((occupant) => occupant.seat.id);
    expect(new Set(seatIds).size).toBe(seatIds.length);
  });

  it('adds decorative guests only on chairs the server did not use', () => {
    const seating = [seatedAt('other', 3)];
    const { occupants } = buildOccupancy(
      [player({ sessionId: 'other' })],
      { ambientCount: 5, roomSeed: 'x', myUserId: null, mySeatId: null },
      seating,
    );
    const ambient = occupants.filter((occupant) => occupant.kind === 'AMBIENT');
    expect(ambient).toHaveLength(5);
    expect(ambient.some((occupant) => occupant.seat.id === SEATS[3]!.id)).toBe(false);
  });

  it('honours an ambient density of zero', () => {
    const { occupants } = buildOccupancy(
      [],
      { ambientCount: 0, roomSeed: 'x', myUserId: null, mySeatId: null },
      [],
    );
    expect(occupants).toHaveLength(0);
  });

  it('never asks for more guests than there are chairs', () => {
    const { occupants } = buildOccupancy(
      [],
      { ambientCount: 5_000, roomSeed: 'x', myUserId: null, mySeatId: null },
      [],
    );
    expect(occupants.length).toBeLessThanOrEqual(SEATS.length);
  });

  it('fills the whole hall when the server says it is full', () => {
    // The room admits one client per chair, so a full chart has to render.
    const seating = SEATS.map((_seat, index) => seatedAt(`guest-${index}`, index, 'NPC'));
    const { occupants } = buildOccupancy(
      [],
      { ambientCount: 0, roomSeed: 'x', myUserId: null, mySeatId: null },
      seating,
    );
    expect(occupants).toHaveLength(SEATS.length);
  });

  it('gives a guest the server only named a face, deterministically', () => {
    // NPCs are not sent as player summaries — five hundred of those is a
    // snapshot nobody wants to broadcast — so their appearance is derived from
    // their id, and every client has to derive the same one.
    const seating = [seatedAt('npc-7', 5, 'NPC')];
    const first = buildOccupancy([], { ambientCount: 0, roomSeed: 'x' }, seating);
    const second = buildOccupancy([], { ambientCount: 0, roomSeed: 'x' }, seating);
    const face = first.occupants[0]?.appearance;
    expect(face).toBeDefined();
    expect(face).toEqual(second.occupants[0]?.appearance);
    expect(face).not.toEqual(DEFAULT_APPEARANCE);
  });

  it('produces the same hall for the same room, so all clients agree', () => {
    const players = [player({ sessionId: 'me' })];
    const seating = [seatedAt('me', 0), seatedAt('npc-1', 9, 'NPC')];
    const first = buildOccupancy(players, options, seating);
    const second = buildOccupancy(players, options, seating);
    expect(first.occupants.map((occupant) => [occupant.id, occupant.seat.id])).toEqual(
      second.occupants.map((occupant) => [occupant.id, occupant.seat.id]),
    );
  });

  it('classifies server NPCs apart from real players', () => {
    const seating = [seatedAt('me', 0), seatedAt('npc-1', 1, 'NPC')];
    const { occupants } = buildOccupancy(
      [player({ sessionId: 'me' })],
      { ambientCount: 0, roomSeed: 'x', myUserId: 'me', mySeatId: SEATS[0]!.id },
      seating,
    );
    expect(occupants.find((occupant) => occupant.id === 'me')?.kind).toBe('PLAYER');
    expect(occupants.find((occupant) => occupant.id === 'npc-1')?.kind).toBe('NPC');
  });

  it('falls back to a default appearance rather than rendering nothing', () => {
    const broken = { ...player({ sessionId: 'other' }), appearance: undefined };
    const { occupants } = buildOccupancy(
      [broken as unknown as BingoPlayerSummary],
      { ambientCount: 0, roomSeed: 'x', myUserId: null, mySeatId: null },
      [seatedAt('other', 0)],
    );
    expect(occupants[0]?.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('ignores a chart row for a chair that does not exist', () => {
    const { occupants } = buildOccupancy(
      [],
      { ambientCount: 0, roomSeed: 'x', myUserId: null, mySeatId: null },
      [{ seatId: 'nowhere', occupantId: 'ghost', displayName: 'Ghost', kind: 'NPC', disconnected: false }],
    );
    expect(occupants).toHaveLength(0);
  });
});

describe('personality assignment', () => {
  it('is stable for a given session id', () => {
    expect(personalityFor('abc')).toBe(personalityFor('abc'));
  });

  it('spreads personalities across a crowd', () => {
    const found = new Set(
      Array.from({ length: 60 }, (_value, index) => personalityFor(`guest-${index}`)),
    );
    expect(found.size).toBeGreaterThan(3);
  });

  it('hashes ids into a non negative range', () => {
    for (const value of ['', 'a', 'session-1234', '🎲']) {
      expect(stableHash(value)).toBeGreaterThanOrEqual(0);
    }
  });
});
