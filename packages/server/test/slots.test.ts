import { describe, expect, it } from 'vitest';
import {
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  SLOT_VOLATILITIES,
  analyticLineRtp,
  compareSlotRtp,
  defaultSlotConfig,
  emptySimulation,
  evaluatePayline,
  resolveGrid,
  simulateSlotBatch,
  slotConfigFingerprint,
  slotPreset,
  spinSlot,
  validateSlotConfig,
  type SlotConfig,
} from '@bingo/shared';

/**
 * The slot engine.
 *
 * This is the part of the project a commission can reasonably ask to see
 * justified, so the properties are pinned rather than the outputs: a spin is
 * reproducible from its seed and nonce, a win is only ever paid for symbols
 * actually on the reels, and volatility changes the *shape* of the returns
 * without moving the RTP.
 */

/** A deliberately small machine, so expectations can be reasoned about by hand. */
function tinyConfig(overrides: Partial<SlotConfig> = {}): SlotConfig {
  return {
    reels: 3,
    rows: 3,
    paylines: [[1, 1, 1]],
    symbols: [
      { id: 'a', name: 'A', kind: 'normal', weights: [1, 1, 1] },
      { id: 'b', name: 'B', kind: 'normal', weights: [1, 1, 1] },
      { id: 'w', name: 'W', kind: 'wild', weights: [1, 1, 1] },
      { id: 's', name: 'S', kind: 'scatter', weights: [1, 1, 1] },
    ],
    paytable: {
      a: { 3: 10 },
      b: { 3: 20 },
      w: { 3: 100 },
      s: { 3: 5 },
    },
    features: { freeSpins: { triggerScatters: 3, spins: 5, multiplier: 2 } },
    volatility: 'medium',
    ...overrides,
  };
}

/** Builds a 3x3 grid from rows written the way they appear on screen. */
function grid(rows: string[][]): string[][] {
  const columns: string[][] = [[], [], []];
  for (const row of rows) {
    for (let reel = 0; reel < 3; reel += 1) columns[reel]?.push(row[reel] ?? '');
  }
  return columns;
}

describe('determinism', () => {
  it('replays a spin exactly from its seed and nonce', () => {
    const config = defaultSlotConfig();
    const first = spinSlot(config, 'seed-abc', 41, 1);
    const second = spinSlot(config, 'seed-abc', 41, 1);
    expect(second).toEqual(first);
  });

  it('gives a different result at the next nonce', () => {
    const config = defaultSlotConfig();
    const first = spinSlot(config, 'seed-abc', 41, 1);
    const second = spinSlot(config, 'seed-abc', 42, 1);
    expect(second.grid).not.toEqual(first.grid);
  });

  it('gives a different result under a different seed', () => {
    const config = defaultSlotConfig();
    expect(spinSlot(config, 'seed-one', 1, 1).grid).not.toEqual(
      spinSlot(config, 'seed-two', 1, 1).grid,
    );
  });

  it('fills the whole grid with symbols the machine actually has', () => {
    const config = defaultSlotConfig();
    const known = new Set(config.symbols.map((symbol) => symbol.id));
    const result = spinSlot(config, 'grid-seed', 7, 1);
    expect(result.grid).toHaveLength(config.reels);
    for (const reel of result.grid) {
      expect(reel).toHaveLength(config.rows);
      for (const cell of reel) expect(known.has(cell)).toBe(true);
    }
  });
});

describe('payline evaluation', () => {
  const config = tinyConfig();

  it('pays three of a kind read left to right', () => {
    const result = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
    ]), 2);
    expect(result.lineWins).toHaveLength(1);
    expect(result.lineWins[0]?.symbolId).toBe('a');
    expect(result.lineWins[0]?.multiplier).toBe(10);
    expect(result.lineWins[0]?.credits).toBe(20);
  });

  it('pays nothing for a run that starts on the second reel', () => {
    const result = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['b', 'a', 'a'],
      ['b', 'b', 'b'],
    ]), 1);
    expect(result.lineWins).toHaveLength(0);
  });

  it('lets a wild stand in for a normal symbol', () => {
    const result = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['a', 'w', 'a'],
      ['b', 'b', 'b'],
    ]), 1);
    expect(result.lineWins[0]?.symbolId).toBe('a');
    expect(result.lineWins[0]?.multiplier).toBe(10);
  });

  it('pays a run of wilds at the better of the two readings', () => {
    // Three wilds could be read as three 'a', worth 10, or as wilds, worth 100.
    const result = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['w', 'w', 'w'],
      ['b', 'b', 'b'],
    ]), 1);
    expect(result.lineWins[0]?.multiplier).toBe(100);
  });

  it('does not let a scatter start a line win', () => {
    const result = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['s', 's', 's'],
      ['b', 'b', 'b'],
    ]), 1);
    expect(result.lineWins).toHaveLength(0);
  });

  it('scores every payline independently', () => {
    const wide = tinyConfig({ paylines: [[1, 1, 1], [0, 0, 0]] });
    const result = resolveGrid(wide, grid([
      ['b', 'b', 'b'],
      ['a', 'a', 'a'],
      ['a', 'b', 'a'],
    ]), 1);
    expect(result.lineWins).toHaveLength(2);
    expect(result.lineWins.map((win) => win.paylineIndex)).toEqual([0, 1]);
  });

  it('reports no win rather than a zero win', () => {
    expect(
      evaluatePayline(config, grid([
        ['a', 'a', 'a'],
        ['a', 'b', 'a'],
        ['a', 'a', 'a'],
      ]), [1, 1, 1], 1),
    ).toBeNull();
  });
});

