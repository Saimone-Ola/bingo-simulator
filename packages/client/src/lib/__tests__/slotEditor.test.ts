import { describe, expect, it } from 'vitest';
import { SLOT_RTP_MAX, SLOT_RTP_MIN, defaultSlotConfig, slotPreset } from '@bingo/shared';
import {
  driftNote,
  editorSummary,
  emptyReels,
  hasPayline,
  payoutLengths,
  problemLabel,
  setFreeSpins,
  setPayout,
  setSymbolWeight,
  setSymbolWeightAllReels,
  symbolStats,
  togglePayline,
} from '../slotEditor';

describe('slot editor derived numbers', () => {
  it('reports a clean preset as publishable and structurally sound', () => {
    const summary = editorSummary(defaultSlotConfig());
    expect(summary.problems).toEqual([]);
    expect(summary.hasWild).toBe(true);
    expect(summary.hasScatter).toBe(true);
    expect(summary.freeSpins).toBe(true);
    expect(summary.analyticRtp).toBeGreaterThan(0);
  });

  it('keeps every preset under the ceiling on its base game alone', () => {
    // The closed form figure counts base line wins only, so it is a strict
    // lower bound on what the machine pays. A preset already over the ceiling
    // here could never be published, whatever the simulation said.
    for (const volatility of ['low', 'medium', 'high', 'extreme'] as const) {
      const summary = editorSummary(slotPreset(volatility));
      expect(summary.analyticRtp).toBeGreaterThan(0.5);
      expect(summary.analyticRtp).toBeLessThanOrEqual(SLOT_RTP_MAX);
      expect(summary.overCeiling).toBe(false);
    }
  });

  it('flags a machine whose base game alone already pays over the ceiling', () => {
    const config = defaultSlotConfig();
    const generous = {
      ...config,
      paytable: Object.fromEntries(
        Object.entries(config.paytable).map(([id, table]) => [
          id,
          Object.fromEntries(Object.entries(table).map(([length, pay]) => [length, pay * 50])),
        ]),
      ),
    };
    const summary = editorSummary(generous);
    expect(summary.problems).toEqual([]);
    expect(summary.overCeiling).toBe(true);
  });

  it('refuses to compute an RTP for a broken configuration', () => {
    const config = defaultSlotConfig();
    const broken = { ...config, symbols: config.symbols.map((s) => ({ ...s, weights: [0, 0, 0, 0, 0] })) };
    const summary = editorSummary(broken);
    expect(summary.problems).toContain('empty_reel');
    expect(summary.analyticRtp).toBe(0);
    expect(summary.overCeiling).toBe(false);
    expect(emptyReels(broken)).toEqual([0, 1, 2, 3, 4]);
  });

  it('lists a run length for every payable length', () => {
    expect(payoutLengths(defaultSlotConfig())).toEqual([3, 4, 5]);
  });

  it('gives per-reel probabilities that sum to one across the symbols', () => {
    const config = defaultSlotConfig();
    const stats = symbolStats(config);
    for (let reel = 0; reel < config.reels; reel += 1) {
      const total = stats.reduce((sum, stat) => sum + (stat.perReel[reel] ?? 0), 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });
});

describe('slot editor edits', () => {
  it('changes one reel without touching the others', () => {
    const config = defaultSlotConfig();
    const first = config.symbols[0]!;
    const next = setSymbolWeight(config, first.id, 2, 7);
    expect(next.symbols[0]!.weights[2]).toBe(7);
    expect(next.symbols[0]!.weights[0]).toBe(first.weights[0]);
    expect(config.symbols[0]!.weights[2]).toBe(first.weights[2]);
  });

  it('rounds and floors a weight rather than storing a fraction', () => {
    const config = defaultSlotConfig();
    const id = config.symbols[0]!.id;
    expect(setSymbolWeight(config, id, 0, -4).symbols[0]!.weights[0]).toBe(0);
    expect(setSymbolWeight(config, id, 0, 3.6).symbols[0]!.weights[0]).toBe(4);
    expect(setSymbolWeightAllReels(config, id, 5).symbols[0]!.weights).toEqual([5, 5, 5, 5, 5]);
  });

  it('drops a payout when it is set to zero instead of paying nothing for a hit', () => {
    const config = defaultSlotConfig();
    const id = config.symbols[0]!.id;
    expect(setPayout(config, id, 3, 12).paytable[id]?.[3]).toBe(12);
    expect(setPayout(config, id, 3, 0).paytable[id]?.[3]).toBeUndefined();
  });

  it('adds and removes paylines but never removes the last one', () => {
    const config = defaultSlotConfig();
    const line = config.paylines[0]!;
    expect(hasPayline(config, line)).toBe(true);

    const removed = togglePayline(config, line);
    expect(hasPayline(removed, line)).toBe(false);
    expect(removed.paylines.length).toBe(config.paylines.length - 1);

    const restored = togglePayline(removed, line);
    expect(restored.paylines.length).toBe(config.paylines.length);

    const single = { ...config, paylines: [line] };
    expect(togglePayline(single, line)).toBe(single);
  });

  it('clamps free spin settings into the range the server will accept', () => {
    const config = defaultSlotConfig();
    const wild = setFreeSpins(config, { spins: 900, multiplier: 0, triggerScatters: 9 });
    expect(wild.features.freeSpins).toEqual({ triggerScatters: 5, spins: 50, multiplier: 1 });
    expect(setFreeSpins(config, null).features.freeSpins).toBeUndefined();
  });
});

describe('wording', () => {
  it('has an Italian sentence for every structural problem', () => {
    const problems = editorSummary({
      ...defaultSlotConfig(),
      paylines: [],
      symbols: [],
    }).problems;
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problemLabel(problem)).toMatch(/[a-zà-ù]/i);
    }
  });

  it('keeps the publish window the same on both ends', () => {
    expect(SLOT_RTP_MIN).toBeLessThan(SLOT_RTP_MAX);
  });

  it('reads a positive drift as the feature share and a negative one as a short sample', () => {
    expect(driftNote(0.213, 200_000)).toContain('21.3%');
    expect(driftNote(0.213, 200_000)).toContain('giri gratuiti');
    expect(driftNote(0.213, 10_000)).toMatch(/oscilla/);
    expect(driftNote(-0.02, 10_000)).toMatch(/campione/);
  });
});
