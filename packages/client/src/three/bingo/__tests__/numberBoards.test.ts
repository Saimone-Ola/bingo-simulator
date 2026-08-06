import { describe, expect, it } from 'vitest';
import {
  CEILING_LAMPS,
  HALL_SHELL,
  SEATED_EYE_HEIGHT,
  SEATS,
  STAGE_SCREEN,
  STANDING_EYE_HEIGHT,
  TABLES,
  TABLE_ISLAND_RADIUS,
} from '../hallLayout';
import {
  BOARD_ASPECT,
  MAX_READING_DISTANCE,
  MAX_VIEWING_ANGLE,
  NUMBER_BOARDS,
  boardBox,
  isReadableFrom,
  nearestReadableBoard,
  type BoardPlacement,
} from '../numberBoards';

/**
 * The tabelloni.
 *
 * The question these answer is not "does a board exist" but "can the player in
 * the worst seat in the house read a number without standing up". In a room
 * fifty metres across that is a property of the whole set of boards, so it is
 * asserted over every one of the 512 seats rather than eyeballed from the door.
 */

const hanging = NUMBER_BOARDS.filter((board) => board.mount === 'HANGING');

describe('coverage', () => {
  it('gives every seat a board it can read', () => {
    const unread = SEATS.filter((seat) => nearestReadableBoard(seat.x, seat.z) === null);
    expect(unread.map((seat) => seat.id)).toEqual([]);
  });

  it('keeps the worst seat in the house within reading distance', () => {
    let worst = { id: '', distance: 0 };
    for (const seat of SEATS) {
      const nearest = nearestReadableBoard(seat.x, seat.z);
      if (nearest && nearest.distance > worst.distance) {
        worst = { id: seat.id, distance: nearest.distance };
      }
    }
    expect(worst.distance, `worst seat ${worst.id}`).toBeLessThanOrEqual(MAX_READING_DISTANCE);
  });

  it('covers where players stand as well as where they sit', () => {
    // The floor between the tables, on a coarse grid: a player walking the
    // aisles should never lose sight of the numbers either.
    for (let x = -22; x <= 22; x += 2) {
      for (let z = -18; z <= 25; z += 2) {
        const nearest = nearestReadableBoard(x, z);
        expect(nearest, `at ${x},${z}`).not.toBeNull();
        expect(nearest!.distance, `at ${x},${z}`).toBeLessThanOrEqual(MAX_READING_DISTANCE);
      }
    }
  });

  it('reads a hanging unit from every direction around it', () => {
    const unit = hanging[0]!;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const x = unit.x + Math.sin(angle) * 6;
      const z = unit.z + Math.cos(angle) * 6;
      expect(isReadableFrom(unit, x, z), `from ${angle.toFixed(2)} rad`).toBe(true);
    }
  });

  it('does not claim a board is readable from behind it', () => {
    const wall = NUMBER_BOARDS.find((board) => board.id === 'wall-left-0')!;
    // Outside the hall, through the wall it is bolted to.
    expect(isReadableFrom(wall, wall.x - 5, wall.z)).toBe(false);
    expect(isReadableFrom(wall, wall.x + 5, wall.z)).toBe(true);
  });

  it('agrees with the viewing angle it publishes', () => {
    const wall = NUMBER_BOARDS.find((board) => board.id === 'wall-left-0')!;
    const inside = MAX_VIEWING_ANGLE - 0.05;
    const outside = MAX_VIEWING_ANGLE + 0.05;
    // The face normal points towards +X, so the offsets are taken from there.
    expect(isReadableFrom(wall, wall.x + Math.cos(inside) * 8, wall.z + Math.sin(inside) * 8)).toBe(
      true,
    );
    expect(
      isReadableFrom(wall, wall.x + Math.cos(outside) * 8, wall.z + Math.sin(outside) * 8),
    ).toBe(false);
  });
});