describe('scatters and free spins', () => {
  const config = tinyConfig();

  it('pays scatters wherever they land, not along a line', () => {
    const result = resolveGrid(config, grid([
      ['s', 'b', 'b'],
      ['b', 's', 'b'],
      ['b', 'b', 's'],
    ]), 1);
    expect(result.scatterCount).toBe(3);
    // Scatters pay a multiple of the total bet: one line at 1 credit.
    expect(result.scatterCredits).toBe(5);
  });

  it('triggers free spins at the configured scatter count', () => {
    const two = resolveGrid(config, grid([
      ['s', 'b', 'b'],
      ['b', 's', 'b'],
      ['b', 'b', 'a'],
    ]), 1);
    expect(two.freeSpinsAwarded).toBe(0);

    const three = resolveGrid(config, grid([
      ['s', 'b', 'b'],
      ['b', 's', 'b'],
      ['b', 'b', 's'],
    ]), 1);
    expect(three.freeSpinsAwarded).toBe(5);
  });

  it('applies the multiplier to every win it is given', () => {
    const plain = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
    ]), 2, 1);
    const doubled = resolveGrid(config, grid([
      ['b', 'b', 'b'],
      ['a', 'a', 'a'],
      ['b', 'b', 'b'],
    ]), 2, 2);
    expect(doubled.totalWin).toBe(plain.totalWin * 2);
  });
});

describe('near miss', () => {
  const config = tinyConfig({ reels: 5, paylines: [[1, 1, 1, 1, 1]] });

  it('marks a result that fell one symbol short', () => {
    const columns = [['b', 'a', 'b'], ['b', 'a', 'b'], ['b', 'b', 'b'], ['b', 'b', 'b'], ['b', 'b', 'b']];
    // Two 'a' then a break: one short of the shortest paying run.
    expect(resolveGrid(config, columns, 1).nearMiss).toBe(true);
  });

  it('never marks a spin that actually won', () => {
    const columns = [['b', 'a', 'b'], ['b', 'a', 'b'], ['b', 'a', 'b'], ['b', 'b', 'b'], ['b', 'b', 'b']];
    const result = resolveGrid(config, columns, 1);
    expect(result.lineWins.length).toBeGreaterThan(0);
    expect(result.nearMiss).toBe(false);
  });

  it('is an observation, never an input: the grid is unchanged by it', () => {
    const spun = spinSlot(defaultSlotConfig(), 'near-miss-seed', 3, 1);
    const replayed = spinSlot(defaultSlotConfig(), 'near-miss-seed', 3, 1);
    expect(replayed.grid).toEqual(spun.grid);
  });
});

describe('configuration validation', () => {
  it('accepts every preset', () => {
    for (const volatility of SLOT_VOLATILITIES) {
      expect(validateSlotConfig(slotPreset(volatility))).toEqual([]);
    }
  });

  it('rejects a payline that does not cover every reel', () => {
    expect(validateSlotConfig(tinyConfig({ paylines: [[1, 1]] }))).toContain('payline_length');
  });

  it('rejects a payline pointing at a row that does not exist', () => {
    expect(validateSlotConfig(tinyConfig({ paylines: [[0, 9, 0]] }))).toContain(
      'payline_row_range',
    );
  });

  it('rejects a reel no symbol can land on', () => {
    const broken = tinyConfig();
    broken.symbols = broken.symbols.map((symbol) => ({ ...symbol, weights: [1, 0, 1] }));
    expect(validateSlotConfig(broken)).toContain('empty_reel');
  });

  it('rejects a paytable entry for a symbol the machine does not have', () => {
    expect(
      validateSlotConfig(tinyConfig({ paytable: { ghost: { 3: 5 } } })),
    ).toContain('paytable_unknown_symbol');
  });

  it('rejects more than one wild or scatter', () => {
    const twoWilds = tinyConfig();
    twoWilds.symbols = [...twoWilds.symbols, { id: 'w2', name: 'W2', kind: 'wild', weights: [1, 1, 1] }];
    expect(validateSlotConfig(twoWilds)).toContain('multiple_wilds');
  });
});

