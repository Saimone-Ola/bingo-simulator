/**
 * Which of six cards is worth looking at.
 *
 * Six cards at once is the whole difficulty of the sestina mode: a player
 * cannot scan ninety numbers across six grids while the caller keeps going. So
 * the interface has to answer one question for them — *which card is closest to
 * winning* — and it has to answer it the same way the server would score it, or
 * it is pointing at the wrong card.
 *
 * Pure functions, so the ranking can be asserted rather than eyeballed.
 */

import { ITALIAN_CARD_COLUMNS, ITALIAN_CARD_ROWS } from '@bingo/shared';

export interface CardLike {
  /** `cells[row * 9 + column]`, null where blank. */
  cells: readonly (number | null)[];
}

export interface RowProgress {
  row: number;
  /** Numbers on this row that have been called. */
  marked: number;
  /** Numbers on this row in total, always five on a well formed card. */
  total: number;
}

export interface CardProgress {
  index: number;
  rows: RowProgress[];
  /** Best row on the card, as marked count. */
  bestRow: number;
  /** Every number on the card that has been called. */
  markedTotal: number;
  cardTotal: number;
  /** One away from completing a row: the state worth flagging loudly. */
  oneFromLine: boolean;
  /** One away from completing the whole card. */
  oneFromBingo: boolean;
}

export function cardProgress(
  card: CardLike,
  index: number,
  drawn: ReadonlySet<number>,
): CardProgress {
  const rows: RowProgress[] = [];
  let markedTotal = 0;
  let cardTotal = 0;

  for (let row = 0; row < ITALIAN_CARD_ROWS; row += 1) {
    let marked = 0;
    let total = 0;
    for (let column = 0; column < ITALIAN_CARD_COLUMNS; column += 1) {
      const value = card.cells[row * ITALIAN_CARD_COLUMNS + column];
      if (value === null || value === undefined) continue;
      total += 1;
      if (drawn.has(value)) marked += 1;
    }
    rows.push({ row, marked, total });
    markedTotal += marked;
    cardTotal += total;
  }

  const bestRow = rows.reduce((best, row) => Math.max(best, row.marked), 0);
  const bestRowTotal = rows.find((row) => row.marked === bestRow)?.total ?? 5;

  return {
    index,
    rows,
    bestRow,
    markedTotal,
    cardTotal,
    oneFromLine: bestRow === bestRowTotal - 1,
    oneFromBingo: cardTotal > 0 && markedTotal === cardTotal - 1,
  };
}

/**
 * Orders cards by how close they are to winning.
 *
 * Nearly-full card first, then nearly-full row, then raw progress. The order
 * matters because it decides what gets highlighted, and highlighting the wrong
 * card is worse than highlighting none: the player trusts it and stops looking
 * at the others.
 */
export function rankCards(
  cards: readonly CardLike[],
  drawn: ReadonlySet<number>,
): CardProgress[] {
  return cards
    .map((card, index) => cardProgress(card, index, drawn))
    .sort((a, b) => {
      if (a.oneFromBingo !== b.oneFromBingo) return a.oneFromBingo ? -1 : 1;
      if (a.bestRow !== b.bestRow) return b.bestRow - a.bestRow;
      if (a.markedTotal !== b.markedTotal) return b.markedTotal - a.markedTotal;
      return a.index - b.index;
    });
}

/**
 * The card to draw attention to, or `null`.
 *
 * Returns nothing before anything is close, because a highlight that is always
 * on is a highlight that means nothing. The threshold is "one away from a line"
 * — the first moment a player would actually want to be looking somewhere
 * specific.
 */
export function cardToWatch(
  cards: readonly CardLike[],
  drawn: ReadonlySet<number>,
): CardProgress | null {
  const best = rankCards(cards, drawn)[0];
  if (!best) return null;
  if (!best.oneFromBingo && !best.oneFromLine) return null;
  return best;
}

/** Short Italian phrase for what a card is one away from. */
export function progressLabel(progress: CardProgress): string | null {
  if (progress.oneFromBingo) return 'a un numero dal bingo';
  if (progress.oneFromLine) return 'a un numero dalla cinquina';
  return null;
}
