/**
 * Where the tabelloni hang.
 *
 * A Bingo hall lives or dies on whether you can read the numbers from your own
 * chair. Two boards beside the stage was the right answer for a room of forty
 * seats; this hall is fifty metres across and seats 512, and from the back rows
 * the stage boards are a smear of pixels behind three hundred heads.
 *
 * So the numbers are repeated around the room the way a real hall does it:
 * panels along both side walls, one over the entrance for people still standing
 * at the door, and four-sided units hung over the aisles so that wherever you
 * sit there is a face pointing more or less at you.
 *
 * Placements are derived from the seat grid rather than typed in — the last time
 * these were literals the hall grew and left two boards floating in mid-air over
 * the tables. Being plain maths with no Three.js import, the coverage this
 * produces can be asserted in a test instead of judged from a screenshot.
 *
 * Convention: `faces` holds Three.js `rotation.y` values, so a face at yaw f has
 * outward normal `(sin f, cos f)` — the direction a player has to be standing in
 * to read it.
 */

import { HALL_SHELL, SEATS, STAGE } from './hallLayout';

export type BoardMount = 'STAGE' | 'WALL' | 'HANGING';

export interface BoardPlacement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly mount: BoardMount;
  /**
   * Yaw of every readable face. A wall panel has one; a hanging unit has four,
   * so walking round it never leaves you behind the screen.
   */
  readonly faces: readonly number[];
}

/**
 * Width over height of the painted texture (1536 × 512).
 *
 * A board drawn at any other ratio stretches the digits, which is exactly the
 * kind of thing that reads as "slightly wrong" without anyone being able to say
 * why, so every placement keeps it.
 */
export const BOARD_ASPECT = 3;

/**
 * How far a board still counts as readable, in metres.
 *
 * Not an acuity limit — the digits stay geometrically legible much further than
 * this. It is a limit on the room: past a dozen metres the view of a board is
 * through a crowd of seated people, and a number you have to lean to find is a
 * number you stop looking for.
 *
 * The layout below comes in at 5.7 m for the median seat, 9.9 m at the 95th
 * percentile and 11.0 m for the worst seat in the house.
 */
export const MAX_READING_DISTANCE = 13;

/**
 * How far off a board's normal you can be and still read it.
 *
 * Beyond sixty degrees the face is foreshortened to a third of its width and the
 * columns start to merge. This is why hanging units have four faces rather than
 * two: a unit you can only read from directly in front covers a corridor, not an
 * area.
 */
export const MAX_VIEWING_ANGLE = Math.PI / 3;

/** Side of the square housing a four-faced unit hangs in, beyond the screens. */
export const HANGING_HOUSING_MARGIN = 0.2;

const SEATING = {
  minX: Math.min(...SEATS.map((seat) => seat.x)),
  maxX: Math.max(...SEATS.map((seat) => seat.x)),
  minZ: Math.min(...SEATS.map((seat) => seat.z)),
  maxZ: Math.max(...SEATS.map((seat) => seat.z)),
};

/** Distance from the wall plane to the middle of a panel's housing. */
const WALL_STANDOFF = 0.4;

/** Wall panels ride above every head and below the cove trim. */
const WALL_BOARD_Y = 4.4;
const WALL_BOARD_WIDTH = 6.0;

/**
 * Height of the hanging units.
 *
 * Chosen against the sightline rather than by eye: a seated player at the back
 * looking at the stage screen passes under three metres the whole way, so a unit
 * whose bottom edge is at 4.35 m can never come between a seat and the stage.
 * The test asserts it, because "looks fine from where I screenshotted" is how
 * the last set of boards ended up in the wrong place.
 */
const HANGING_BOARD_Y = 5.0;
const HANGING_BOARD_WIDTH = 3.9;

function panel(
  id: string,
  x: number,
  y: number,
  z: number,
  width: number,
  yaw: number,
  mount: BoardMount,
): BoardPlacement {
  return { id, x, y, z, width, height: width / BOARD_ASPECT, mount, faces: [yaw] };
}

/**
 * The pair flanking the stage.
 *
 * These used to live inside the stage component at a hardcoded z that predated
 * the hall being resized, which left them hanging over the seventh row of
 * tables. Anchored to the stage they follow it wherever it goes.
 */
const STAGE_BOARDS: readonly BoardPlacement[] = [
  panel('stage-left', -6.6, 2.9, STAGE.minZ + 0.34, 5.6, 0.5, 'STAGE'),
  panel('stage-right', 6.6, 2.9, STAGE.minZ + 0.34, 5.6, -0.5, 'STAGE'),
];

