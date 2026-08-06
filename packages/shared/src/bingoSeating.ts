/**
 * Tables and seats of the Bingo hall.
 *
 * This used to live only in the client, which meant sitting down was a decision
 * the client made about itself: the server had no idea a seat existed, so two
 * players could occupy the same chair and neither would ever be told. Seats are
 * now named here, so the room can own who is in which one.
 *
 * Only *identity* and layout live here — which tables exist, how many seats
 * each has, where they are. The rendering of a chair stays in the client, and
 * the occupancy stays on the server. All three agree on the id.
 */

/**
 * Size of the hall.
 *
 * A real Bingo hall seats hundreds, and a room that seats forty reads as a
 * meeting room with a stage in it. Sixty-four tables of eight is 512 seats —
 * past the 500 the brief asks for, and a grid rather than a scatter because a
 * hall of this size has to be navigable: you find your table by counting rows.
 *
 * Everything downstream is derived, so changing these three numbers resizes the
 * room, the collision set, the seat registry and the overhead map together.
 */
export const TABLE_GRID_COLUMNS = 8;
export const TABLE_GRID_ROWS = 8;
export const SEATS_PER_TABLE = 8;

/** Centre-to-centre spacing. Wide enough to walk between two full tables. */
export const TABLE_PITCH_X = 5.9;
export const TABLE_PITCH_Z = 5.7;

/** Distance from a table's centre to the ring its chairs sit on. */
export const SEAT_RING_RADIUS = 2.05;

function axis(count: number, pitch: number, offset: number): number[] {
  const span = (count - 1) * pitch;
  return Array.from({ length: count }, (_value, index) => index * pitch - span / 2 + offset);
}

export const TABLE_COLUMNS: readonly number[] = axis(TABLE_GRID_COLUMNS, TABLE_PITCH_X, 0);
// Offset towards the entrance so the stage has room in front of the first row.
export const TABLE_ROWS: readonly number[] = axis(TABLE_GRID_ROWS, TABLE_PITCH_Z, 3.4);

/**
 * What a table is like to sit at.
 *
 * The character of a table is part of the design brief — near the caller, quiet
 * corner, raised VIP, long table for groups — and it is what makes choosing a
 * seat a choice rather than a formality.
 */
export const TABLE_CHARACTERS = ['STAGE_SIDE', 'CENTRE', 'CORNER', 'BACK'] as const;
export type TableCharacter = (typeof TABLE_CHARACTERS)[number];

export const TABLE_CHARACTER_LABELS: Record<TableCharacter, string> = {
  STAGE_SIDE: 'Vicino al banditore',
  CENTRE: 'Centrale',
  CORNER: 'Angolo tranquillo',
  BACK: 'In fondo',
};

export interface HallTable {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly seatCount: number;
  /** Number painted on the table sign, 1 based. */
  readonly label: number;
  readonly character: TableCharacter;
}

export interface HallSeat {
  readonly id: string;
  readonly tableIndex: number;
  readonly seatIndex: number;
  /** Angle of the seat around its table, radians. */
  readonly angle: number;
  readonly x: number;
  readonly z: number;
  /**
   * Three.js `rotation.y` turning a model built facing +Z towards the centre of
   * its table. The matching first person camera yaw is `facing + Math.PI`.
   */
  readonly facing: number;
}

function characterFor(x: number, z: number): TableCharacter {
  // The stage is at negative Z, so the front rows are closest to the caller.
  const frontThird = TABLE_ROWS[Math.floor(TABLE_GRID_ROWS / 3)] ?? 0;
  const backThird = TABLE_ROWS[Math.floor((TABLE_GRID_ROWS * 2) / 3)] ?? 0;
  if (z <= frontThird) return 'STAGE_SIDE';
  if (z >= backThird) return 'BACK';
  return Math.abs(x) < TABLE_PITCH_X ? 'CENTRE' : 'CORNER';
}

function buildTables(): readonly HallTable[] {
  const tables: HallTable[] = [];
  for (const z of TABLE_ROWS) {
    for (const x of TABLE_COLUMNS) {
      tables.push({
        index: tables.length,
        x,
        z,
        seatCount: SEATS_PER_TABLE,
        label: tables.length + 1,
        character: characterFor(x, z),
      });
    }
  }
  return tables;
}

export const HALL_TABLES: readonly HallTable[] = buildTables();

function buildSeats(): readonly HallSeat[] {
  const seats: HallSeat[] = [];
  for (const table of HALL_TABLES) {
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

export const HALL_SEATS: readonly HallSeat[] = buildSeats();

const SEATS_BY_ID = new Map(HALL_SEATS.map((seat) => [seat.id, seat]));

export function findSeat(seatId: string): HallSeat | undefined {
  return SEATS_BY_ID.get(seatId);
}

export function seatsOfTable(tableIndex: number): readonly HallSeat[] {
  return HALL_SEATS.filter((seat) => seat.tableIndex === tableIndex);
}

/** How long a held reservation survives before anyone may take the seat. */
export const SEAT_RESERVATION_MS = 90_000;

/**
 * How long a disconnected player keeps their seat.
 *
 * Matches the reconnection window: a player who drops mid-game comes back to
 * the same chair with the same cards, which is the whole point of holding it.
 */
export const SEAT_HOLD_ON_DISCONNECT_MS = 60_000;

/** Reach within which a standing player may take a seat. */
export const SEAT_INTERACT_RADIUS = 1.6;

export function seatWithinReach(seat: HallSeat, x: number, z: number): boolean {
  return Math.hypot(seat.x - x, seat.z - z) <= SEAT_INTERACT_RADIUS;
}

export type SeatOccupantKind = 'PLAYER' | 'NPC';

/** One seat as broadcast to every client in the room. */
export interface SeatOccupancy {
  readonly seatId: string;
  readonly occupantId: string;
  readonly displayName: string;
  readonly kind: SeatOccupantKind;
  /** Set while the occupant is inside their reconnection window. */
  readonly disconnected: boolean;
}

export const SEAT_REJECTION_REASONS = {
  unknown_seat: 'Questo posto non esiste.',
  seat_taken: 'Qualcuno si è seduto un istante prima di te.',
  seat_reserved: 'Questo posto è riservato.',
  already_seated: 'Sei già seduto a un tavolo.',
  not_seated: 'Non sei seduto.',
  too_far: 'Avvicinati al posto per sederti.',
  reservation_limit: 'Hai già riservato abbastanza posti.',
} as const;

export type SeatRejectionReason = keyof typeof SEAT_REJECTION_REASONS;

/** Seats one player may hold for friends at the same time. */
export const MAX_RESERVATIONS_PER_PLAYER = 2;
