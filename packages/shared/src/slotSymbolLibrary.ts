/**
 * The symbol library an author picks from.
 *
 * The editor offered six symbols — cherry, lemon, bell, seven, wild, scatter —
 * drawn as emoji. That is not a library, it is a single machine's worth of
 * furniture, and emoji rendering is out of our control: the same symbol looks
 * different on every platform and cannot be recoloured to match a cabinet.
 *
 * Symbols are now themed sets of *drawing instructions*: a primitive shape and
 * a palette. The client renders them as inline SVG, so they are sharp at any
 * size, tintable per machine, weigh nothing, and add no dependency.
 *
 * On third-party art: game-icons.net publishes ~4 200 SVG game icons under
 * CC BY 3.0, which is the natural next step if this catalogue is outgrown. It
 * requires visible attribution to each icon's author, so it is a deliberate
 * decision rather than a drop-in, and it is not taken here.
 */

import type { SlotSymbolKind } from './slots';

/** Primitive the renderer knows how to draw. */
export const SYMBOL_SHAPES = [
  'circle',
  'cherry',
  'wedge',
  'bell',
  'diamond',
  'star',
  'seven',
  'crown',
  'skull',
  'rocket',
  'planet',
  'anchor',
  'shell',
  'leaf',
  'flame',
  'eye',
  'scarab',
  'coin',
  'clover',
  'bar',
  'joker',
  'burst',
] as const;
export type SymbolShape = (typeof SYMBOL_SHAPES)[number];

export const SLOT_THEMES = [
  'FRUTTA',
  'GEMME',
  'ANIMALI',
  'SPAZIO',
  'MITOLOGIA',
  'CIBO',
  'RETRO',
  'EGIZIO',
  'MARINO',
  'NATALIZIO',
] as const;
export type SlotTheme = (typeof SLOT_THEMES)[number];

export const SLOT_THEME_LABELS: Record<SlotTheme, string> = {
  FRUTTA: 'Frutta',
  GEMME: 'Gemme',
  ANIMALI: 'Animali',
  SPAZIO: 'Spazio',
  MITOLOGIA: 'Mitologia',
  CIBO: 'Cibo',
  RETRO: 'Retrò',
  EGIZIO: 'Egizio',
  MARINO: 'Marino',
  NATALIZIO: 'Natalizio',
};

export interface LibrarySymbol {
  id: string;
  name: string;
  kind: SlotSymbolKind;
  shape: SymbolShape;
  /** Fill, and the accent used for the detail stroke. */
  color: string;
  accent: string;
  /**
   * Suggested rank within its theme, 0 being the commonest.
   *
   * Only a hint for the editor's starting weights: the author decides the reel
   * strips, and nothing here affects an outcome.
   */
  rank: number;
}

function symbol(
  id: string,
  name: string,
  shape: SymbolShape,
  color: string,
  accent: string,
  rank: number,
  kind: SlotSymbolKind = 'normal',
): LibrarySymbol {
  return { id, name, kind, shape, color, accent, rank };
}

/**
 * Six symbols per theme, ranked commonest to rarest, plus a wild and a scatter.
 *
 * Six is not arbitrary: it is enough for a paytable with a real spread between
 * the low and high pays, and few enough that a player can learn the set within
 * a couple of spins.
 */
