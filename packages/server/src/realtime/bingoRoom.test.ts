import { describe, expect, it } from 'vitest';
import { BINGO_FREE_INDEX } from '@bingo/shared';
import { createBingoCard, findWinningNumbers } from './bingoRoom';

describe('BingoRoom rules', () => {
  it('creates valid 75-ball cards with a free centre', () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const card = createBingoCard();
      expect(card).toHaveLength(25);
      expect(card[BINGO_FREE_INDEX]).toBe(0);

      const nonFree = card.filter((number) => number !== 0);
      expect(new Set(nonFree).size).toBe(24);

      for (let index = 0; index < card.length; index += 1) {
        if (index === BINGO_FREE_INDEX) continue;
        const column = index % 5;
        const number = card[index]!;
        expect(number).toBeGreaterThanOrEqual(column * 15 + 1);
        expect(number).toBeLessThanOrEqual(column * 15 + 15);
      }
    }
  });

  it('accepts only a complete row, column or diagonal', () => {
    const card = createBingoCard();
    const firstRow = new Set(card.slice(0, 5));
    expect(findWinningNumbers(card, firstRow)).toEqual(card.slice(0, 5));

    firstRow.delete(card[4]!);
    expect(findWinningNumbers(card, firstRow)).toBeNull();
  });

  it('treats the centre as free when validating the middle column', () => {
    const card = createBingoCard();
    const middleColumn = new Set([card[2]!, card[7]!, card[17]!, card[22]!]);
    expect(findWinningNumbers(card, middleColumn)).toEqual([
      card[2],
      card[7],
      card[17],
      card[22],
    ]);
  });
});
