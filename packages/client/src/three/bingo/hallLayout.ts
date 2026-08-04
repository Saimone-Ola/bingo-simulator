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
export const SEAT_RING_RADIUS = 1.78;
export const TABLE_TOP_HEIGHT = 0.78;
export const STANDING_EYE_HEIGHT = 1.62;
export const SEATED_EYE_HEIGHT = 1.26;

export const HALL_BOUNDS: HallBounds = {
  minX: -10.1,
  maxX: 10.1,
  minZ: -7.9,
  maxZ: 9.2,
};

/** Walls are drawn slightly outside the walkable bounds so they read as solid. */
export const HALL_SHELL = {
  minX: -10.7,
  maxX: 10.7,
  minZ: -12.7,
  maxZ: 9.9,
  wallHeight: 6.4,
  ceilingHeight: 6.1,
} as const;

export const STAGE = {
  minX: -6.8,
  maxX: 6.8,
  minZ: -12.4,
  maxZ: -8.0,
  height: 0.62,
  /** Where the presenter stands, on top of the platform. */
  hostX: 1.7,
  hostZ: -9.5,
  /** Centre of the ball machine. */
  urnX: -2.0,
  urnZ: -9.6,
} as const;

export const RECEPTION = {
  x: 4.6,
  z: 8.7,
  width: 3.6,
  depth: 0.95,
  height: 1.08,
  /** Point in front of the desk that triggers the purchase interaction. */
  approachX: 4.6,
  approachZ: 7.8,
  radius: 2.0,
} as const;

export const ENTRANCE = {
  x: -4.6,
  z: 9.8,
  width: 3.4,
} as const;

/** Where a player is dropped the first time they enter the hall. */
export const SPAWN = { x: 0.2, z: 8.5, yaw: -0.42 } as const;

const TABLE_COLUMNS = [-6.4, 0, 6.4] as const;
const TABLE_ROWS = [-4.9, 0.3, 5.4] as const;

function buildTables(): readonly TablePlacement[] {
  const tables: TablePlacement[] = [];
  for (const z of TABLE_ROWS) {
    for (const x of TABLE_COLUMNS) {
      tables.push({
        index: tables.length,
        x,
        z,
        radius: TABLE_RADIUS,
        // The centre aisle gets the large six-seater tables; they read as the
        // "good" tables from the entrance and give the hall a focal column.
        seatCount: x === 0 ? 6 : 4,
        label: tables.length + 1,
      });
    }
  }
  return tables;
}

export const TABLES: readonly TablePlacement[] = buildTables();

function buildSeats(): readonly SeatPlacement[] {
  const seats: SeatPlacement[] = [];
  for (const table of TABLES) {
    for (let seatIndex = 0; seatIndex < table.seatCount; seatIndex += 1) {
      // Seat 0 sits on the entrance side of the table, so its occupant looks
      // towards the stage: the best view goes to whoever arrives first.
      const angle = Math.PI / 2 + (seatIndex * (Math.PI * 2)) / table.seatCount;
      const x = table.x + Math.cos(angle) * SEAT_RING_RADIUS;
      const z = table.z + Math.sin(angle) * SEAT_RING_RADIUS;
      seats.push({
        id: `t${table.index}s${seatIndex}`,
        tableIndex: table.index,
        seatIndex,
        angle,
        x,
        z,
        facing: Math.atan2(table.x - x, table.z - z),
      });
    }
  }
  return seats;
}

export const SEATS: readonly SeatPlacement[] = buildSeats();

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
export function assignSeats(occupantIds: readonly string[]): Map<string, SeatPlacement> {
  const assignment = new Map<string, SeatPlacement>();
  let cursor = 0;
  for (const id of occupantIds) {
    if (assignment.has(id)) continue;
    const seat = SEATS[cursor % SEATS.length];
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