const THEME_SYMBOLS: Record<SlotTheme, LibrarySymbol[]> = {
  FRUTTA: [
    symbol('cherry', 'Ciliegia', 'cherry', '#e2434f', '#3ba55d', 0),
    symbol('lemon', 'Limone', 'circle', '#f6c453', '#c99a26', 1),
    symbol('plum', 'Prugna', 'circle', '#8b5cf6', '#5b3bb0', 2),
    symbol('melon', 'Melone', 'circle', '#3ba55d', '#e2434f', 3),
    symbol('bell', 'Campana', 'bell', '#f6c453', '#8a6512', 4),
    symbol('seven', 'Sette', 'seven', '#e2434f', '#ffd166', 5),
    symbol('wild', 'Jolly', 'joker', '#a78bfa', '#f6c453', 6, 'wild'),
    symbol('scatter', 'Stella', 'star', '#ffd166', '#e08a4a', 7, 'scatter'),
  ],
  GEMME: [
    symbol('quartz', 'Quarzo', 'diamond', '#cbd5e1', '#94a3b8', 0),
    symbol('topaz', 'Topazio', 'diamond', '#f6c453', '#b98a1e', 1),
    symbol('emerald', 'Smeraldo', 'diamond', '#3ba55d', '#1c6b39', 2),
    symbol('sapphire', 'Zaffiro', 'diamond', '#4f7cf7', '#2848a8', 3),
    symbol('ruby', 'Rubino', 'diamond', '#e2434f', '#8f1f2a', 4),
    symbol('crown', 'Corona', 'crown', '#ffd166', '#a9781a', 5),
    symbol('wild', 'Prisma', 'burst', '#a78bfa', '#ffffff', 6, 'wild'),
    symbol('scatter', 'Stella', 'star', '#8ee8de', '#2f8f86', 7, 'scatter'),
  ],
  ANIMALI: [
    symbol('clover', 'Trifoglio', 'clover', '#3ba55d', '#1c6b39', 0),
    symbol('leaf', 'Foglia', 'leaf', '#7cc36a', '#3f7a33', 1),
    symbol('shell', 'Conchiglia', 'shell', '#f0b7a4', '#b5715c', 2),
    symbol('eye', 'Occhio', 'eye', '#f6c453', '#3a2a12', 3),
    symbol('skull', 'Teschio', 'skull', '#e8e2f0', '#5b5470', 4),
    symbol('crown', 'Re', 'crown', '#ffd166', '#a9781a', 5),
    symbol('wild', 'Impronta', 'burst', '#a78bfa', '#3a2a55', 6, 'wild'),
    symbol('scatter', 'Luna', 'circle', '#e8e2f0', '#8a80a8', 7, 'scatter'),
  ],
  SPAZIO: [
    symbol('bolt', 'Scintilla', 'burst', '#8ee8de', '#2f8f86', 0),
    symbol('coin', 'Modulo', 'coin', '#94a3b8', '#4b5563', 1),
    symbol('planet', 'Pianeta', 'planet', '#4f7cf7', '#8ee8de', 2),
    symbol('rocket', 'Razzo', 'rocket', '#e8e2f0', '#e2434f', 3),
    symbol('flame', 'Nova', 'flame', '#e08a4a', '#ffd166', 4),
    symbol('star', 'Quasar', 'star', '#ffd166', '#a78bfa', 5),
    // Not the black hole it was: a near-black symbol on a dark reel is an
    // empty cell, and the wild is the one symbol that must always be seen.
    symbol('wild', 'Singolarità', 'burst', '#c4b5fd', '#1b1430', 6, 'wild'),
    symbol('scatter', 'Cometa', 'burst', '#8ee8de', '#ffffff', 7, 'scatter'),
  ],
  MITOLOGIA: [
    symbol('coin', 'Obolo', 'coin', '#c8a94a', '#7a6320', 0),
    symbol('leaf', 'Alloro', 'leaf', '#7cc36a', '#3f7a33', 1),
    symbol('shell', 'Lira', 'shell', '#f0d9a4', '#a9781a', 2),
    symbol('flame', 'Fuoco', 'flame', '#e2434f', '#ffd166', 3),
    symbol('skull', 'Ade', 'skull', '#e8e2f0', '#4a4266', 4),
    symbol('crown', 'Zeus', 'crown', '#ffd166', '#a9781a', 5),
    symbol('wild', 'Fulmine', 'burst', '#ffd166', '#ffffff', 6, 'wild'),
    symbol('scatter', 'Oracolo', 'eye', '#a78bfa', '#ffd166', 7, 'scatter'),
  ],
  CIBO: [
    symbol('cherry', 'Ciliegia', 'cherry', '#e2434f', '#3ba55d', 0),
    symbol('wedge', 'Formaggio', 'wedge', '#f6c453', '#c99a26', 1),
    symbol('circle', 'Polpetta', 'circle', '#a9691e', '#6b3f10', 2),
    symbol('leaf', 'Basilico', 'leaf', '#3ba55d', '#1c6b39', 3),
    symbol('flame', 'Peperoncino', 'flame', '#e2434f', '#8f1f2a', 4),
    symbol('crown', 'Chef', 'bell', '#ffffff', '#c9c2d8', 5),
    symbol('wild', 'Jolly', 'joker', '#a78bfa', '#f6c453', 6, 'wild'),
    symbol('scatter', 'Stella', 'star', '#ffd166', '#e08a4a', 7, 'scatter'),
  ],
  RETRO: [
    symbol('bar', 'Bar', 'bar', '#e8e2f0', '#2b2148', 0),
    symbol('cherry', 'Ciliegia', 'cherry', '#e2434f', '#3ba55d', 1),
    symbol('bell', 'Campana', 'bell', '#f6c453', '#8a6512', 2),
    symbol('coin', 'Gettone', 'coin', '#c8a94a', '#7a6320', 3),
    symbol('diamond', 'Rombo', 'diamond', '#4f7cf7', '#2848a8', 4),
    symbol('seven', 'Sette', 'seven', '#e2434f', '#ffd166', 5),
    symbol('wild', 'Jolly', 'joker', '#a78bfa', '#f6c453', 6, 'wild'),
    symbol('scatter', 'Stella', 'star', '#ffd166', '#e08a4a', 7, 'scatter'),
  ],
  EGIZIO: [
    symbol('coin', 'Disco', 'coin', '#c8a94a', '#7a6320', 0),
    symbol('leaf', 'Papiro', 'leaf', '#9fbf6a', '#5c7a2f', 1),
    symbol('scarab', 'Scarabeo', 'scarab', '#2f8f86', '#8ee8de', 2),
    symbol('eye', 'Occhio', 'eye', '#ffd166', '#1b1430', 3),
    symbol('anchor', 'Ankh', 'anchor', '#c8a94a', '#7a6320', 4),
    symbol('crown', 'Faraone', 'crown', '#ffd166', '#2f8f86', 5),
    symbol('wild', 'Sfinge', 'burst', '#c8a94a', '#1b1430', 6, 'wild'),
    symbol('scatter', 'Piramide', 'wedge', '#e0b96a', '#7a6320', 7, 'scatter'),
  ],
  MARINO: [
    symbol('shell', 'Conchiglia', 'shell', '#f0b7a4', '#b5715c', 0),
    symbol('circle', 'Bolla', 'circle', '#8ee8de', '#2f8f86', 1),
    symbol('leaf', 'Alga', 'leaf', '#3ba55d', '#1c6b39', 2),
    symbol('anchor', 'Ancora', 'anchor', '#cbd5e1', '#64748b', 3),
    symbol('star', 'Stella marina', 'star', '#e08a4a', '#a9541e', 4),
    symbol('crown', 'Tridente', 'crown', '#8ee8de', '#2f8f86', 5),
    symbol('wild', 'Perla', 'circle', '#ffffff', '#8ee8de', 6, 'wild'),
    symbol('scatter', 'Onda', 'burst', '#4f7cf7', '#8ee8de', 7, 'scatter'),
  ],
  NATALIZIO: [
    symbol('circle', 'Pallina', 'circle', '#e2434f', '#ffd166', 0),
    symbol('leaf', 'Agrifoglio', 'leaf', '#1c6b39', '#e2434f', 1),
    symbol('bell', 'Campanella', 'bell', '#f6c453', '#8a6512', 2),
    symbol('coin', 'Biscotto', 'coin', '#c98f4a', '#7a5320', 3),
    symbol('flame', 'Candela', 'flame', '#ffd166', '#e2434f', 4),
    symbol('crown', 'Puntale', 'crown', '#ffd166', '#e2434f', 5),
    symbol('wild', 'Fiocco', 'burst', '#e8f4ff', '#8ee8de', 6, 'wild'),
    symbol('scatter', 'Stella', 'star', '#ffd166', '#e2434f', 7, 'scatter'),
  ],
};