describe('return to player', () => {
  it('keeps every preset inside the publishable window', () => {
    for (const volatility of SLOT_VOLATILITIES) {
      const config = slotPreset(volatility);
      const simulation = simulateSlotBatch(config, `rtp-${volatility}`, 1, 120_000);
      expect(simulation.rtp).toBeGreaterThanOrEqual(SLOT_RTP_MIN);
      expect(simulation.rtp).toBeLessThanOrEqual(SLOT_RTP_MAX);
    }
  });

  it('agrees with the analytic line calculation on a line-only machine', () => {
    // No scatter and no feature, so the computed figure covers the whole game
    // and the simulation has nothing left to add.
    const config = tinyConfig({
      symbols: [
        { id: 'a', name: 'A', kind: 'normal', weights: [1, 1, 1] },
        { id: 'b', name: 'B', kind: 'normal', weights: [1, 1, 1] },
      ],
      paytable: { a: { 3: 4 }, b: { 3: 4 } },
      features: {},
    });
    const analytic = analyticLineRtp(config);
    // Each reel is an even coin flip, so a line is three of a kind one time in
    // four, paying four times the line bet: an RTP of exactly 1.
    expect(analytic).toBeCloseTo(1, 6);

    const simulation = simulateSlotBatch(config, 'analytic-check', 1, 200_000);
    expect(simulation.rtp).toBeCloseTo(analytic, 1);
  });

  it('reports the simulated figure above the analytic one when a feature pays', () => {
    const config = defaultSlotConfig();
    const simulation = simulateSlotBatch(config, 'compare', 1, 60_000);
    const comparison = compareSlotRtp(config, simulation);
    // Scatters and free spins are outside the analytic line model, so they can
    // only add. A negative drift would mean the line maths is overcounting.
    expect(comparison.drift).toBeGreaterThan(0);
    expect(comparison.withinPublishWindow).toBe(true);
  });

  it('accumulates across batches exactly as one long run', () => {
    const config = defaultSlotConfig();
    const single = simulateSlotBatch(config, 'batched', 1, 4_000);
    const split = emptySimulation();
    simulateSlotBatch(config, 'batched', 1, 1_500, split);
    simulateSlotBatch(config, 'batched', 1_501, 2_500, split);
    expect(split.spins).toBe(single.spins);
    expect(split.won).toBe(single.won);
    expect(split.rtp).toBeCloseTo(single.rtp, 10);
  });
});

describe('volatility', () => {
  it('changes the shape of the returns without moving the return', () => {
    const measured = SLOT_VOLATILITIES.map((volatility) => ({
      volatility,
      ...simulateSlotBatch(slotPreset(volatility), `shape-${volatility}`, 1, 120_000),
    }));

    for (const entry of measured) {
      expect(entry.rtp).toBeGreaterThanOrEqual(SLOT_RTP_MIN);
      expect(entry.rtp).toBeLessThanOrEqual(SLOT_RTP_MAX);
    }

    const low = measured[0];
    const extreme = measured[3];
    expect(low).toBeDefined();
    expect(extreme).toBeDefined();
    if (!low || !extreme) return;

    // Same money back, delivered very differently: the extreme machine pays out
    // far less often and, when it does, far bigger.
    expect(low.hitFrequency / low.spins).toBeGreaterThan(extreme.hitFrequency / extreme.spins);
    expect(extreme.maxWinMultiplier).toBeGreaterThan(low.maxWinMultiplier * 5);
  });
});

describe('configuration fingerprint', () => {
  it('is stable for an unchanged machine', () => {
    expect(slotConfigFingerprint(defaultSlotConfig())).toBe(
      slotConfigFingerprint(defaultSlotConfig()),
    );
  });

  it('changes when a weight is edited', () => {
    const edited = defaultSlotConfig();
    const first = edited.symbols[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.weights = [...first.weights.slice(0, 4), 99];
    expect(slotConfigFingerprint(edited)).not.toBe(slotConfigFingerprint(defaultSlotConfig()));
  });

  it('changes when the paytable is edited', () => {
    const edited = defaultSlotConfig();
    edited.paytable.seven = { 3: 999, 4: 999, 5: 999 };
    expect(slotConfigFingerprint(edited)).not.toBe(slotConfigFingerprint(defaultSlotConfig()));
  });
});
