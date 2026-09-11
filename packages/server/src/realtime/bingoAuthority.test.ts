import { describe, expect, it } from 'vitest';
import {
  ITALIAN_CARD_CELL_COUNT,
  bingoClaimSchema,
  bingoMarkSchema,
  bingoPurchaseSchema,
} from '@bingo/shared';
import {
  autoMarkCalledNumbers,
  cardNumbers,
  createUniqueItalianCards,
  findBingoNumbers,
  findCinquinaNumbers,
} from './bingoRules';

/**
 * Guardrails for the parts of the protocol the new 3D hall touches.
 *
 * The client now marks numbers by clicking a card lying on a table, so it sends
 * a card index it picked itself. These tests pin the properties that keep that
 * safe: the wire schema constrains the index, marks never influence the win
 * check, and a win is decided only from the card the server issued and the
 * numbers the server actually drew.
 */

describe('mark protocol', () => {
  const roundId = '7e7e9345-7291-4afb-8697-013183b0bb31';
  it('requires a card index and a cell index inside a real card', () => {
    const base = { round: 1, roundId, cardIndex: 0, cellIndex: 0, marked: true };
    expect(bingoMarkSchema.safeParse(base).success).toBe(true);
    expect(bingoMarkSchema.safeParse({ ...base, cardIndex: undefined }).success).toBe(false);
    expect(bingoMarkSchema.safeParse({ ...base, cardIndex: -1 }).success).toBe(false);
    expect(bingoMarkSchema.safeParse({ ...base, cardIndex: 12 }).success).toBe(false);
    expect(
      bingoMarkSchema.safeParse({ ...base, cellIndex: ITALIAN_CARD_CELL_COUNT }).success,
    ).toBe(false);
    expect(bingoMarkSchema.safeParse({ ...base, cellIndex: 1.5 }).success).toBe(false);
  });

  it('rejects extra fields, so a client cannot smuggle state into a mark', () => {
    expect(
      bingoMarkSchema.safeParse({
        round: 1,
        roundId,
        cardIndex: 0,
        cellIndex: 0,
        marked: true,
        cells: [1, 2, 3],
      }).success,
    ).toBe(false);
  });

  it('carries the card index on a claim as well, and pins it to a real card', () => {
    const base = { round: 1, roundId, tier: 'BINGO' as const, cardIndex: 2, requestId: 'claim-12345678' };
    expect(bingoClaimSchema.safeParse(base).success).toBe(true);
    expect(bingoClaimSchema.safeParse({ ...base, cardIndex: 40 }).success).toBe(false);
    expect(
      bingoClaimSchema.safeParse({ ...base, winningNumbers: [1, 2, 3, 4, 5] }).success,
    ).toBe(false);
  });

  it('requires a persistent round UUID on every purchase, mark and claim', () => {
    expect(bingoPurchaseSchema.safeParse({ quantity: 1, markingMode: 'MANUAL', requestId: 'purchase-1234' }).success).toBe(false);
    expect(bingoMarkSchema.safeParse({ round: 1, cardIndex: 0, cellIndex: 0, marked: true }).success).toBe(false);
    expect(bingoClaimSchema.safeParse({ round: 1, tier: 'BINGO', cardIndex: 0, requestId: 'claim-1234' }).success).toBe(false);
  });
});

describe('win verification ignores what the client marked', () => {
  it('does not award a Cinquina for marks on numbers that were never drawn', () => {
    const [card] = createUniqueItalianCards(1, 'authority-seed');
    expect(card).toBeDefined();
    if (!card) return;

    // A tampered client marks the whole first row without a single draw.
    const forged = { ...card, markedIndices: Array.from({ length: 9 }, (_v, index) => index) };
    expect(findCinquinaNumbers(forged, new Set())).toBeNull();
    expect(findBingoNumbers(forged, new Set())).toBeNull();
  });

  it('awards a Cinquina from drawn numbers even when the player marked nothing', () => {
    const [card] = createUniqueItalianCards(1, 'authority-seed');
    expect(card).toBeDefined();
    if (!card) return;

    const firstRow = card.cells.slice(0, 9).filter((value): value is number => value !== null);
    const unmarked = { ...card, markedIndices: [] };
    expect(findCinquinaNumbers(unmarked, new Set(firstRow))).toEqual(firstRow);
  });

  it('awards a Bingo only when every number on the card has been drawn', () => {
    const [card] = createUniqueItalianCards(1, 'authority-bingo');
    expect(card).toBeDefined();
    if (!card) return;

    const values = cardNumbers(card);
    expect(findBingoNumbers(card, new Set(values.slice(0, values.length - 1)))).toBeNull();
    expect(findBingoNumbers(card, new Set(values))).toEqual(values);
  });
});

describe('per-card marking', () => {
  it('keeps each card in a multi-card purchase independent', () => {
    const cards = createUniqueItalianCards(6, 'multi-card-seed');
    expect(cards).toHaveLength(6);

    // Marking on card 2 must not appear on any other card, which is exactly
    // what the card index in the mark message protects.
    const target = cards[2];
    expect(target).toBeDefined();
    if (!target) return;
    target.markedIndices = [0, 4];

    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      if (!card) continue;
      expect(card.markedIndices).toEqual(index === 2 ? [0, 4] : []);
    }
  });

  it('issues distinct cards so two indices are never the same card', () => {
    const cards = createUniqueItalianCards(6, 'unique-seed');
    expect(new Set(cards.map((card) => card.cells.join(','))).size).toBe(cards.length);
    expect(cards.map((card) => card.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('automatic marking follows the draw and never invents a mark', () => {
    const cards = createUniqueItalianCards(3, 'auto-seed');
    const first = cards[0];
    expect(first).toBeDefined();
    if (!first) return;

    const values = cardNumbers(first);
    const drawn = new Set(values.slice(0, 6));
    const marked = autoMarkCalledNumbers(first, drawn);

    expect(marked.markedIndices).toHaveLength(6);
    for (const index of marked.markedIndices) {
      const value = marked.cells[index];
      expect(value).not.toBeNull();
      expect(drawn.has(value as number)).toBe(true);
    }
  });
});
