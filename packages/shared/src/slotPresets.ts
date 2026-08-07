/**
 * Starting machines.
 *
 * A player opening the editor needs something that already works, and the
 * arcade needs a machine to put in a cabinet before anyone has authored one.
 * Every preset here is checked by the test suite to sit inside the publishable
 * RTP window, so none of them can drift out of legal range unnoticed.
 */

import type { SlotConfig, SlotSymbol, SlotVolatility } from './slots';
import { themeSymbolId } from './slotSymbolLibrary';

/** The five-reel, three-row layout every preset uses. */
const REELS = 5;
const ROWS = 3;

/**
 * Ten fixed lines: three straight, then the usual V and zig-zag shapes.
 * Each entry is the row to read on each reel.
 */
export const CLASSIC_PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 2],
];

/**
 * Deep copy of a paytable, namespacing the keys as it goes.
 *
 * The tables below are written with short ids because `cherry: { 3: 2 }` is
 * what a paytable should look like when you read it. The symbols they pay for
 * carry the library's namespaced ids, and a paytable keyed by anything else
 * pays nothing at all — so the two are brought together here, once, rather
 * than by spelling `frutta:cherry` forty times.
 *
 * Written out rather than using `structuredClone`, which this package's ES2023
 * lib does not declare.
 */
function clonePaytable(
  paytable: Record<string, Record<number, number>>,
): Record<string, Record<number, number>> {
  const copy: Record<string, Record<number, number>> = {};
  for (const [symbolId, table] of Object.entries(paytable)) {
    copy[themeSymbolId('FRUTTA', symbolId)] = { ...table };
  }
  return copy;
}

function symbol(
  id: string,
  name: string,
  kind: SlotSymbol['kind'],
  weight: number | number[],
): SlotSymbol {
  return {
    id,
    name,
    kind,
    weights: Array.isArray(weight) ? weight : Array.from({ length: REELS }, () => weight),
  };
}

/**
 * Volatility is shaped with the reel strips and the paytable, never with the
 * RTP: a high volatility machine pays the same back over time, it just pays it
 * in fewer, larger pieces. That is the whole point of the setting, and it is
 * the thing a player is most likely to get wrong when authoring a machine.
 */
interface Shape {
  /** Weights for cherry, lemon, bell, seven, wild, scatter. */
  weights: [number, number, number, number, number, number];
  paytable: Record<string, Record<number, number>>;
  freeSpins: { triggerScatters: number; spins: number; multiplier: number };
}

const SHAPES: Record<SlotVolatility, Shape> = {
  // Frequent small wins: commons are plentiful and the top prizes are modest.
  low: {
    weights: [40, 30, 18, 8, 4, 3],
    paytable: {
      cherry: { 3: 2, 4: 7, 5: 18 },
      lemon: { 3: 2, 4: 9, 5: 28 },
      bell: { 3: 5, 4: 18, 5: 55 },
      seven: { 3: 11, 4: 40, 5: 135 },
      wild: { 3: 27, 4: 90, 5: 315 },
      scatter: { 3: 2, 4: 9, 5: 34 },
    },
    freeSpins: { triggerScatters: 3, spins: 6, multiplier: 2 },
  },
  medium: {
    weights: [34, 26, 16, 7, 3, 3],
    paytable: {
      cherry: { 3: 2, 4: 5, 5: 18 },
      lemon: { 3: 2, 4: 9, 5: 29 },
      bell: { 3: 5, 4: 18, 5: 63 },
      seven: { 3: 13, 4: 51, 5: 200 },
      wild: { 3: 36, 4: 127, 5: 470 },
      scatter: { 3: 2, 4: 9, 5: 40 },
    },
    freeSpins: { triggerScatters: 3, spins: 8, multiplier: 2 },
  },
  // Rare, heavy hits: the commons thin out and the top of the table climbs.
  high: {
    weights: [28, 22, 15, 6, 2, 3],
    paytable: {
      // No three-of-a-kind on the commonest symbol: that single omission is
      // what turns a steady trickle of small wins into a rarer, bigger one.
      cherry: { 4: 5, 5: 18 },
      lemon: { 3: 2, 4: 6, 5: 24 },
      bell: { 3: 3, 4: 15, 5: 63 },
      seven: { 3: 13, 4: 63, 5: 315 },
      wild: { 3: 47, 4: 218, 5: 1100 },
      scatter: { 3: 2, 4: 12, 5: 61 },
    },
    freeSpins: { triggerScatters: 3, spins: 10, multiplier: 3 },
  },
  extreme: {
    weights: [26, 20, 14, 5, 2, 2],
    paytable: {
      cherry: { 4: 5, 5: 17 },
      lemon: { 4: 8, 5: 30 },
      bell: { 3: 4, 4: 17, 5: 101 },
      seven: { 3: 17, 4: 111, 5: 713 },
      wild: { 3: 87, 4: 491, 5: 3095 },
      scatter: { 3: 4, 4: 26, 5: 195 },
    },
    freeSpins: { triggerScatters: 3, spins: 12, multiplier: 4 },
  },
};

/**
 * The preset symbol set, drawn from the fruit theme.
 *
 * The ids are the library's namespaced ones, so a preset machine renders with
 * real art instead of the grey placeholder the art lookup falls back to.
 */
const SYMBOL_META: ReadonlyArray<[id: string, name: string, kind: SlotSymbol['kind']]> = [
  [themeSymbolId('FRUTTA', 'cherry'), 'Ciliegia', 'normal'],
  [themeSymbolId('FRUTTA', 'lemon'), 'Limone', 'normal'],
  [themeSymbolId('FRUTTA', 'bell'), 'Campana', 'normal'],
  [themeSymbolId('FRUTTA', 'seven'), 'Sette', 'normal'],
  [themeSymbolId('FRUTTA', 'wild'), 'Jolly', 'wild'],
  [themeSymbolId('FRUTTA', 'scatter'), 'Stella', 'scatter'],
];

export function slotPreset(volatility: SlotVolatility): SlotConfig {
  const shape = SHAPES[volatility];
  return {
    reels: REELS,
    rows: ROWS,
    paylines: CLASSIC_PAYLINES.map((line) => [...line]),
    symbols: SYMBOL_META.map(([id, name, kind], index) =>
      symbol(id, name, kind, shape.weights[index] ?? 1),
    ),
    paytable: clonePaytable(shape.paytable),
    features: { freeSpins: { ...shape.freeSpins } },
    volatility,
  };
}

/** The machine the arcade puts in a cabinet before anyone authors their own. */
export function defaultSlotConfig(): SlotConfig {
  return slotPreset('medium');
}

/** Italian labels for the volatility setting, for the editor. */
export const SLOT_VOLATILITY_LABELS: Record<SlotVolatility, string> = {
  low: 'Bassa · vincite frequenti e piccole',
  medium: 'Media · equilibrata',
  high: 'Alta · vincite rare e grosse',
  extreme: 'Estrema · pochissime vincite, molto grosse',
};
