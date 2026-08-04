import { describe, expect, it } from 'vitest';
import {
  CARD_DEPTH,
  CARD_ROWS,
  CARD_COLUMNS,
  CARD_WIDTH,
  MAX_CARDS_ON_TABLE,
  ROW_PITCH,
  cellIndexFromUv,
  cellPosition,
  deckBounds,
  layoutCards,
} from '../cardLayout';

function overlaps(
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  return (
    Math.abs(a.x - b.x) < CARD_WIDTH - 0.001 && Math.abs(a.z - b.z) < CARD_DEPTH - 0.001
  );
}

describe('layoutCards', () => {
  it('places exactly one card per purchased card, for every supported count', () => {
    for (let count = 1; count <= MAX_CARDS_ON_TABLE; count += 1) {
      const placements = layoutCards(count);
      expect(placements).toHaveLength(count);
      expect(placements.map((placement) => placement.index).sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_value, index) => index),
      );
    }
  });

  it('keeps every card visible: no two cards overlap at any count', () => {
    for (let count = 1; count <= MAX_CARDS_ON_TABLE; count += 1) {
      const placements = layoutCards(count);
      for (let a = 0; a < placements.length; a += 1) {
        for (let b = a + 1; b < placements.length; b += 1) {
          const first = placements[a];
          const second = placements[b];
          expect(first).toBeDefined();
          expect(second).toBeDefined();
          if (!first || !second) continue;
          expect(overlaps(first, second)).toBe(false);
        }
      }
    }
  });

  it('centres a single card and pairs two side by side', () => {
    const [single] = layoutCards(1);
    expect(single?.x).toBe(0);
    expect(single?.z).toBe(0);

    const pair = layoutCards(2);
    expect(pair[0]?.x).toBeLessThan(0);
    expect(pair[1]?.x).toBeGreaterThan(0);
    expect(pair[0]?.z).toBeCloseTo(pair[1]?.z ?? Number.NaN, 6);
  });

  it('fans three cards into an arc and stacks four into two rows', () => {
    const three = layoutCards(3);
    expect(three[0]?.rotationY).toBeGreaterThan(0);
    expect(three[1]?.rotationY).toBeCloseTo(0, 6);
    expect(three[2]?.rotationY).toBeLessThan(0);

    const four = layoutCards(4);
    const rows = new Set(four.map((placement) => placement.z.toFixed(4)));
    expect(rows.size).toBe(2);
  });

  it('uses two rows for five and six cards, front row nearest the player', () => {
    for (const count of [5, 6]) {
      const placements = layoutCards(count);
      const front = placements.filter((placement) => placement.z > -ROW_PITCH / 2);
      const back = placements.filter((placement) => placement.z <= -ROW_PITCH / 2);
      expect(front).toHaveLength(3);
      expect(back).toHaveLength(count - 3);
    }
  });

  it('stays within a footprint a table can hold', () => {
    const bounds = deckBounds(layoutCards(MAX_CARDS_ON_TABLE));
    expect(bounds.maxX - bounds.minX).toBeLessThan(1.7);
    expect(bounds.maxZ - bounds.minZ).toBeLessThan(0.6);
  });

  it('clamps counts outside the supported range', () => {
    expect(layoutCards(0)).toHaveLength(0);
    expect(layoutCards(-3)).toHaveLength(0);
    expect(layoutCards(99)).toHaveLength(MAX_CARDS_ON_TABLE);
  });
});

describe('cellIndexFromUv', () => {
  it('maps the centre of every cell back to its own index', () => {
    const marginX = 0.028;
    const marginTop = 0.15;
    const marginBottom = 0.055;
    for (let index = 0; index < CARD_ROWS * CARD_COLUMNS; index += 1) {
      const column = index % CARD_COLUMNS;
      const row = Math.floor(index / CARD_COLUMNS);
      const u = marginX + ((column + 0.5) / CARD_COLUMNS) * (1 - marginX * 2);
      const localY = ((row + 0.5) / CARD_ROWS) * (1 - marginTop - marginBottom) + marginTop;
      const v = 1 - localY;
      expect(cellIndexFromUv(u, v)).toBe(index);
    }
  });

  it('rejects hits on the header strip and outside the grid', () => {
    expect(cellIndexFromUv(0.5, 0.97)).toBeNull();
    expect(cellIndexFromUv(0.5, 0.01)).toBeNull();
    expect(cellIndexFromUv(0.001, 0.5)).toBeNull();
    expect(cellIndexFromUv(0.999, 0.5)).toBeNull();
  });
});

describe('cellPosition', () => {
  it('puts row 0 furthest from the player and row 2 closest', () => {
    const top = cellPosition(0);
    const bottom = cellPosition(CARD_COLUMNS * 2);
    expect(top.z).toBeGreaterThan(bottom.z);
  });

  it('orders columns left to right', () => {
    expect(cellPosition(0).x).toBeLessThan(cellPosition(8).x);
  });

  it('keeps every cell inside the card', () => {
    for (let index = 0; index < CARD_ROWS * CARD_COLUMNS; index += 1) {
      const cell = cellPosition(index);
      expect(Math.abs(cell.x)).toBeLessThan(CARD_WIDTH / 2);
      expect(Math.abs(cell.z)).toBeLessThan(CARD_DEPTH / 2);
    }
  });
});
