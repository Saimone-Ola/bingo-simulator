import { describe, expect, it } from 'vitest';
import type { BingoPlayerSummary } from '@bingo/shared';
import { SEATS } from '../hallLayout';
import { DEFAULT_APPEARANCE, buildOccupancy, personalityFor, stableHash } from '../occupants';

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

const options = { ambientCount: 6, roomSeed: 'TESI-2026' };

describe('buildOccupancy', () => {
  it('seats every player and NPC the server reported', () => {
    const players = [
      player({ sessionId: 'me', isHost: true }),
      player({ sessionId: 'other' }),
      player({ sessionId: 'npc-1', isNpc: true }),
    ];
    const { occupants } = buildOccupancy(players, 'me', options);
    for (const summary of players) {
      expect(occupants.some((occupant) => occupant.id === summary.sessionId)).toBe(true);
    }
  });

  it('marks exactly one occupant as local and exposes their seat', () => {
    const { occupants, localSeat } = buildOccupancy(
      [player({ sessionId: 'me' }), player({ sessionId: 'other' })],
      'me',
      options,
    );
    expect(occupants.filter((occupant) => occupant.isLocal)).toHaveLength(1);
    expect(localSeat).not.toBeNull();
    expect(occupants.find((occupant) => occupant.isLocal)?.seat.id).toBe(localSeat?.id);
  });

  it('never puts two occupants on the same chair', () => {
    const players = Array.from({ length: 12 }, (_value, index) =>
      player({ sessionId: `p${index}` }),
    );
    const { occupants } = buildOccupancy(players, 'p0', { ambientCount: 20, roomSeed: 'x' });
    const seatIds = occupants.map((occupant) => occupant.seat.id);
    expect(new Set(seatIds).size).toBe(seatIds.length);
  });

  it('adds decorative guests only on chairs the server did not use', () => {
    const players = [player({ sessionId: 'me' })];
    const { occupants } = buildOccupancy(players, 'me', { ambientCount: 5, roomSeed: 'x' });
    const ambient = occupants.filter((occupant) => occupant.kind === 'AMBIENT');
    expect(ambient).toHaveLength(5);
    const serverSeat = occupants.find((occupant) => occupant.id === 'me')?.seat.id;
    expect(ambient.some((occupant) => occupant.seat.id === serverSeat)).toBe(false);
  });

  it('honours an ambient density of zero', () => {
    const { occupants } = buildOccupancy([player({ sessionId: 'me' })], 'me', {
      ambientCount: 0,
      roomSeed: 'x',
    });
    expect(occupants.filter((occupant) => occupant.kind === 'AMBIENT')).toHaveLength(0);
  });

  it('never asks for more guests than there are chairs', () => {
    const { occupants } = buildOccupancy([], '', { ambientCount: 500, roomSeed: 'x' });
    expect(occupants.length).toBeLessThanOrEqual(SEATS.length);
  });

  it('produces the same hall for the same room, so all clients agree', () => {
    const players = [player({ sessionId: 'me' }), player({ sessionId: 'npc-1', isNpc: true })];
    const first = buildOccupancy(players, 'me', options);
    const second = buildOccupancy(players, 'me', options);
    expect(first.occupants.map((occupant) => [occupant.id, occupant.seat.id])).toEqual(
      second.occupants.map((occupant) => [occupant.id, occupant.seat.id]),
    );
  });

  it('classifies server NPCs apart from real players', () => {
    const { occupants } = buildOccupancy(
      [player({ sessionId: 'me' }), player({ sessionId: 'npc-1', isNpc: true })],
      'me',
      { ambientCount: 0, roomSeed: 'x' },
    );
    expect(occupants.find((occupant) => occupant.id === 'me')?.kind).toBe('PLAYER');
    expect(occupants.find((occupant) => occupant.id === 'npc-1')?.kind).toBe('NPC');
  });

  it('falls back to a default appearance rather than rendering nothing', () => {
    const broken = player({ sessionId: 'me' });
    const { occupants } = buildOccupancy(
      [{ ...broken, appearance: undefined as unknown as BingoPlayerSummary['appearance'] }],
      'me',
      { ambientCount: 0, roomSeed: 'x' },
    );
    expect(occupants[0]?.appearance).toEqual(DEFAULT_APPEARANCE);
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
