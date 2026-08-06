import { describe, expect, it } from 'vitest';
import { cardProgress, cardToWatch, progressLabel, rankCards, type CardLike } from '../sestinaLayout';

/**
 * Which of six cards to point at.
 *
 * Highlighting the wrong card is worse than highlighting none: the player
 * trusts it and stops watching the others.
 */

/** Card whose three rows hold the given numbers, five to a row. */
function card(...rows: number[][]): CardLike {
  const cells: (number | null)[] = Array.from({ length: 27 }, () => null);
  rows.forEach((numbers, row) => {
    numbers.forEach((value, index) => {
      // Spread across the nine columns; the exact column does not matter here.
      cells[row * 9 + index] = value;
    });
  });
  return { cells };
}

const A = card([1, 2, 3, 4, 5], [10, 11, 12, 13, 14], [20, 21, 22, 23, 24]);
const B = card([30, 31, 32, 33, 34], [40, 41, 42, 43, 44], [50, 51, 52, 53, 54]);

describe('progress on one card', () => {
  it('counts nothing when nothing has been called', () => {
    const progress = cardProgress(A, 0, new Set());
    expect(progress.markedTotal).toBe(0);
    expect(progress.bestRow).toBe(0);
    expect(progress.cardTotal).toBe(15);
    expect(progress.oneFromLine).toBe(false);
    expect(progress.oneFromBingo).toBe(false);
  });

  it('counts each row separately', () => {
    const progress = cardProgress(A, 0, new Set([1, 2, 10]));
    expect(progress.rows.map((row) => row.marked)).toEqual([2, 1, 0]);
    expect(progress.bestRow).toBe(2);
  });

  it('spots a card one number from a line', () => {
    const progress = cardProgress(A, 0, new Set([1, 2, 3, 4]));
    expect(progress.oneFromLine).toBe(true);
    expect(progress.oneFromBingo).toBe(false);
  });

  it('stops flagging a line once it is complete', () => {
    const progress = cardProgress(A, 0, new Set([1, 2, 3, 4, 5]));
    expect(progress.oneFromLine).toBe(false);
    expect(progress.bestRow).toBe(5);
  });

  it('spots a card one number from bingo', () => {
    const all = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 20, 21, 22, 23];
    const progress = cardProgress(A, 0, new Set(all));
    expect(progress.oneFromBingo).toBe(true);
  });

  it('ignores numbers that are not on the card', () => {
    expect(cardProgress(A, 0, new Set([88, 89, 90])).markedTotal).toBe(0);
  });
});

describe('ranking', () => {
  it('puts a card one from bingo ahead of one from a line', () => {
    const nearBingo = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 20, 21, 22, 23];
    const ranked = rankCards([B, A], new Set([...nearBingo, 30, 31, 32, 33]));
    // A is second in the input but nearest to winning.
    expect(ranked[0]!.index).toBe(1);
    expect(ranked[0]!.oneFromBingo).toBe(true);
  });

  it('prefers the better row when neither is near bingo', () => {
    const ranked = rankCards([A, B], new Set([1, 2, 30, 31, 32]));
    expect(ranked[0]!.index).toBe(1);
    expect(ranked[0]!.bestRow).toBe(3);
  });

  it('breaks a tie by card order, so the highlight does not jitter', () => {
    const ranked = rankCards([A, B], new Set([1, 2, 30, 31]));
    expect(ranked.map((entry) => entry.index)).toEqual([0, 1]);
  });

  it('returns one entry per card', () => {
    expect(rankCards([A, B, A, B, A, B], new Set([1]))).toHaveLength(6);
  });
});

describe('what to watch', () => {
  it('says nothing while nothing is close', () => {
    // A highlight that is always on is a highlight that means nothing.
    expect(cardToWatch([A, B], new Set([1, 30]))).toBeNull();
  });

  it('points at the card once one is a number from a line', () => {
    const watch = cardToWatch([A, B], new Set([1, 2, 3, 4]));
    expect(watch?.index).toBe(0);
    expect(progressLabel(watch!)).toBe('a un numero dalla cinquina');
  });

  it('changes its wording when the card is a number from bingo', () => {
    const all = [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 20, 21, 22, 23];
    const watch = cardToWatch([A], new Set(all));
    expect(progressLabel(watch!)).toBe('a un numero dal bingo');
  });

  it('has no label for a card that is not close', () => {
    expect(progressLabel(cardProgress(A, 0, new Set([1])))).toBeNull();
  });

  it('copes with no cards at all', () => {
    expect(cardToWatch([], new Set([1]))).toBeNull();
  });
});
