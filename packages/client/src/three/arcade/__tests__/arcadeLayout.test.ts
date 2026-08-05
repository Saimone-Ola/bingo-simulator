import { describe, expect, it } from 'vitest';
import {
  ARCADE_BOUNDS,
  ARCADE_SPAWN,
  CABINETS,
  nearestCabinet,
  occupiedCabinets,
} from '../arcadeLayout';

/**
 * The arcade's geometry.
 *
 * The bug these were written after: on a fresh database the room had eleven
 * cabinets and zero machines, so every one of them offered "premi E" and then
 * answered "fuori servizio". Nothing was broken in the renderer — there was
 * simply nothing to play, and the room had no way to say so.
 */

describe('cabinet occupancy', () => {
  it('draws only the cabinets that have a machine', () => {
    expect(occupiedCabinets(0)).toHaveLength(0);
    expect(occupiedCabinets(3)).toHaveLength(3);
    expect(occupiedCabinets(CABINETS.length)).toHaveLength(CABINETS.length);
  });

  it('never draws more cabinets than the room has', () => {
    expect(occupiedCabinets(500)).toHaveLength(CABINETS.length);
    expect(occupiedCabinets(-4)).toHaveLength(0);
  });

  it('offers no interaction at all when the room is empty', () => {
    for (const cabinet of CABINETS) {
      expect(nearestCabinet(cabinet.standX, cabinet.standZ, 0)).toBeNull();
    }
  });

  it('offers an interaction only in front of an occupied cabinet', () => {
    const first = CABINETS[0]!;
    const last = CABINETS[CABINETS.length - 1]!;
    expect(nearestCabinet(first.standX, first.standZ, 1)?.index).toBe(first.index);
    expect(nearestCabinet(last.standX, last.standZ, 1)).toBeNull();
  });

  it('stays out of reach from the middle of the aisle', () => {
    expect(nearestCabinet(0, 0)).toBeNull();
  });
});

describe('room geometry', () => {
  it('spawns the player inside the walkable bounds', () => {
    expect(ARCADE_SPAWN.x).toBeGreaterThan(ARCADE_BOUNDS.minX);
    expect(ARCADE_SPAWN.x).toBeLessThan(ARCADE_BOUNDS.maxX);
    expect(ARCADE_SPAWN.z).toBeGreaterThan(ARCADE_BOUNDS.minZ);
    expect(ARCADE_SPAWN.z).toBeLessThan(ARCADE_BOUNDS.maxZ);
  });

  it('puts every standing spot inside the room', () => {
    for (const cabinet of CABINETS) {
      expect(cabinet.standX, `cabinet ${cabinet.index}`).toBeGreaterThan(ARCADE_BOUNDS.minX);
      expect(cabinet.standX, `cabinet ${cabinet.index}`).toBeLessThan(ARCADE_BOUNDS.maxX);
      expect(cabinet.standZ, `cabinet ${cabinet.index}`).toBeGreaterThan(ARCADE_BOUNDS.minZ);
      expect(cabinet.standZ, `cabinet ${cabinet.index}`).toBeLessThan(ARCADE_BOUNDS.maxZ);
    }
  });

  it('gives every cabinet a distinct index and position', () => {
    expect(new Set(CABINETS.map((c) => c.index)).size).toBe(CABINETS.length);
    expect(new Set(CABINETS.map((c) => `${c.x}:${c.z}`)).size).toBe(CABINETS.length);
  });

  it('indexes the cabinets in order, since machines are assigned by index', () => {
    CABINETS.forEach((cabinet, index) => expect(cabinet.index).toBe(index));
  });
});
