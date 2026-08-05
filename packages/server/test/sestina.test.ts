import { describe, expect, it } from 'vitest';
import {
  ITALIAN_BINGO_BALL_COUNT,
  ITALIAN_CARD_COLUMNS,
  ITALIAN_CARD_NUMBER_COUNT,
  SESTINA_CARD_COUNT,
  allocateColumnCounts,
  columnRange,
  columnSizes,
  createSestina,
  sestinaNumbers,
  validateSestina,
} from '@bingo/shared';
import { createSeededRandom } from '../src/realtime/bingoRules';

/**
 * The sestina.
 *
 * The headline requirement is the last test in this file: ten thousand sets,
 * every one of them covering exactly 1–90. Everything above it exists to say
 * *why* a set failed when one does, because "10.000 sets, one was wrong" is
 * not a debuggable failure on its own.
 */

const ALL_NUMBERS = Array.from({ length: ITALIAN_BINGO_BALL_COUNT }, (_v, i) => i + 1);

describe('the decades', () => {
  it('sum to ninety, which is the only reason six cards of fifteen fit', () => {
    const sizes = columnSizes();
    expect(sizes).toHaveLength(ITALIAN_CARD_COLUMNS);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(ITALIAN_BINGO_BALL_COUNT);
    expect(SESTINA_CARD_COUNT * ITALIAN_CARD_NUMBER_COUNT).toBe(ITALIAN_BINGO_BALL_COUNT);
  });

  it('has a short first column and a long last one', () => {
    expect(columnRange(0)).toEqual({ from: 1, to: 9 });
    expect(columnRange(8)).toEqual({ from: 80, to: 90 });
    expect(columnRange(4)).toEqual({ from: 40, to: 49 });
  });

  it('covers every number exactly once across the columns', () => {
    const covered: number[] = [];
    for (let column = 0; column < ITALIAN_CARD_COLUMNS; column += 1) {
      const { from, to } = columnRange(column);
      for (let value = from; value <= to; value += 1) covered.push(value);
    }
    expect(covered.sort((a, b) => a - b)).toEqual(ALL_NUMBERS);
  });
});

describe('column allocation', () => {
  it('gives every card fifteen numbers and every column its decade', () => {
    const sizes = columnSizes();
    for (let seed = 0; seed < 200; seed += 1) {
      const random = createSeededRandom(`alloc-${seed}`);
      const counts = allocateColumnCounts(random);
      expect(counts, `seed ${seed}`).toHaveLength(SESTINA_CARD_COUNT);

      for (const card of counts) {
        expect(card.reduce((sum, value) => sum + value, 0)).toBe(ITALIAN_CARD_NUMBER_COUNT);
        // No empty column, and never more than one per row.
        for (const value of card) {
          expect(value).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(3);
        }
      }

      for (let column = 0; column < ITALIAN_CARD_COLUMNS; column += 1) {
        const used = counts.reduce((sum, card) => sum + card[column]!, 0);
        expect(used, `column ${column}`).toBe(sizes[column]);
      }
    }
  });
});

describe('one set', () => {
  const set = createSestina(createSeededRandom('sestina-example'))!;

  it('is produced at all', () => {
    expect(set).not.toBeNull();
    expect(set.cards).toHaveLength(SESTINA_CARD_COUNT);
  });

  it('covers exactly 1 to 90', () => {
    expect(sestinaNumbers(set)).toEqual(ALL_NUMBERS);
  });

  it('passes its own validator', () => {
    expect(validateSestina(set)).toEqual([]);
  });

  it('is reproducible from its seed', () => {
    const again = createSestina(createSeededRandom('sestina-example'))!;
    expect(sestinaNumbers(again)).toEqual(sestinaNumbers(set));
    expect(again.cards[0]!.cells).toEqual(set.cards[0]!.cells);
  });

  it('is not the same set for a different seed', () => {
    const other = createSestina(createSeededRandom('sestina-other'))!;
    expect(other.cards[0]!.cells).not.toEqual(set.cards[0]!.cells);
  });
});

describe('the validator catches what it is for', () => {
  const good = createSestina(createSeededRandom('validator'))!;

  function damaged(mutate: (cells: (number | null)[]) => void) {
    const copy = { cards: good.cards.map((card) => ({ cells: [...card.cells] })) };
    mutate(copy.cards[0]!.cells);
    return validateSestina(copy);
  }

  it('notices a missing number', () => {
    const index = good.cards[0]!.cells.findIndex((value) => value !== null);
    expect(damaged((cells) => (cells[index] = null))).toContain('wrong_numbers_per_card');
  });

  it('notices a duplicate', () => {
    const target = good.cards[1]!.cells.find((value) => value !== null)!;
    const index = good.cards[0]!.cells.findIndex((value) => value !== null);
    const problems = damaged((cells) => (cells[index] = target));
    expect(problems).toContain('duplicate_number');
    expect(problems).toContain('missing_number');
  });

  it('notices a number in the wrong column', () => {
    // Put an eighties number in the first column.
    const index = good.cards[0]!.cells.findIndex(
      (value, at) => value !== null && at % ITALIAN_CARD_COLUMNS === 0,
    );
    expect(damaged((cells) => (cells[index] = 85))).toContain('number_out_of_column');
  });

  it('notices the wrong number of cards', () => {
    expect(validateSestina({ cards: good.cards.slice(0, 5) })).toContain('wrong_card_count');
  });
});

describe('ten thousand sets', () => {
  it('every one covers exactly the numbers 1 to 90', () => {
    // The acceptance criterion, run in full. Failures are reported with their
    // seed and their reason so a bad set can be reproduced on its own.
    const failures: string[] = [];

    for (let index = 0; index < 10_000; index += 1) {
      const set = createSestina(createSeededRandom(`bulk-${index}`));
      if (!set) {
        failures.push(`bulk-${index}: no set produced`);
        continue;
      }
      const problems = validateSestina(set);
      if (problems.length > 0) {
        failures.push(`bulk-${index}: ${problems.join(', ')}`);
        continue;
      }
      const numbers = sestinaNumbers(set);
      if (numbers.length !== ITALIAN_BINGO_BALL_COUNT) {
        failures.push(`bulk-${index}: ${numbers.length} numbers`);
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
    expect(failures).toHaveLength(0);
  }, 120_000);
});
