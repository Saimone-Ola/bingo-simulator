import {
  ITALIAN_BINGO_BALL_COUNT,
  ITALIAN_CARD_CELL_COUNT,
  ITALIAN_CARD_COLUMNS,
  ITALIAN_CARD_NUMBER_COUNT,
  ITALIAN_CARD_ROWS,
  italianColumnRange,
  createSestina,
  type ItalianBingoCard,
} from '@bingo/shared';

export type RandomSource = () => number;

function seedToUint32(seed: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }
  return value >>> 0;
}

/** Small deterministic PRNG used only for reproducible cards and draw order. */
export function createSeededRandom(seed: string): RandomSource {
  let value = seedToUint32(seed);
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function shuffleWith<T>(values: readonly T[], random: RandomSource): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled;
}

export function createItalianDrawPool(seed: string): number[] {
  return shuffleWith(
    Array.from({ length: ITALIAN_BINGO_BALL_COUNT }, (_value, index) => index + 1),
    createSeededRandom(`${seed}:draw`),
  );
}

function createOccupancy(random: RandomSource): boolean[] {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const mask = Array<boolean>(ITALIAN_CARD_CELL_COUNT).fill(false);
    const occupiedColumns = new Set<number>();

    for (let row = 0; row < ITALIAN_CARD_ROWS; row += 1) {
      const columns = shuffleWith(
        Array.from({ length: ITALIAN_CARD_COLUMNS }, (_value, column) => column),
        random,
      ).slice(0, 5);
      for (const column of columns) {
        mask[row * ITALIAN_CARD_COLUMNS + column] = true;
        occupiedColumns.add(column);
      }
    }

    if (occupiedColumns.size === ITALIAN_CARD_COLUMNS) return mask;
  }
  throw new Error('Unable to generate a valid Italian Bingo occupancy mask');
}

function takeColumnNumbers(column: number, count: number, random: RandomSource): number[] {
  const { min, max } = italianColumnRange(column);
  return shuffleWith(
    Array.from({ length: max - min + 1 }, (_value, index) => min + index),
    random,
  )
    .slice(0, count)
    .sort((left, right) => left - right);
}

export function createItalianCard(
  random: RandomSource,
  index: number,
  id = `card-${index + 1}`,
): ItalianBingoCard {
  const occupancy = createOccupancy(random);
  const cells = Array<number | null>(ITALIAN_CARD_CELL_COUNT).fill(null);

  for (let column = 0; column < ITALIAN_CARD_COLUMNS; column += 1) {
    const occupiedRows = Array.from(
      { length: ITALIAN_CARD_ROWS },
      (_value, row) => row,
    ).filter((row) => occupancy[row * ITALIAN_CARD_COLUMNS + column]);
    const numbers = takeColumnNumbers(column, occupiedRows.length, random);

    occupiedRows.forEach((row, numberIndex) => {
      cells[row * ITALIAN_CARD_COLUMNS + column] = numbers[numberIndex]!;
    });
  }

  return { id, index, cells, markedIndices: [] };
}

export function cardSignature(card: Pick<ItalianBingoCard, 'cells'>): string {
  return card.cells.map((value) => value ?? 0).join(',');
}

export function createUniqueItalianCards(
  quantity: number,
  seed: string,
  idPrefix = 'card',
): ItalianBingoCard[] {
  const random = createSeededRandom(`${seed}:cards`);
  const cards: ItalianBingoCard[] = [];
  const signatures = new Set<string>();

  for (let index = 0; index < quantity; index += 1) {
    let card: ItalianBingoCard | null = null;
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const candidate = createItalianCard(random, index, `${idPrefix}-${index + 1}`);
      const signature = cardSignature(candidate);
      if (!signatures.has(signature)) {
        signatures.add(signature);
        card = candidate;
        break;
      }
    }
    if (!card) throw new Error('Unable to create unique Italian Bingo cards');
    cards.push(card);
  }
  return cards;
}

/** Six-card purchases are a real strip: each number 1–90 occurs exactly once. */
export function createPurchaseCards(quantity: number, seed: string, idPrefix: string): ItalianBingoCard[] {
  if (quantity !== 6) return createUniqueItalianCards(quantity, seed, idPrefix);
  const sestina = createSestina(createSeededRandom(`${seed}:sestina`));
  if (!sestina) throw new Error('Unable to generate a valid Bingo sestina');
  return sestina.cards.map((card, index) => ({ ...card, id: `${idPrefix}-${index + 1}`, index, markedIndices: [] }));
}

export function cardNumbers(card: Pick<ItalianBingoCard, 'cells'>): number[] {
  return card.cells.filter((value): value is number => value !== null);
}

export function findCinquinaNumbers(
  card: Pick<ItalianBingoCard, 'cells'>,
  drawn: ReadonlySet<number>,
): number[] | null {
  for (let row = 0; row < ITALIAN_CARD_ROWS; row += 1) {
    const values = card.cells
      .slice(row * ITALIAN_CARD_COLUMNS, (row + 1) * ITALIAN_CARD_COLUMNS)
      .filter((value): value is number => value !== null);
    if (values.length === 5 && values.every((value) => drawn.has(value))) return values;
  }
  return null;
}

export function findBingoNumbers(
  card: Pick<ItalianBingoCard, 'cells'>,
  drawn: ReadonlySet<number>,
): number[] | null {
  const values = cardNumbers(card);
  if (values.length !== ITALIAN_CARD_NUMBER_COUNT) return null;
  return values.every((value) => drawn.has(value)) ? values : null;
}

export function autoMarkCalledNumbers(
  card: ItalianBingoCard,
  drawn: ReadonlySet<number>,
): ItalianBingoCard {
  return {
    ...card,
    markedIndices: card.cells.flatMap((value, index) =>
      value !== null && drawn.has(value) ? [index] : [],
    ),
  };
}
