import { describe, expect, it } from 'vitest';
import {
  HALL_BOUNDS,
  HALL_COLLIDERS,
  PLAYER_RADIUS,
  RECEPTION,
  SEATS,
  SEAT_RING_RADIUS,
  SPAWN,
  STAGE,
  TABLES,
  assignSeats,
  freeSeats,
  isNearReception,
  nearestSeat,
  standingSpotForSeat,
} from '../hallLayout';
import { resolveCollisions } from '../movement';

describe('hall geometry', () => {
  it('keeps every chair inside the walkable floor', () => {
    for (const seat of SEATS) {
      expect(seat.x).toBeGreaterThan(HALL_BOUNDS.minX);
      expect(seat.x).toBeLessThan(HALL_BOUNDS.maxX);
      expect(seat.z).toBeGreaterThan(HALL_BOUNDS.minZ);
      expect(seat.z).toBeLessThan(HALL_BOUNDS.maxZ);
    }
  });

  it('keeps chairs off the stage platform', () => {
    for (const seat of SEATS) {
      const onStage =
        seat.x > STAGE.minX && seat.x < STAGE.maxX && seat.z > STAGE.minZ && seat.z < STAGE.maxZ;
      expect(onStage).toBe(false);
    }
  });

  it('spaces chairs radially around their own table', () => {
    for (const table of TABLES) {
      const seats = SEATS.filter((seat) => seat.tableIndex === table.index);
      expect(seats).toHaveLength(table.seatCount);
      for (const seat of seats) {
        expect(Math.hypot(seat.x - table.x, seat.z - table.z)).toBeCloseTo(SEAT_RING_RADIUS, 6);
      }
      const angles = seats.map((seat) => seat.seatIndex);
      expect(new Set(angles).size).toBe(table.seatCount);
    }
  });

  it('turns every occupant towards the middle of their table', () => {
    for (const seat of SEATS) {
      const table = TABLES[seat.tableIndex];
      expect(table).toBeDefined();
      if (!table) continue;
      // `facing` rotates a model whose front is +Z.
      const forwardX = Math.sin(seat.facing);
      const forwardZ = Math.cos(seat.facing);
      const toTableX = table.x - seat.x;
      const toTableZ = table.z - seat.z;
      const length = Math.hypot(toTableX, toTableZ);
      expect(forwardX * (toTableX / length) + forwardZ * (toTableZ / length)).toBeCloseTo(1, 5);
    }
  });

  it('spawns the player somewhere they are not already stuck in an obstacle', () => {
    const resolved = resolveCollisions(SPAWN.x, SPAWN.z, HALL_COLLIDERS);
    expect(resolved.x).toBeCloseTo(SPAWN.x, 6);
    expect(resolved.z).toBeCloseTo(SPAWN.z, 6);
  });

  it('leaves a reachable standing spot outside every chair', () => {
    for (const seat of SEATS) {
      const spot = standingSpotForSeat(seat);
      expect(spot.x).toBeGreaterThan(HALL_BOUNDS.minX - PLAYER_RADIUS);
      expect(spot.x).toBeLessThan(HALL_BOUNDS.maxX + PLAYER_RADIUS);
      const table = TABLES[seat.tableIndex];
      if (!table) continue;
      // Further from the table than the chair itself: standing up steps back.
      expect(Math.hypot(spot.x - table.x, spot.z - table.z)).toBeGreaterThan(SEAT_RING_RADIUS);
    }
  });
});

describe('assignSeats', () => {
  it('gives every occupant a distinct chair', () => {
    const ids = Array.from({ length: 20 }, (_value, index) => `player-${index}`);
    const assignment = assignSeats(ids);
    expect(assignment.size).toBe(ids.length);
    expect(new Set([...assignment.values()].map((seat) => seat.id)).size).toBe(ids.length);
  });

  it('is deterministic, so every client seats the room identically', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const first = assignSeats(ids);
    const second = assignSeats(ids);
    for (const id of ids) {
      expect(first.get(id)?.id).toBe(second.get(id)?.id);
    }
  });

  it('does not move an existing player when someone new joins', () => {
    const before = assignSeats(['a', 'b']);
    const after = assignSeats(['a', 'b', 'c']);
    expect(after.get('a')?.id).toBe(before.get('a')?.id);
    expect(after.get('b')?.id).toBe(before.get('b')?.id);
  });

  it('ignores duplicate ids instead of double booking a chair', () => {
    const assignment = assignSeats(['a', 'a', 'b']);
    expect(assignment.size).toBe(2);
    expect(new Set([...assignment.values()].map((seat) => seat.id)).size).toBe(2);
  });
});

describe('seat and reception proximity', () => {
  it('finds the chair a player is standing next to', () => {
    const seat = SEATS[3];
    expect(seat).toBeDefined();
    if (!seat) return;
    expect(nearestSeat(seat.x + 0.2, seat.z, [seat])?.id).toBe(seat.id);
    expect(nearestSeat(seat.x + 6, seat.z, [seat])).toBeNull();
  });

  it('recognises the desk only from in front of it', () => {
    expect(isNearReception(RECEPTION.approachX, RECEPTION.approachZ)).toBe(true);
    expect(isNearReception(RECEPTION.approachX, RECEPTION.approachZ - 6)).toBe(false);
  });
});

describe('freeSeats', () => {
  it('returns every chair nobody has taken', () => {
    const taken = new Set(SEATS.slice(0, 5).map((seat) => seat.id));
    const free = freeSeats(taken);
    expect(free).toHaveLength(SEATS.length - 5);
    expect(free.some((seat) => taken.has(seat.id))).toBe(false);
  });
});
