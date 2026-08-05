/**
 * Who is sitting where.
 *
 * Written as a plain synchronous class with no I/O so the property that matters
 * can be tested directly: **two claims on the same seat cannot both succeed**.
 * Node runs this on one thread and every mutation below completes without an
 * `await`, so a claim is atomic by construction rather than by lock. That is
 * the entire argument, and it only holds because nothing in here yields — if a
 * database round trip is ever added it has to move to a conditional
 * `UPDATE ... WHERE occupant IS NULL RETURNING` instead.
 */

import {
  HALL_SEATS,
  MAX_RESERVATIONS_PER_PLAYER,
  SEAT_HOLD_ON_DISCONNECT_MS,
  SEAT_RESERVATION_MS,
  findSeat,
  seatWithinReach,
  type SeatOccupancy,
  type SeatOccupantKind,
  type SeatRejectionReason,
} from './bingoSeating';

interface SeatRecord {
  occupantId: string;
  displayName: string;
  kind: SeatOccupantKind;
  /** Set when the occupant dropped; the seat is released once it passes. */
  releaseAt: number | null;
}

interface Reservation {
  /** Who is holding the seat open. */
  holderId: string;
  expiresAt: number;
}

export type SeatClaim =
  | { ok: true; seatId: string }
  | { ok: false; reason: SeatRejectionReason };

export interface SeatClaimOptions {
  /** Where the player is standing, when the claim must be within reach. */
  from?: { x: number; z: number };
}

export class SeatRegistry {
  private readonly occupied = new Map<string, SeatRecord>();
  private readonly reservations = new Map<string, Reservation>();
  /** Reverse index so leaving does not scan every seat. */
  private readonly seatOf = new Map<string, string>();

  /**
   * Takes a seat for an occupant.
   *
   * Every rejection is a named reason rather than a silent failure: the caller
   * turns it into a message, and "someone sat down a moment before you" is a
   * different thing to tell a player than "you are already seated".
   */
  claim(
    seatId: string,
    occupantId: string,
    displayName: string,
    kind: SeatOccupantKind,
    now: number,
    options: SeatClaimOptions = {},
  ): SeatClaim {
    const seat = findSeat(seatId);
    if (!seat) return { ok: false, reason: 'unknown_seat' };

    this.expire(now);

    if (this.seatOf.has(occupantId)) return { ok: false, reason: 'already_seated' };
    if (options.from && !seatWithinReach(seat, options.from.x, options.from.z)) {
      return { ok: false, reason: 'too_far' };
    }
    if (this.occupied.has(seatId)) return { ok: false, reason: 'seat_taken' };

    const held = this.reservations.get(seatId);
    if (held && held.holderId !== occupantId) return { ok: false, reason: 'seat_reserved' };

    this.reservations.delete(seatId);
    this.occupied.set(seatId, { occupantId, displayName, kind, releaseAt: null });
    this.seatOf.set(occupantId, seatId);
    return { ok: true, seatId };
  }

  /** Stands an occupant up. Returns the seat freed, or `null`. */
  release(occupantId: string): string | null {
    const seatId = this.seatOf.get(occupantId);
    if (!seatId) return null;
    this.occupied.delete(seatId);
    this.seatOf.delete(occupantId);
    return seatId;
  }

  /**
   * Holds a seat rather than freeing it, for a player who dropped.
   *
   * They come back to the same chair with the same cards; the seat only becomes
   * available once the reconnection window has passed.
   */
  hold(occupantId: string, now: number, forMs = SEAT_HOLD_ON_DISCONNECT_MS): void {
    const seatId = this.seatOf.get(occupantId);
    if (!seatId) return;
    const record = this.occupied.get(seatId);
    if (record) record.releaseAt = now + forMs;
  }

  /** Cancels a hold, because the occupant came back. */
  resume(occupantId: string): void {
    const seatId = this.seatOf.get(occupantId);
    if (!seatId) return;
    const record = this.occupied.get(seatId);
    if (record) record.releaseAt = null;
  }

  /** Keeps a seat open for a friend who has not arrived yet. */
  reserve(seatId: string, holderId: string, now: number): SeatClaim {
    const seat = findSeat(seatId);
    if (!seat) return { ok: false, reason: 'unknown_seat' };

    this.expire(now);
    if (this.occupied.has(seatId)) return { ok: false, reason: 'seat_taken' };

    const existing = this.reservations.get(seatId);
    if (existing && existing.holderId !== holderId) return { ok: false, reason: 'seat_reserved' };

    const held = this.reservationsBy(holderId);
    if (!existing && held.length >= MAX_RESERVATIONS_PER_PLAYER) {
      return { ok: false, reason: 'reservation_limit' };
    }

    this.reservations.set(seatId, { holderId, expiresAt: now + SEAT_RESERVATION_MS });
    return { ok: true, seatId };
  }

  cancelReservation(seatId: string, holderId: string): boolean {
    const existing = this.reservations.get(seatId);
    if (!existing || existing.holderId !== holderId) return false;
    this.reservations.delete(seatId);
    return true;
  }

  /** Drops every reservation a player is holding, when they leave. */
  cancelAllReservations(holderId: string): void {
    for (const seatId of this.reservationsBy(holderId)) this.reservations.delete(seatId);
  }

  seatFor(occupantId: string): string | null {
    return this.seatOf.get(occupantId) ?? null;
  }

  occupantOf(seatId: string): SeatRecord | undefined {
    return this.occupied.get(seatId);
  }

  isFree(seatId: string, now: number): boolean {
    this.expire(now);
    return !this.occupied.has(seatId) && !this.reservations.has(seatId);
  }

  reservationsBy(holderId: string): string[] {
    const held: string[] = [];
    for (const [seatId, reservation] of this.reservations) {
      if (reservation.holderId === holderId) held.push(seatId);
    }
    return held;
  }

  /** Free seats, in layout order, for putting NPCs somewhere sensible. */
  freeSeats(now: number): string[] {
    this.expire(now);
    return HALL_SEATS.filter((seat) => this.isFree(seat.id, now)).map((seat) => seat.id);
  }

  /** Everything the clients need to draw the room. */
  snapshot(): SeatOccupancy[] {
    const rows: SeatOccupancy[] = [];
    for (const [seatId, record] of this.occupied) {
      rows.push({
        seatId,
        occupantId: record.occupantId,
        displayName: record.displayName,
        kind: record.kind,
        disconnected: record.releaseAt !== null,
      });
    }
    return rows;
  }

  reservationSnapshot(): Array<{ seatId: string; holderId: string; expiresAt: number }> {
    return [...this.reservations].map(([seatId, reservation]) => ({
      seatId,
      holderId: reservation.holderId,
      expiresAt: reservation.expiresAt,
    }));
  }

  /**
   * Drops expired holds and reservations.
   *
   * Called at the top of every mutation rather than on a timer, so a seat can
   * never be reported as taken by something that has already lapsed.
   */
  expire(now: number): string[] {
    const freed: string[] = [];

    for (const [seatId, record] of this.occupied) {
      if (record.releaseAt !== null && record.releaseAt <= now) {
        this.occupied.delete(seatId);
        this.seatOf.delete(record.occupantId);
        freed.push(seatId);
      }
    }
    for (const [seatId, reservation] of this.reservations) {
      if (reservation.expiresAt <= now) this.reservations.delete(seatId);
    }

    return freed;
  }
}
