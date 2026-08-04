/**
 * Derived numbers the slot editor shows while a machine is being authored.
 *
 * Everything here is a pure function of the configuration, which is what makes
 * the editor honest: the figures on screen come from the same
 * `@bingo/shared` engine the server runs, not from a second implementation
 * written for the UI. The only number the editor cannot compute locally is the
 * measured RTP, because that is a Monte Carlo run and belongs on the server.
 */

import {
  SLOT_MIN_MATCH,
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  analyticLineRtp,
  reelWeight,
  symbolProbability,
  validateSlotConfig,
  type SlotConfig,
  type SlotConfigProblem,
  type SlotSymbol,
} from '@bingo/shared';

/** Run lengths a five reel machine can pay. */
export function payoutLengths(config: SlotConfig): number[] {
  const lengths: number[] = [];
  for (let length = SLOT_MIN_MATCH; length <= config.reels; length += 1) lengths.push(length);
  return lengths;
}

export interface SymbolStat {
  symbol: SlotSymbol;
  /** Chance of this symbol landing in a given cell, averaged over the reels. */
  averageProbability: number;
  /** Per reel, so a designer can see a strip that is heavier on the left. */
  perReel: number[];
  /** Chance of it filling a whole payline, ignoring wilds. */
  fullLineProbability: number;
}

export function symbolStats(config: SlotConfig): SymbolStat[] {
  return config.symbols.map((symbol) => {
    const perReel = Array.from({ length: config.reels }, (_value, reel) =>
      symbolProbability(config, symbol.id, reel),
    );
    const sum = perReel.reduce((total, value) => total + value, 0);
    return {
      symbol,
      perReel,
      averageProbability: config.reels > 0 ? sum / config.reels : 0,
      fullLineProbability: perReel.reduce((total, value) => total * value, 1),
    };
  });
}

/** Reels with no weight at all: the configuration cannot be spun. */
export function emptyReels(config: SlotConfig): number[] {
  const empty: number[] = [];
  for (let reel = 0; reel < config.reels; reel += 1) {
    if (reelWeight(config, reel) <= 0) empty.push(reel);
  }
  return empty;
}

export interface EditorSummary {
  /**
   * Closed form RTP of the base line game: instant, exact, and a strict lower
   * bound on what the machine pays, because it ignores scatters and free spins.
   */
  analyticRtp: number;
  /**
   * The base game alone already pays more than the window allows.
   *
   * This is the one verdict the editor can reach without simulating: features
   * only ever add return, so a machine over the ceiling before them can never
   * come back under it.
   */
  overCeiling: boolean;
  problems: SlotConfigProblem[];
  paylineCount: number;
  symbolCount: number;
  hasWild: boolean;
  hasScatter: boolean;
  freeSpins: boolean;
}