describe('placement', () => {
  it('has unique ids', () => {
    expect(new Set(NUMBER_BOARDS.map((board) => board.id)).size).toBe(NUMBER_BOARDS.length);
  });

  it('draws every board at the aspect its texture is painted at', () => {
    // A board at any other ratio stretches the digits. The texture is 1536×512.
    for (const board of NUMBER_BOARDS) {
      expect(board.width / board.height, board.id).toBeCloseTo(BOARD_ASPECT, 2);
    }
  });

  it('keeps every board inside the hall and under the ceiling', () => {
    for (const board of NUMBER_BOARDS) {
      const box = boardBox(board);
      expect(box.minX, board.id).toBeGreaterThanOrEqual(HALL_SHELL.minX - 0.01);
      expect(box.maxX, board.id).toBeLessThanOrEqual(HALL_SHELL.maxX + 0.01);
      expect(box.maxZ, board.id).toBeLessThanOrEqual(HALL_SHELL.maxZ + 0.01);
      expect(box.maxY, board.id).toBeLessThanOrEqual(HALL_SHELL.ceilingHeight);
    }
  });

  it('hangs everything above head height', () => {
    // Walking into a tabellone would be a hall built by someone who never walked
    // through it.
    for (const board of NUMBER_BOARDS.filter((entry) => entry.mount !== 'STAGE')) {
      expect(boardBox(board).minY, board.id).toBeGreaterThan(STANDING_EYE_HEIGHT + 0.9);
    }
  });

  it('hangs the units over the aisles, not over the tables', () => {
    for (const board of hanging) {
      for (const table of TABLES) {
        const gap = Math.hypot(board.x - table.x, board.z - table.z);
        expect(gap, `${board.id} over table ${table.index}`).toBeGreaterThan(TABLE_ISLAND_RADIUS);
      }
    }
  });

  it('keeps the drop rods clear of the ceiling lamps', () => {
    // A hanging unit is held up by a rod that runs to the ceiling, and the lamps
    // hang from the same ceiling. Two fittings in the same place is a fitting
    // growing out of another one.
    const clearance = 0.46 + 0.06 + 0.3;
    for (const board of hanging) {
      for (const lamp of CEILING_LAMPS) {
        expect(
          Math.hypot(board.x - lamp.x, board.z - lamp.z),
          `${board.id} against the lamp at ${lamp.x},${lamp.z}`,
        ).toBeGreaterThan(clearance);
      }
    }
  });

  it('spreads the boards across the room rather than clustering them', () => {
    // Sixteen boards all beside the stage would pass the coverage tests for the
    // front rows and leave the back of the hall exactly where it started.
    const zs = NUMBER_BOARDS.map((board) => board.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(40);
    const xs = NUMBER_BOARDS.map((board) => board.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
  });
});

/**
 * Ray from the eye to the middle of the stage screen against a board's box.
 *
 * The slab method: for each axis work out the interval of the ray that lies
 * inside the box, and the box is hit when all three intervals overlap.
 */
function blocksStageView(board: BoardPlacement, eyeX: number, eyeY: number, eyeZ: number): boolean {
  const box = boardBox(board);
  const origin = [eyeX, eyeY, eyeZ];
  const direction = [STAGE_SCREEN.x - eyeX, STAGE_SCREEN.y - eyeY, STAGE_SCREEN.z - eyeZ];
  const low = [box.minX, box.minY, box.minZ];
  const high = [box.maxX, box.maxY, box.maxZ];

  let enter = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const d = direction[axis]!;
    const o = origin[axis]!;
    if (Math.abs(d) < 1e-9) {
      if (o < low[axis]! || o > high[axis]!) return false;
      continue;
    }
    const t1 = (low[axis]! - o) / d;
    const t2 = (high[axis]! - o) / d;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return false;
  }
  return true;
}

describe('the stage stays visible', () => {
  it('never puts a hanging unit between a seat and the stage screen', () => {
    // The whole point of adding boards is that people can read the numbers. A
    // board that hides the presenter has made the room worse, not better.
    for (const seat of SEATS) {
      for (const eye of [SEATED_EYE_HEIGHT, STANDING_EYE_HEIGHT]) {
        for (const board of hanging) {
          expect(
            blocksStageView(board, seat.x, eye, seat.z),
            `${board.id} blocks ${seat.id} at eye ${eye}`,
          ).toBe(false);
        }
      }
    }
  });

  it('would catch a unit hung low enough to matter', () => {
    // Guards the guard: the slab test has to actually detect an obstruction, or
    // the assertion above is a tautology that passes whatever we hang up there.
    // The obstruction is put squarely on the line, halfway to the screen.
    const seat = SEATS.find((entry) => entry.z > 20)!;
    const midpoint = {
      x: (seat.x + STAGE_SCREEN.x) / 2,
      y: (SEATED_EYE_HEIGHT + STAGE_SCREEN.y) / 2,
      z: (seat.z + STAGE_SCREEN.z) / 2,
    };
    const inTheWay: BoardPlacement = { ...hanging[0]!, ...midpoint };
    expect(blocksStageView(inTheWay, seat.x, SEATED_EYE_HEIGHT, seat.z)).toBe(true);
  });
});
