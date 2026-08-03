import { randomInt } from 'node:crypto';
import { BINGO_CARD_SIZE, BINGO_FREE_INDEX } from '@bingo/shared';

function shuffle<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [values[index], values[target]] = [values[target]!, values[index]!];
  }
  return values;
}

export function createBingoPool(): number[] {
  return shuffle(Array.from({ length: 75 }, (_value, index) => index + 1));
}

/** Creates a standard 75-ball card: each column uses its own 15-number band. */
export function createBingoCard(): number[] {
  const columns = Array.from({ length: 5 }, (_, column) => {
    const start = column * 15 + 1;
    return shuffle(Array.from({ length: 15 }, (_value, index) => start + index))
      .slice(0, 5)
      .sort((a, b) => a - b);
  });

  const card = Array.from({ length: BINGO_CARD_SIZE }, (_value, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    return columns[column]![row]!;
  });
  card[BINGO_FREE_INDEX] = 0;
  return card;
}

const WINNING_LINES: readonly number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

export function findWinningNumbers(card: number[], called: ReadonlySet<number>): number[] | null {
  for (const line of WINNING_LINES) {
    if (line.every((index) => index === BINGO_FREE_INDEX || called.has(card[index]!))) {
      return line.map((index) => card[index]!).filter((number) => number !== 0);
    }
  }
  return null;
}
