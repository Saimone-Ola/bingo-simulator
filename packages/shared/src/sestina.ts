/**
 * The sestina: six cards that together hold every number from 1 to 90.
 *
 * This is not six cards drawn independently. It is a partition, and it has to
 * satisfy three constraints at once:
 *
 * - each card holds 15 numbers, five on each of its three rows;
 * - column `c` only ever holds numbers from its decade, and those decades are
 *   not the same size — the first holds 1–9 and the last holds 80–90;
 * - across the six cards every number appears exactly once.
 *
 * The construction works on *counts* first and numbers second, which is what
 * makes it tractable. Each column has to give out as many slots as its decade
 * has numbers; every card takes one slot from every column to begin with,
 * leaving a small remainder to distribute under a cap of three per column. Only
 * once the counts work out are the actual numbers dealt into the chosen cells.
 *
 * The generator is seeded and therefore reproducible, and every set it returns
 * is verified before being handed back: a sestina that failed to cover 1–90
 * would be a silently broken product, so it is refused rather than returned.
 */

import {
  ITALIAN_BINGO_BALL_COUNT,
  ITALIAN_CARD_COLUMNS,
  ITALIAN_CARD_NUMBER_COUNT,
  ITALIAN_CARD_ROWS,
} from './bingo';

/** Cards in one sestina set. Six is what covers 90 numbers at 15 each. */
export const SESTINA_CARD_COUNT = 6;

/** Numbers a card may hold in one column. */
const MIN_PER_COLUMN = 1;
const MAX_PER_COLUMN = 3;

const NUMBERS_PER_ROW = 5;

/**
 * How many numbers each column's decade holds.
 *
 * The first column is short (1–9) and the last is long (80–90); the rest hold
 * ten each. They sum to 90, which is the only reason six cards of fifteen can
 * cover the board exactly.
 */
export function columnSizes(): number[] {
  return Array.from({ length: ITALIAN_CARD_COLUMNS }, (_value, column) => {
    if (column === 0) return 9;
    if (column === ITALIAN_CARD_COLUMNS - 1) return 11;
    return 10;
  });
}

/** Lowest and highest number in a column, inclusive. */
export function columnRange(column: number): { from: number; to: number } {
  if (column === 0) return { from: 1, to: 9 };
  if (column === ITALIAN_CARD_COLUMNS - 1) return { from: 80, to: ITALIAN_BINGO_BALL_COUNT };
  return { from: column * 10, to: column * 10 + 9 };
}

export type SestinaRandom = () => number;

function shuffled<T>(values: readonly T[], random: SestinaRandom): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

/**
 * How many numbers each card takes from each column.
 *
 * Returns a `SESTINA_CARD_COUNT x ITALIAN_CARD_COLUMNS` grid whose column sums
 * are the decade sizes and whose row sums are 15.
 */
export function allocateColumnCounts(random: SestinaRandom): number[][] {
  const sizes = columnSizes();
  // Everyone starts with one from every column, which is also the rule that a
  // card never has an empty column.
  const counts = Array.from({ length: SESTINA_CARD_COUNT }, () =>
    Array.from({ length: ITALIAN_CARD_COLUMNS }, () => MIN_PER_COLUMN),
  );

  const perCardRemaining = Array.from(
    { length: SESTINA_CARD_COUNT },
    () => ITALIAN_CARD_NUMBER_COUNT - ITALIAN_CARD_COLUMNS,
  );
  const perColumnRemaining = sizes.map((size) => size - SESTINA_CARD_COUNT);

  // Hand out the remainder column by column, always to the cards with the most
  // room left. Taking the emptiest first is what stops the last column being
  // asked to fill a card that is already full.
  const columns = shuffled(
    Array.from({ length: ITALIAN_CARD_COLUMNS }, (_value, column) => column),
    random,
  );

  for (const column of columns) {
    let left = perColumnRemaining[column]!;
    while (left > 0) {
      const candidates = Array.from({ length: SESTINA_CARD_COUNT }, (_value, card) => card)
        .filter(
          (card) => counts[card]![column]! < MAX_PER_COLUMN && perCardRemaining[card]! > 0,
        )
        .sort((a, b) => perCardRemaining[b]! - perCardRemaining[a]!);

      const chosen = candidates[0];
      if (chosen === undefined) return [];

      const row = counts[chosen]!;
      row[column] = row[column]! + 1;
      perCardRemaining[chosen] = perCardRemaining[chosen]! - 1;
      left -= 1;
    }
  }

  if (perCardRemaining.some((remaining) => remaining !== 0)) return [];
  return counts;
}

/**
 * Places a card's column counts into rows, five to a row.
 *
 * Each column's numbers must land on distinct rows — two numbers from the same
 * decade cannot share a row cell — so this is a small bipartite fill, done
 * greedily against whichever rows have the most space left.
 */