/** Four panels down each side wall, spread over the depth of the seating. */
const SIDE_WALL_BOARDS: readonly BoardPlacement[] = (() => {
  const boards: BoardPlacement[] = [];
  const span = SEATING.maxZ - SEATING.minZ;
  const fractions = [0.08, 0.36, 0.64, 0.92];
  fractions.forEach((fraction, index) => {
    const z = SEATING.minZ + span * fraction;
    boards.push(
      // Left wall: the readable face points towards +X, into the room.
      panel(`wall-left-${index}`, HALL_SHELL.minX + WALL_STANDOFF, WALL_BOARD_Y, z, WALL_BOARD_WIDTH, Math.PI / 2, 'WALL'),
      panel(`wall-right-${index}`, HALL_SHELL.maxX - WALL_STANDOFF, WALL_BOARD_Y, z, WALL_BOARD_WIDTH, -Math.PI / 2, 'WALL'),
    );
  });
  return boards;
})();

/** One over the doors, for players who have not sat down yet. */
const ENTRANCE_BOARD: BoardPlacement = panel(
  'wall-entrance',
  0,
  WALL_BOARD_Y,
  HALL_SHELL.maxZ - WALL_STANDOFF,
  7.2,
  Math.PI,
  'WALL',
);

/**
 * Four-faced units hung over the aisle crossings.
 *
 * The positions are aisles, not tables: the grid of tables is pitched 5.9 × 5.7,
 * so these sit in the gaps between islands rather than directly over anybody's
 * cards. Three by three covers the floor with no seat further than about eight
 * metres from a face pointing at it.
 */
const HANGING_BOARDS: readonly BoardPlacement[] = (() => {
  const boards: BoardPlacement[] = [];
  const columns = [-11.8, 0, 11.8];
  const rows = [-8.0, 3.4, 14.8];
  const faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  rows.forEach((z, row) => {
    columns.forEach((x, column) => {
      boards.push({
        id: `hanging-${row}-${column}`,
        x,
        y: HANGING_BOARD_Y,
        z,
        width: HANGING_BOARD_WIDTH,
        height: HANGING_BOARD_WIDTH / BOARD_ASPECT,
        mount: 'HANGING',
        faces,
      });
    });
  });
  return boards;
})();

export const NUMBER_BOARDS: readonly BoardPlacement[] = [
  ...STAGE_BOARDS,
  ...SIDE_WALL_BOARDS,
  ENTRANCE_BOARD,
  ...HANGING_BOARDS,
];

export interface BoardBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Half-thickness of a board's housing. */
const HOUSING_HALF_DEPTH = 0.12;

/**
 * Axis-aligned footprint of a board, housing included.
 *
 * A panel on a side wall runs along Z, not X, so the box has to follow the yaw
 * the panel is actually drawn at — the first version of this treated width as an
 * X extent and put the side panels four metres outside the building. Four-faced
 * units are square in plan and need no such care.
 */
export function boardBox(placement: BoardPlacement): BoardBox {
  const halfHeight = placement.height / 2 + HOUSING_HALF_DEPTH;

  let halfX: number;
  let halfZ: number;
  if (placement.mount === 'HANGING') {
    halfX = placement.width / 2 + HANGING_HOUSING_MARGIN;
    halfZ = halfX;
  } else {
    // Local +X of the face runs along (cos f, −sin f); local +Z, its normal,
    // along (sin f, cos f).
    const yaw = placement.faces[0] ?? 0;
    const along = placement.width / 2;
    halfX = Math.abs(Math.cos(yaw)) * along + Math.abs(Math.sin(yaw)) * HOUSING_HALF_DEPTH;
    halfZ = Math.abs(Math.sin(yaw)) * along + Math.abs(Math.cos(yaw)) * HOUSING_HALF_DEPTH;
  }

  return {
    minX: placement.x - halfX,
    maxX: placement.x + halfX,
    minY: placement.y - halfHeight,
    maxY: placement.y + halfHeight,
    minZ: placement.z - halfZ,
    maxZ: placement.z + halfZ,
  };
}

/** True when a viewer at (x, z) is inside the cone a face can be read from. */
function faceIsReadableFrom(
  placement: BoardPlacement,
  yaw: number,
  x: number,
  z: number,
): boolean {
  const dx = x - placement.x;
  const dz = z - placement.z;
  const distance = Math.hypot(dx, dz);
  // Standing under a hanging unit counts as being able to read it.
  if (distance < 1e-6) return true;
  const dot = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / distance;
  return dot >= Math.cos(MAX_VIEWING_ANGLE);
}

export function isReadableFrom(placement: BoardPlacement, x: number, z: number): boolean {
  return placement.faces.some((yaw) => faceIsReadableFrom(placement, yaw, x, z));
}

export interface NearestBoard {
  readonly placement: BoardPlacement;
  readonly distance: number;
}

/**
 * The closest board a player at (x, z) can actually read, or null if there is
 * none — which the coverage test exists to make sure never happens on a seat.
 */
export function nearestReadableBoard(x: number, z: number): NearestBoard | null {
  let best: NearestBoard | null = null;
  for (const placement of NUMBER_BOARDS) {
    if (!isReadableFrom(placement, x, z)) continue;
    const distance = Math.hypot(x - placement.x, z - placement.z);
    if (!best || distance < best.distance) best = { placement, distance };
  }
  return best;
}