/**
 * The library, with every id namespaced by its theme.
 *
 * Ten themes each defined a `wild`, a `scatter` and often a `crown` or a
 * `bell`. Anything keyed by symbol id across the whole library — the art lookup
 * in the editor and in the reel panel, both of which build a Map — therefore
 * had one entry per *name* rather than per symbol, and the last theme loaded
 * won: every machine drew the Christmas bow as its wild.
 *
 * The engine never looks at an id, only at `kind`, so namespacing them costs
 * nothing mechanically and makes a symbol's identity actually identify it.
 */
export const SLOT_SYMBOL_LIBRARY: Record<SlotTheme, LibrarySymbol[]> = Object.fromEntries(
  SLOT_THEMES.map((theme) => [
    theme,
    THEME_SYMBOLS[theme].map((entry) => ({ ...entry, id: themeSymbolId(theme, entry.id) })),
  ]),
) as Record<SlotTheme, LibrarySymbol[]>;

/** `frutta:cherry`. Stable, and readable in a stored configuration. */
export function themeSymbolId(theme: SlotTheme, localId: string): string {
  return `${theme.toLowerCase()}:${localId}`;
}

/** Every symbol in the library, for search and for counting. */
export function allLibrarySymbols(): LibrarySymbol[] {
  return SLOT_THEMES.flatMap((theme) => SLOT_SYMBOL_LIBRARY[theme]);
}

export function themeSymbols(theme: SlotTheme): LibrarySymbol[] {
  return SLOT_SYMBOL_LIBRARY[theme];
}

/**
 * Starting reel weights for a theme, derived from rank.
 *
 * A geometric fall-off, so a first pass at a machine already has the shape a
 * slot needs — commons frequent, top symbol rare — instead of a flat set the
 * author has to fix before anything reads like a slot at all.
 */
export function suggestedWeights(theme: SlotTheme): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const entry of SLOT_SYMBOL_LIBRARY[theme]) {
    if (entry.kind === 'wild') weights[entry.id] = 4;
    else if (entry.kind === 'scatter') weights[entry.id] = 3;
    else weights[entry.id] = Math.max(4, Math.round(40 * 0.62 ** entry.rank));
  }
  return weights;
}
