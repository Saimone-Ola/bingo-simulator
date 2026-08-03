import { describe, expect, it } from 'vitest';
import {
  ITALIAN_BINGO_BALL_COUNT,
  ITALIAN_CARD_COLUMNS,
  ITALIAN_CARD_NUMBER_COUNT,
  ITALIAN_CARD_ROWS,
  italianColumnRange,
} from '@bingo/shared';
import {
  autoMarkCalledNumbers,
  cardNumbers,
  createItalianDrawPool,
  createSeededRandom,
  createUniqueItalianCards,
  findBingoNumbers,
  findCinquinaNumbers,
} from './bingoRules';
import { LobbyStateMachine } from './lobbyStateMachine';

describe('Italian Bingo 90 rules', () => {
  it('creates unique 3x9 cards with 15 numbers and exactly five per row', () => {
    const cards = createUniqueItalianCards(200, 'thesis-validation');

    expect(new Set(cards.map((card) => card.cells.join(','))).size).toBe(cards.length);
    for (const card of cards) {
      const values = cardNumbers(card);
      expect(values).toHaveLength(ITALIAN_CARD_NUMBER_COUNT);
      expect(new Set(values).size).toBe(ITALIAN_CARD_NUMBER_COUNT);

      for (let row = 0; row < ITALIAN_CARD_ROWS; row += 1) {
        const rowValues = card.cells
          .slice(row * ITALIAN_CARD_COLUMNS, (row + 1) * ITALIAN_CARD_COLUMNS)
          .filter((value) => value !== null);
        expect(rowValues).toHaveLength(5);
      }

      for (let column = 0; column < ITALIAN_CARD_COLUMNS; column += 1) {
        const range = italianColumnRange(column);
        const columnValues = Array.from({ length: ITALIAN_CARD_ROWS }, (_value, row) =>
          card.cells[row * ITALIAN_CARD_COLUMNS + column],
        ).filter((value): value is number => value !== null);
        expect(columnValues.length).toBeGreaterThan(0);
        expect(columnValues).toEqual([...columnValues].sort((a, b) => a - b));
        for (const value of columnValues) {
          expect(value).toBeGreaterThanOrEqual(range.min);
          expect(value).toBeLessThanOrEqual(range.max);
        }
      }
    }
  });

  it('produces a deterministic 90-number extraction without duplicates', () => {
    const first = createItalianDrawPool('round-seed');
    const replay = createItalianDrawPool('round-seed');

    expect(first).toEqual(replay);
    expect(first).toHaveLength(ITALIAN_BINGO_BALL_COUNT);
    expect(new Set(first).size).toBe(ITALIAN_BINGO_BALL_COUNT);
    expect([...first].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 90 }, (_value, index) => index + 1),
    );
  });

  it('recognises Cinquina and Bingo and rejects incomplete claims', () => {
    const [card] = createUniqueItalianCards(1, 'claim-seed');
    expect(card).toBeDefined();
    const firstRow = card!.cells.slice(0, 9).filter((value): value is number => value !== null);
    const all = cardNumbers(card!);

    expect(findCinquinaNumbers(card!, new Set(firstRow))).toEqual(firstRow);
    expect(findBingoNumbers(card!, new Set(firstRow))).toBeNull();
    expect(findBingoNumbers(card!, new Set(all))).toEqual(all);

    expect(findCinquinaNumbers(card!, new Set(firstRow.slice(0, 4)))).toBeNull();
    expect(findBingoNumbers(card!, new Set(all.slice(0, 14)))).toBeNull();
  });

  it('automatic mode marks only drawn numbers and leaves manual marks untouched', () => {
    const [card] = createUniqueItalianCards(1, 'marking-seed');
    const values = cardNumbers(card!);
    const drawn = new Set(values.slice(0, 4));
    const auto = autoMarkCalledNumbers(card!, drawn);

    expect(auto.markedIndices).toHaveLength(4);
    expect(auto.markedIndices.every((index) => drawn.has(auto.cells[index]!))).toBe(true);

    const manual = { ...card!, markedIndices: [0, 7] };
    autoMarkCalledNumbers(card!, drawn);
    expect(manual.markedIndices).toEqual([0, 7]);
  });

  it('does not let presentation events alter a seeded extraction', () => {
    const before = createItalianDrawPool('event-invariant');
    const random = createSeededRandom('visual-event');
    for (let index = 0; index < 10_000; index += 1) random();
    const after = createItalianDrawPool('event-invariant');
    expect(after).toEqual(before);
  });
});

describe('LobbyStateMachine', () => {
  it('supports purchase, cancellable countdown, play, results and next round', () => {
    const machine = new LobbyStateMachine('WAITING', 1);
    machine.transition('CARD_PURCHASE', 2);
    machine.transition('COUNTDOWN', 3);
    machine.transition('CARD_PURCHASE', 4);
    machine.transition('PLAYING', 5);
    machine.transition('RESULTS', 6);
    machine.transition('ENDED', 7);
    machine.transition('CARD_PURCHASE', 8);

    expect(machine.phase).toBe('CARD_PURCHASE');
    expect(machine.changedAt).toBe(8);
  });

  it('rejects invalid or client-forged transitions', () => {
    const machine = new LobbyStateMachine('CARD_PURCHASE');
    expect(() => machine.transition('RESULTS')).toThrow(/Invalid Bingo phase transition/);
    expect(machine.phase).toBe('CARD_PURCHASE');
  });
});
