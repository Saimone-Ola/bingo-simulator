/**
 * Placement of the physical Bingo cards on the table in front of a seat.
 *
 * Cards are small props lying on the tablecloth, never a full screen overlay:
 * every card a player owns has to be visible at the same time, so the layout
 * changes shape with the amount instead of scaling a single card up.
 *
 * Local frame: the origin is the point of the table right in front of the seat,
 * +X runs to the player's right and -Z runs away from the player, towards the
 * middle of the table. A deck group is therefore placed at {@link DECK_RADIUS}
 * from the table centre and rotated by `seat.facing + Math.PI`.
 */

export const CARD_WIDTH = 0.33;
export const CARD_DEPTH = 0.125;
export const CARD_THICKNESS = 0.006;
/** Height above the table top at which a card rests. */
export const CARD_REST_Y = 0.004;
/** Extra lift applied to the currently selected card. */
export const CARD_SELECTED_LIFT = 0.022;

const COLUMN_GAP = 0.022;
/** Distance from the middle of the table to the middle of a seat's front row. */
export const DECK_RADIUS = 1.08;
// The row gap has to clear the fan as well as the card depth: an arc pushes its
// outer cards backwards, and without the extra room they would touch the row
// behind them at five and six cards.
const ROW_GAP = 0.05;
export const COLUMN_PITCH = CARD_WIDTH + COLUMN_GAP;
export const ROW_PITCH = CARD_DEPTH + ROW_GAP;

export interface CardPlacement {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  /** Yaw in radians; small fan angles keep an arc readable from one seat. */
  readonly rotationY: number;
}

/** How many cards a single seat can physically hold. */
export const MAX_CARDS_ON_TABLE = 6;

function row(indices: readonly number[], z: number, fan: number): CardPlacement[] {
  const centre = (indices.length - 1) / 2;
  return indices.map((index, position) => {
    const offset = position - centre;
    return {
      index,
      x: offset * COLUMN_PITCH,
      // A fanned row curves slightly away from the player at the edges, the way
      // real cards sit when you spread them out.
      z: z - Math.abs(offset) * fan * 0.5,
      rotationY: -offset * fan,
    };
  });
}

/**
 * Returns one placement per card, ordered by card index.
 *
 * Counts above {@link MAX_CARDS_ON_TABLE} are clamped: the server caps
 * purchases well below that, and silently dropping extras is better than
 * stacking unreachable cards on top of each other.
 */
export function layoutCards(count: number): CardPlacement[] {
  const total = Math.max(0, Math.min(MAX_CARDS_ON_TABLE, Math.floor(count)));
  switch (total) {
    case 0:
      return [];
    case 1:
      return row([0], 0, 0);
    case 2:
      return row([0, 1], 0, 0);
    case 3:
      // Slight arc so the outer cards stay square to the player's eyeline.
      return row([0, 1, 2], 0, 0.09);
    case 4:
      return [...row([0, 1], 0, 0), ...row([2, 3], -ROW_PITCH, 0)];
    case 5:
      return [...row([0, 1, 2], 0, 0.06), ...row([3, 4], -ROW_PITCH, 0)];
    default:
      return [...row([0, 1, 2], 0, 0.06), ...row([3, 4, 5], -ROW_PITCH, 0.06)];
  }
}

export interface CardBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Axis aligned footprint of a laid out deck, used to size the table placemat. */
export function deckBounds(placements: readonly CardPlacement[]): CardBounds {
  if (placements.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const placement of placements) {
    minX = Math.min(minX, placement.x - CARD_WIDTH / 2);
    maxX = Math.max(maxX, placement.x + CARD_WIDTH / 2);
    minZ = Math.min(minZ, placement.z - CARD_DEPTH / 2);
    maxZ = Math.max(maxZ, placement.z + CARD_DEPTH / 2);
  }
  return { minX, maxX, minZ, maxZ };
}

export interface CardCellLayout {
  readonly cellWidth: number;
  readonly cellDepth: number;
  readonly originX: number;
  readonly originZ: number;
}

export const CARD_COLUMNS = 9;
export const CARD_ROWS = 3;
const CARD_MARGIN_X = 0.014;
const CARD_MARGIN_Z = 0.012;

export const CARD_CELL_LAYOUT: CardCellLayout = {
  cellWidth: (CARD_WIDTH - CARD_MARGIN_X * 2) / CARD_COLUMNS,
  cellDepth: (CARD_DEPTH - CARD_MARGIN_Z * 2) / CARD_ROWS,
  originX: -(CARD_WIDTH - CARD_MARGIN_X * 2) / 2,
  originZ: -(CARD_DEPTH - CARD_MARGIN_Z * 2) / 2,
};

/**
 * Margins used when painting a card face, as fractions of the texture.
 *
 * Picking reads the same numbers as the painter, so a click always lands on the
 * cell the player can see under the cursor.
 */
export const CARD_FACE_MARGINS = {
  x: 0.028,
  top: 0.15,
  bottom: 0.055,
} as const;

/**
 * Maps a UV hit on a card face to a cell index.
 *
 * Returns `null` for the header strip and the outer border rather than snapping
 * to the nearest cell: a stray click must never mark a number.
 */
export function cellIndexFromUv(u: number, v: number): number | null {
  const localX = (u - CARD_FACE_MARGINS.x) / (1 - CARD_FACE_MARGINS.x * 2);
  // Canvas rows are painted top-down while V grows upwards, so V is flipped.
  const localY =
    (1 - v - CARD_FACE_MARGINS.top) / (1 - CARD_FACE_MARGINS.top - CARD_FACE_MARGINS.bottom);
  if (localX < 0 || localX >= 1 || localY < 0 || localY >= 1) return null;
  const column = Math.floor(localX * CARD_COLUMNS);
  const row = Math.floor(localY * CARD_ROWS);
  if (column < 0 || column >= CARD_COLUMNS || row < 0 || row >= CARD_ROWS) return null;
  return row * CARD_COLUMNS + column;
}

/** Centre of a cell inside a card, in the card's own local frame. */
export function cellPosition(cellIndex: number): { x: number; z: number } {
  const column = cellIndex % CARD_COLUMNS;
  const rowIndex = Math.floor(cellIndex / CARD_COLUMNS);
  const { cellWidth, cellDepth, originX, originZ } = CARD_CELL_LAYOUT;
  return {
    x: originX + cellWidth * (column + 0.5),
    // Row 0 of an Italian card is the top one, furthest from the player.
    z: originZ + cellDepth * (CARD_ROWS - rowIndex - 0.5),
  };
}
