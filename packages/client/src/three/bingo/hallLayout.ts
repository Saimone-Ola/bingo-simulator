/**
 * Authoritative geometry of the virtual Bingo hall.
 *
 * Every 3D component, the movement controller and the tests read the room from
 * here, so a table cannot be drawn in one place and collide in another. The
 * module deliberately avoids Three.js imports: it is plain maths and can be unit
 * tested without a WebGL context.
 *
 * Conventions: Y is up, the stage sits towards -Z and the entrance towards +Z.
 * A yaw of 0 looks at the stage, i.e. forward = (-sin(yaw), -cos(yaw)).
 */

import { HALL_SEATS, HALL_TABLES, SEAT_RING_RADIUS } from '@bingo/shared';

export interface CircleCollider {
  readonly kind: 'circle';
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface BoxCollider {
  readonly kind: 'box';
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type Collider = CircleCollider | BoxCollider;

export interface HallBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface TablePlacement {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly seatCount: number;
  /** Number painted on the table sign, 1 based. */
  readonly label: number;
}

export interface SeatPlacement {
  readonly id: string;
  readonly tableIndex: number;
  readonly seatIndex: number;
  /** Angle of the seat around its table, radians. */
  readonly angle: number;
  /** World position of the chair. */
  readonly x: number;
  readonly z: number;
  /**
   * Three.js `rotation.y` that turns a model built facing +Z towards the centre
   * of its table. The matching first person camera yaw is `facing + Math.PI`.
   */
  readonly facing: number;
}

export const PLAYER_RADIUS = 0.32;
export const TABLE_RADIUS = 1.3;
// Re-exported from shared so existing importers keep working.
export { SEAT_RING_RADIUS };
export const TABLE_TOP_HEIGHT = 0.78;
export const STANDING_EYE_HEIGHT = 1.62;
export const SEATED_EYE_HEIGHT = 1.26;

/**
 * Walkable floor.
 *
 * Derived from where the chairs actually are rather than typed in, so the room
 * cannot fall out of step with a grid that grew. Sixty-four tables of eight need
 * a hall roughly forty-five metres across, which is the size a real Bingo hall
 * is — and the reason the old forty-seat room read as a meeting room with a
 * stage in it.
 */
const SEAT_EXTENT = {
  x: Math.max(...HALL_SEATS.map((seat) => Math.abs(seat.x))),
  minZ: Math.min(...HALL_SEATS.map((seat) => seat.z)),
  maxZ: Math.max(...HALL_SEATS.map((seat) => seat.z)),
};

/** Room to walk round the outer chairs. */
const PERIMETER = 2.6;

/**
 * Foyer between the back row and the doors.
 *
 * Without it a player spawns pressed against the last table and sees a chair
 * back instead of a hall. An entrance needs depth to be an entrance.
 */
const ENTRANCE_DEPTH = 7.5;

export const HALL_BOUNDS: HallBounds = {
  minX: -(SEAT_EXTENT.x + PERIMETER),
  maxX: SEAT_EXTENT.x + PERIMETER,
  minZ: SEAT_EXTENT.minZ - PERIMETER,
  maxZ: SEAT_EXTENT.maxZ + PERIMETER + ENTRANCE_DEPTH,
};

/** Walls are drawn slightly outside the walkable bounds so they read as solid. */
export const HALL_SHELL = {
  minX: HALL_BOUNDS.minX - 0.6,
  maxX: HALL_BOUNDS.maxX + 0.6,
  // The stage lives beyond the front wall line, so the shell reaches past it.
  minZ: HALL_BOUNDS.minZ - 6.4,
  maxZ: HALL_BOUNDS.maxZ + 0.7,
  // A hall this wide needs the height to match, or it reads as a car park.
  wallHeight: 9.2,
  ceilingHeight: 8.8,
} as const;

/** Stage: wide enough to be seen from the back of a forty-metre room. */
const STAGE_FRONT_Z = HALL_BOUNDS.minZ - 0.4;

export const STAGE = {
  minX: -9.5,
  maxX: 9.5,
  minZ: STAGE_FRONT_Z - 5.2,
  maxZ: STAGE_FRONT_Z,
  height: 0.9,
  /** Where the presenter stands, on top of the platform. */
  hostX: 2.4,
  hostZ: STAGE_FRONT_Z - 2.0,
  /** Centre of the ball machine. */
  urnX: -2.8,
  urnZ: STAGE_FRONT_Z - 2.1,
} as const;

/**
 * Reception and spawn sit at the entrance, which is the far end from the stage.
 *
 * They used to be typed in at z ≈ 8.5, which was the back of a small hall and
 * is the middle of a large one — the desk ended up standing among the tables.
 * Derived from the bounds, they follow the room whatever size it is.
 */
const ENTRANCE_Z = HALL_BOUNDS.maxZ - 1.6;

export const RECEPTION = {
  x: 6.2,
  z: ENTRANCE_Z,
  width: 3.6,
  depth: 0.95,
  height: 1.08,
  /** Point in front of the desk that triggers the purchase interaction. */
  approachX: 6.2,
  approachZ: ENTRANCE_Z - 0.9,
  radius: 2.0,
} as const;

export const ENTRANCE = {
  x: -4.6,
  z: 9.8,
  width: 3.4,
} as const;

/** Where a player is dropped the first time they enter the hall. */
/** Dropped just inside the entrance, facing the stage down the centre aisle. */
export const SPAWN = { x: 0, z: HALL_BOUNDS.maxZ - 3.4, yaw: 0 } as const;

/**
 * Tables and seats come from `@bingo/shared`.
 *
 * They used to be built here, which made sitting down something the client
 * decided about itself while the server had no idea seats existed. The layout
 * is now one definition read by the renderer, the collision code and the room
 * that owns occupancy, so a chair cannot be drawn where the server will not
 * seat anyone.
 */
export const TABLES: readonly TablePlacement[] = HALL_TABLES.map((table) => ({
  index: table.index,
  x: table.x,
  z: table.z,
  radius: TABLE_RADIUS,
  seatCount: table.seatCount,
  label: table.label,
}));

export const SEATS: readonly SeatPlacement[] = HALL_SEATS;

/**
 * Blocking radius of a table together with its ring of chairs.
 *
 * A table and its seats are one obstacle, not several. Colliding with each
 * chair separately looks tempting but is unsound: a player pushed off the table
 * lands inside a chair's radius, and the chair then pushes them back onto the
 * table. One circle around the whole island cannot contradict itself.
 */
export const TABLE_ISLAND_RADIUS = SEAT_RING_RADIUS + 0.2;

export const HALL_COLLIDERS: readonly Collider[] = [
  ...TABLES.map<Collider>((table) => ({
    kind: 'circle',
    x: table.x,
    z: table.z,
    radius: TABLE_ISLAND_RADIUS,
  })),
  { kind: 'box', minX: STAGE.minX, maxX: STAGE.maxX, minZ: STAGE.minZ, maxZ: STAGE.maxZ },
  {
    kind: 'box',
    minX: RECEPTION.x - RECEPTION.width / 2,
    maxX: RECEPTION.x + RECEPTION.width / 2,
    minZ: RECEPTION.z - RECEPTION.depth / 2,
    maxZ: RECEPTION.z + RECEPTION.depth / 2,
  },
];

export function seatById(id: string): SeatPlacement | undefined {
  return SEATS.find((seat) => seat.id === id);
}

export function tableByIndex(index: number): TablePlacement | undefined {
  return TABLES[index];
}

/**
 * Deterministically hands every occupant of the room a chair.
 *
 * The order of `occupantIds` comes straight from the server snapshot, which is
 * built identically for every client, so all players agree on who sits where
 * without adding a single byte to the protocol.
 */
/**
 * Order seats are handed out in.
 *
 * Filling sequentially puts everyone on the first tables, which in a small room
 * is fine and in a forty-metre hall means a player walks in to find the whole
 * crowd at the far end and the room around them empty. Stepping through the
 * seat list by a stride coprime with its length visits every seat exactly once
 * while spreading arrivals across the whole floor, so a half-full hall looks
 * half full everywhere rather than full at one end.
 */
const SEAT_FILL_STRIDE = 37;

const SEAT_FILL_ORDER: readonly SeatPlacement[] = (() => {
  const order: SeatPlacement[] = [];
  for (let step = 0; step < SEATS.length; step += 1) {
    const seat = SEATS[(step * SEAT_FILL_STRIDE) % SEATS.length];
    if (seat) order.push(seat);
  }
  return order;
})();

export function assignSeats(occupantIds: readonly string[]): Map<string, SeatPlacement> {
  const assignment = new Map<string, SeatPlacement>();
  let cursor = 0;
  for (const id of occupantIds) {
    if (assignment.has(id)) continue;
    const seat = SEAT_FILL_ORDER[cursor % SEAT_FILL_ORDER.length];
    cursor += 1;
    if (seat === undefined) continue;
    assignment.set(id, seat);
  }
  return assignment;
}

/** Seats nobody occupies, used for decorative props and ambient guests. */
export function freeSeats(taken: ReadonlySet<string>): readonly SeatPlacement[] {
  return SEATS.filter((seat) => !taken.has(seat.id));
}

export function distanceTo(x: number, z: number, targetX: number, targetZ: number): number {
  return Math.hypot(x - targetX, z - targetZ);
}

/** Closest chair the player may sit on, or `null` when none is within reach. */
export function nearestSeat(
  x: number,
  z: number,
  candidates: readonly SeatPlacement[],
  maxDistance = 1.4,
): SeatPlacement | null {
  let best: SeatPlacement | null = null;
  let bestDistance = maxDistance;
  for (const seat of candidates) {
    const distance = distanceTo(x, z, seat.x, seat.z);
    if (distance <= bestDistance) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}

export function isNearReception(x: number, z: number): boolean {
  return distanceTo(x, z, RECEPTION.approachX, RECEPTION.approachZ) <= RECEPTION.radius;
}

/** A point just outside a chair, where a standing player waits before sitting. */
export function standingSpotForSeat(seat: SeatPlacement): { x: number; z: number } {
  const table = TABLES[seat.tableIndex];
  if (!table) return { x: seat.x, z: seat.z };
  // Just clear of the table island's collider, so standing up never drops the
  // player inside an obstacle they then get squeezed out of.
  const outward = TABLE_ISLAND_RADIUS + PLAYER_RADIUS + 0.12;
  return {
    x: table.x + Math.cos(seat.angle) * outward,
    z: table.z + Math.sin(seat.angle) * outward,
  };
}
