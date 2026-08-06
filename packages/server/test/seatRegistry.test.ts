import { describe, expect, it } from 'vitest';
import {
  HALL_SEATS,
  HALL_TABLES,
  MAX_RESERVATIONS_PER_PLAYER,
  SEAT_HOLD_ON_DISCONNECT_MS,
  SEAT_RESERVATION_MS,
  SEAT_RING_RADIUS,
  SeatRegistry,
  findSeat,
  seatsOfTable,
} from '@bingo/shared';

/**
 * Seat assignment.
 *
 * The acceptance criterion this exists for: two players clicking the same seat
 * at the same instant must produce exactly one seated player and one clean
 * error. Before this registry existed, sitting down was a decision the client
 * made about itself and the server had no idea seats existed at all.
 */

const T0 = 1_000_000;
const seatId = (index: number) => HALL_SEATS[index]!.id;

function seated(registry: SeatRegistry): number {
  return registry.snapshot().length;
}

describe('the same seat, at the same instant', () => {
  it('seats exactly one of two claimants and tells the other why', () => {
    const registry = new SeatRegistry();
    const target = seatId(0);

    const first = registry.claim(target, 'alice', 'Alice', 'PLAYER', T0);
    const second = registry.claim(target, 'bruno', 'Bruno', 'PLAYER', T0);

    expect(first).toEqual({ ok: true, seatId: target });
    expect(second).toEqual({ ok: false, reason: 'seat_taken' });
    expect(seated(registry)).toBe(1);
    expect(registry.seatFor('alice')).toBe(target);
    expect(registry.seatFor('bruno')).toBeNull();
  });

  it('seats exactly one however many pile onto it', () => {
    const registry = new SeatRegistry();
    const target = seatId(3);
    const results = Array.from({ length: 50 }, (_value, index) =>
      registry.claim(target, `p${index}`, `P${index}`, 'PLAYER', T0),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(seated(registry)).toBe(1);
  });

  it('never seats one occupant in two places', () => {
    const registry = new SeatRegistry();
    expect(registry.claim(seatId(0), 'alice', 'Alice', 'PLAYER', T0).ok).toBe(true);
    expect(registry.claim(seatId(1), 'alice', 'Alice', 'PLAYER', T0)).toEqual({
      ok: false,
      reason: 'already_seated',
    });
    expect(seated(registry)).toBe(1);
  });

  it('frees the seat when the occupant stands up', () => {
    const registry = new SeatRegistry();
    const target = seatId(0);
    registry.claim(target, 'alice', 'Alice', 'PLAYER', T0);

    expect(registry.release('alice')).toBe(target);
    expect(registry.release('alice')).toBeNull();
    expect(registry.claim(target, 'bruno', 'Bruno', 'PLAYER', T0).ok).toBe(true);
  });

  it('refuses a seat that does not exist', () => {
    const registry = new SeatRegistry();
    expect(registry.claim('t99s99', 'alice', 'Alice', 'PLAYER', T0)).toEqual({
      ok: false,
      reason: 'unknown_seat',
    });
  });
});

describe('reach', () => {
  it('refuses a seat across the room and allows the one in front of you', () => {
    const registry = new SeatRegistry();
    const seat = HALL_SEATS[0]!;

    expect(
      registry.claim(seat.id, 'alice', 'Alice', 'PLAYER', T0, { from: { x: 50, z: 50 } }),
    ).toEqual({ ok: false, reason: 'too_far' });

    expect(
      registry.claim(seat.id, 'alice', 'Alice', 'PLAYER', T0, {
        from: { x: seat.x, z: seat.z },
      }).ok,
    ).toBe(true);
  });

  it('lets a caller skip the reach check, for the overlay map and for NPCs', () => {
    const registry = new SeatRegistry();
    expect(registry.claim(seatId(0), 'npc-1', 'Lucia', 'NPC', T0).ok).toBe(true);
  });
});

describe('disconnection', () => {
  it('holds the seat for a dropped player and gives it back on return', () => {
    const registry = new SeatRegistry();
    const target = seatId(0);
    registry.claim(target, 'alice', 'Alice', 'PLAYER', T0);

    registry.hold('alice', T0);
    expect(registry.snapshot()[0]?.disconnected).toBe(true);
    // Still hers while the window is open.
    expect(registry.claim(target, 'bruno', 'Bruno', 'PLAYER', T0 + 1_000)).toEqual({
      ok: false,
      reason: 'seat_taken',
    });

    registry.resume('alice');
    expect(registry.snapshot()[0]?.disconnected).toBe(false);
    expect(registry.seatFor('alice')).toBe(target);
  });

  it('releases the seat once the reconnection window has passed', () => {
    const registry = new SeatRegistry();
    const target = seatId(0);
    registry.claim(target, 'alice', 'Alice', 'PLAYER', T0);
    registry.hold('alice', T0);

    const later = T0 + SEAT_HOLD_ON_DISCONNECT_MS + 1;
    expect(registry.expire(later)).toEqual([target]);
    expect(registry.seatFor('alice')).toBeNull();
    expect(registry.claim(target, 'bruno', 'Bruno', 'PLAYER', later).ok).toBe(true);
  });
});

describe('reservations', () => {
  it('keeps a seat for a friend and lets only them take it', () => {
    const registry = new SeatRegistry();
    const target = seatId(1);
    expect(registry.reserve(target, 'alice', T0).ok).toBe(true);

    expect(registry.claim(target, 'stranger', 'Estraneo', 'PLAYER', T0)).toEqual({
      ok: false,
      reason: 'seat_reserved',
    });
    expect(registry.claim(target, 'alice', 'Alice', 'PLAYER', T0).ok).toBe(true);
  });

  it('lapses, so a seat is never held forever', () => {
    const registry = new SeatRegistry();
    const target = seatId(1);
    registry.reserve(target, 'alice', T0);

    const later = T0 + SEAT_RESERVATION_MS + 1;
    expect(registry.claim(target, 'stranger', 'Estraneo', 'PLAYER', later).ok).toBe(true);
  });

  it('caps how many seats one player may hold', () => {
    const registry = new SeatRegistry();
    for (let index = 0; index < MAX_RESERVATIONS_PER_PLAYER; index += 1) {
      expect(registry.reserve(seatId(index), 'alice', T0).ok).toBe(true);
    }
    expect(registry.reserve(seatId(MAX_RESERVATIONS_PER_PLAYER), 'alice', T0)).toEqual({
      ok: false,
      reason: 'reservation_limit',
    });
  });

  it('cannot reserve a seat someone is already sitting in', () => {
    const registry = new SeatRegistry();
    const target = seatId(0);
    registry.claim(target, 'alice', 'Alice', 'PLAYER', T0);
    expect(registry.reserve(target, 'bruno', T0)).toEqual({ ok: false, reason: 'seat_taken' });
  });

  it('drops every hold when the holder leaves', () => {
    const registry = new SeatRegistry();
    registry.reserve(seatId(1), 'alice', T0);
    registry.reserve(seatId(2), 'alice', T0);
    registry.cancelAllReservations('alice');
    expect(registry.reservationsBy('alice')).toEqual([]);
  });
});

describe('the hall itself', () => {
  it('has tables with distinct positions and seats with distinct ids', () => {
    expect(new Set(HALL_SEATS.map((seat) => seat.id)).size).toBe(HALL_SEATS.length);
    expect(new Set(HALL_TABLES.map((table) => `${table.x}:${table.z}`)).size).toBe(
      HALL_TABLES.length,
    );
  });

  it('gives every seat to exactly one table, and every table its seats', () => {
    let counted = 0;
    for (const table of HALL_TABLES) {
      const seats = seatsOfTable(table.index);
      expect(seats, `table ${table.index}`).toHaveLength(table.seatCount);
      counted += seats.length;
    }
    expect(counted).toBe(HALL_SEATS.length);
  });

  it('seats everyone the room will hold', () => {
    // maxClients is 20; a hall that cannot seat a full room would strand people.
    expect(HALL_SEATS.length).toBeGreaterThanOrEqual(20);
  });

  it('places every seat on its table ring', () => {
    for (const seat of HALL_SEATS) {
      const table = HALL_TABLES[seat.tableIndex]!;
      // Bound to the constant rather than a literal: a hall that is resized
      // must not need its tests edited to keep passing.
      expect(Math.hypot(seat.x - table.x, seat.z - table.z)).toBeCloseTo(SEAT_RING_RADIUS, 6);
    }
  });

  it('finds a seat by id and nothing by a made-up one', () => {
    expect(findSeat(seatId(0))?.id).toBe(seatId(0));
    expect(findSeat('nope')).toBeUndefined();
  });

  it('reports free seats and shrinks the list as they fill', () => {
    const registry = new SeatRegistry();
    const before = registry.freeSeats(T0).length;
    expect(before).toBe(HALL_SEATS.length);
    registry.claim(seatId(0), 'alice', 'Alice', 'PLAYER', T0);
    expect(registry.freeSeats(T0)).toHaveLength(before - 1);
  });
});