export function placeRows(columnCounts: readonly number[], random: SestinaRandom): boolean[][] | null {
  const grid = Array.from({ length: ITALIAN_CARD_ROWS }, () =>
    Array.from({ length: ITALIAN_CARD_COLUMNS }, () => false),
  );
  const rowSpace = Array.from({ length: ITALIAN_CARD_ROWS }, () => NUMBERS_PER_ROW);

  // Fullest columns first: a column needing all three rows has no freedom, and
  // placing it last is how the greedy paints itself into a corner.
  const order = shuffled(
    Array.from({ length: ITALIAN_CARD_COLUMNS }, (_value, column) => column),
    random,
  ).sort((a, b) => columnCounts[b]! - columnCounts[a]!);

  for (const column of order) {
    const need = columnCounts[column]!;
    const rows = shuffled(
      Array.from({ length: ITALIAN_CARD_ROWS }, (_value, row) => row),
      random,
    ).sort((a, b) => rowSpace[b]! - rowSpace[a]!);

    if (rows.filter((row) => rowSpace[row]! > 0).length < need) return null;

    for (let taken = 0; taken < need; taken += 1) {
      const row = rows[taken]!;
      if (rowSpace[row]! <= 0) return null;
      grid[row]![column] = true;
      rowSpace[row] = rowSpace[row]! - 1;
    }
  }

  if (rowSpace.some((space) => space !== 0)) return null;
  return grid;
}

export interface SestinaCard {
  /** `cells[row * 9 + column]`, null where the cell is blank. */
  cells: (number | null)[];
}

export interface SestinaSet {
  cards: SestinaCard[];
}

/**
 * Builds one sestina.
 *
 * Retries rather than backtracking: the greedy placement fails rarely and a
 * fresh shuffle is far cheaper than a solver. Returns `null` only if it could
 * not find a valid set at all, which the caller must treat as an error and not
 * as an empty result.
 */
export function createSestina(random: SestinaRandom, attempts = 60): SestinaSet | null {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const counts = allocateColumnCounts(random);
    if (counts.length === 0) continue;

    const grids: boolean[][][] = [];
    let ok = true;
    for (const cardCounts of counts) {
      const grid = placeRows(cardCounts, random);
      if (!grid) {
        ok = false;
        break;
      }
      grids.push(grid);
    }
    if (!ok) continue;

    // Deal the actual numbers. Each column's decade is shuffled once and then
    // handed out in order, which is what guarantees no number is used twice.
    const pools = columnSizes().map((_size, column) => {
      const { from, to } = columnRange(column);
      return shuffled(
        Array.from({ length: to - from + 1 }, (_value, offset) => from + offset),
        random,
      );
    });

    const cards: SestinaCard[] = grids.map(() => ({
      cells: Array.from({ length: ITALIAN_CARD_ROWS * ITALIAN_CARD_COLUMNS }, () => null),
    }));

    for (let column = 0; column < ITALIAN_CARD_COLUMNS; column += 1) {
      const pool = pools[column]!;
      let next = 0;
      for (let card = 0; card < SESTINA_CARD_COUNT; card += 1) {
        // Within a card, a column's numbers read top to bottom, as on a
        // printed card.
        const rows: number[] = [];
        for (let row = 0; row < ITALIAN_CARD_ROWS; row += 1) {
          if (grids[card]![row]![column]) rows.push(row);
        }
        const values = rows.map(() => pool[next++]!).sort((a, b) => a - b);
        rows.forEach((row, index) => {
          cards[card]!.cells[row * ITALIAN_CARD_COLUMNS + column] = values[index]!;
        });
      }
    }

    const set = { cards };
    // Verified before it leaves: a sestina that failed to cover the board would
    // be a silently broken product, so it is refused rather than returned.
    if (validateSestina(set).length === 0) return set;
  }

  return null;
}

export type SestinaProblem =
  | 'wrong_card_count'
  | 'wrong_numbers_per_card'
  | 'wrong_numbers_per_row'
  | 'duplicate_number'
  | 'missing_number'
  | 'number_out_of_column';

/**
 * Checks a set against every rule it has to satisfy.
 *
 * Kept separate from the generator so the server can re-check a set it did not
 * build, and so the test suite is asserting the rules rather than the
 * implementation of them.
 */
export function validateSestina(set: SestinaSet): SestinaProblem[] {
  const problems: SestinaProblem[] = [];

  if (set.cards.length !== SESTINA_CARD_COUNT) problems.push('wrong_card_count');

  const seen = new Set<number>();
  let duplicate = false;

  for (const card of set.cards) {
    const numbers = card.cells.filter((value): value is number => value !== null);
    if (numbers.length !== ITALIAN_CARD_NUMBER_COUNT) problems.push('wrong_numbers_per_card');

    for (let row = 0; row < ITALIAN_CARD_ROWS; row += 1) {
      const inRow = card.cells
        .slice(row * ITALIAN_CARD_COLUMNS, (row + 1) * ITALIAN_CARD_COLUMNS)
        .filter((value) => value !== null).length;
      if (inRow !== NUMBERS_PER_ROW) {
        problems.push('wrong_numbers_per_row');
        break;
      }
    }

    card.cells.forEach((value, index) => {
      if (value === null) return;
      const column = index % ITALIAN_CARD_COLUMNS;
      const { from, to } = columnRange(column);
      if (value < from || value > to) problems.push('number_out_of_column');
      if (seen.has(value)) duplicate = true;
      seen.add(value);
    });
  }

  if (duplicate) problems.push('duplicate_number');
  if (seen.size !== ITALIAN_BINGO_BALL_COUNT) problems.push('missing_number');

  return [...new Set(problems)];
}

/** Every number the set covers, sorted. Used by the tests and the editor. */
export function sestinaNumbers(set: SestinaSet): number[] {
  const numbers: number[] = [];
  for (const card of set.cards) {
    for (const value of card.cells) if (value !== null) numbers.push(value);
  }
  return numbers.sort((a, b) => a - b);
}