export function editorSummary(config: SlotConfig): EditorSummary {
  const problems = validateSlotConfig(config);
  // A structurally broken configuration has no meaningful RTP, and asking the
  // engine for one on an empty reel would divide by zero.
  const analyticRtp = problems.length === 0 ? analyticLineRtp(config) : 0;
  return {
    analyticRtp,
    overCeiling: analyticRtp > SLOT_RTP_MAX,
    problems,
    paylineCount: config.paylines.length,
    symbolCount: config.symbols.length,
    hasWild: config.symbols.some((symbol) => symbol.kind === 'wild'),
    hasScatter: config.symbols.some((symbol) => symbol.kind === 'scatter'),
    freeSpins: config.features.freeSpins !== undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Immutable edits
 *
 * The editor keeps the configuration in React state, so every change has to
 * return a new object rather than mutate one. Doing it here, once, keeps the
 * component from growing a dozen spread expressions.
 * ------------------------------------------------------------------ */

export function setSymbolWeight(
  config: SlotConfig,
  symbolId: string,
  reel: number,
  weight: number,
): SlotConfig {
  const safe = Number.isFinite(weight) ? Math.max(0, Math.round(weight)) : 0;
  return {
    ...config,
    symbols: config.symbols.map((symbol) =>
      symbol.id === symbolId
        ? {
            ...symbol,
            weights: symbol.weights.map((value, index) => (index === reel ? safe : value)),
          }
        : symbol,
    ),
  };
}

/** Same weight on every reel — the quick way to make a symbol rarer overall. */
export function setSymbolWeightAllReels(
  config: SlotConfig,
  symbolId: string,
  weight: number,
): SlotConfig {
  const safe = Number.isFinite(weight) ? Math.max(0, Math.round(weight)) : 0;
  return {
    ...config,
    symbols: config.symbols.map((symbol) =>
      symbol.id === symbolId ? { ...symbol, weights: symbol.weights.map(() => safe) } : symbol,
    ),
  };
}

export function setPayout(
  config: SlotConfig,
  symbolId: string,
  length: number,
  multiplier: number,
): SlotConfig {
  const safe = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 0;
  const table = { ...(config.paytable[symbolId] ?? {}) };
  if (safe === 0) delete table[length];
  else table[length] = safe;
  return { ...config, paytable: { ...config.paytable, [symbolId]: table } };
}

/**
 * Adds or removes a payline.
 *
 * Removing the last one is refused rather than allowed and then flagged: a
 * machine with no lines cannot be spun, and losing the row you were looking at
 * is a worse way to learn that than the button simply not doing anything.
 */
export function togglePayline(config: SlotConfig, payline: readonly number[]): SlotConfig {
  const key = payline.join(',');
  const index = config.paylines.findIndex((line) => line.join(',') === key);
  if (index >= 0) {
    if (config.paylines.length === 1) return config;
    return { ...config, paylines: config.paylines.filter((_line, at) => at !== index) };
  }
  return { ...config, paylines: [...config.paylines, [...payline]] };
}

export function hasPayline(config: SlotConfig, payline: readonly number[]): boolean {
  const key = payline.join(',');
  return config.paylines.some((line) => line.join(',') === key);
}

export function setFreeSpins(
  config: SlotConfig,
  patch: Partial<{ triggerScatters: number; spins: number; multiplier: number }> | null,
): SlotConfig {
  if (patch === null) {
    return { ...config, features: {} };
  }
  const current = config.features.freeSpins ?? { triggerScatters: 3, spins: 8, multiplier: 2 };
  return {
    ...config,
    features: {
      freeSpins: {
        triggerScatters: clampInt(patch.triggerScatters ?? current.triggerScatters, 2, 5),
        spins: clampInt(patch.spins ?? current.spins, 1, 50),
        multiplier: clampInt(patch.multiplier ?? current.multiplier, 1, 10),
      },
    },
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

const PROBLEM_LABELS: Record<SlotConfigProblem, string> = {
  no_symbols: 'Nessun simbolo definito.',
  no_paylines: 'Nessuna linea di pagamento attiva.',
  bad_reel_count: 'I rulli devono essere 3 o 5.',
  bad_row_count: 'Le righe devono essere fra 1 e 5.',
  payline_length: 'Una linea non copre tutti i rulli.',
  payline_row_range: 'Una linea punta a una riga che non esiste.',
  symbol_weights: 'Un simbolo non ha un peso valido per ogni rullo.',
  empty_reel: 'Un rullo ha peso totale zero: non può essere estratto.',
  multiple_wilds: 'È ammesso un solo simbolo wild.',
  multiple_scatters: 'È ammesso un solo simbolo scatter.',
  paytable_unknown_symbol: 'La tabella paga cita un simbolo che non esiste.',
  paytable_bad_length: `La tabella paga usa una lunghezza fuori da ${SLOT_MIN_MATCH}–5.`,
};

export function problemLabel(problem: SlotConfigProblem): string {
  return PROBLEM_LABELS[problem];
}

/**
 * How to read the gap between the closed form figure and the measured one.
 *
 * `drift` is the share of the measured return that the closed form does not
 * account for: (misurato − analitico) / misurato. It is normally a large
 * positive number, because the analytic figure covers the base line game only
 * while the measurement also contains the scatters and the free spins. On the
 * calibrated presets the feature share runs from about a fifth of the return to
 * well over a third.
 *
 * A *negative* drift is the interesting case: the measurement came out below a
 * figure that is a strict lower bound, which means the sample has not converged.
 */
export function driftNote(drift: number, spins: number): string {
  const share = (Math.abs(drift) * 100).toFixed(1);
  if (drift < -0.005) {
    return `Il misurato è sotto il calcolato di ${share}%: impossibile a regime, il campione di ${spins.toLocaleString('it-IT')} giri è ancora corto.`;
  }
  const confidence =
    spins < 50_000
      ? ` Su ${spins.toLocaleString('it-IT')} giri la cifra oscilla ancora: alza i giri prima di fidarti dei decimali.`
      : '';
  return `Il ${share}% del ritorno arriva da scatter e giri gratuiti, che la formula chiusa non conta.${confidence}`;
}

export { SLOT_RTP_MAX, SLOT_RTP_MIN };
