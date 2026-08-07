import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_CLUSTER,
  HOLD_AND_SPIN_RESPINS,
  JACKPOT_LEVELS,
  MEGAWAYS_MAX_ROWS,
  MEGAWAYS_MIN_ROWS,
  SLOT_MECHANICS,
  SlotRandom,
  applyHoldAndSpin,
  cascadeMultiplier,
  collapseGrid,
  evaluateCluster,
  evaluateWays,
  holdAndSpinTotal,
  jackpotContribution,
  rollReelHeights,
  slotPreset,
  totalJackpotContribution,
  waysCount,
  type SlotConfig,
} from '@bingo/shared';

/**
 * The mechanics that are not paylines.
 *
 * Each of these changes what a win *is*, so they are tested on hand-built grids
 * rather than on spins: a assertion about a random grid tells you almost
 * nothing, while "this exact arrangement pays exactly this" pins the rule.
 */

const base = slotPreset('medium');

/**
 * Symbol ids come from the configuration, not from literals.
 *
 * The library namespaces ids by theme, so a preset's cherry is
 * `frutta:cherry`. A test that spells the bare name is asserting against a
 * symbol the machine does not have, and every win silently becomes zero.
 */
const symbolId = (index: number): string => base.symbols[index]!.id;
const CHERRY = symbolId(0);
const LEMON = symbolId(1);
const BELL = symbolId(2);
const WILD = symbolId(4);
const SCATTER = symbolId(5);

/** Builds a grid from columns given top to bottom. */
function grid(...columns: string[][]): string[][] {
  return columns;
}

describe('ways to win', () => {
  const config: SlotConfig = { ...base, reels: 5, rows: 3 };

  it('counts a 5x3 grid as 243 ways', () => {
    expect(waysCount([3, 3, 3, 3, 3])).toBe(243);
  });

  it('multiplies the positions on each consecutive reel', () => {
    // cherry on 2 positions, then 1, then 3: 6 ways over three reels.
    const board = grid(
      [CHERRY, CHERRY, LEMON],
      [CHERRY, BELL, BELL],
      [CHERRY, CHERRY, CHERRY],
      [LEMON, LEMON, LEMON],
      [BELL, BELL, BELL],
    );
    const wins = evaluateWays(config, board, 10).filter((win) => win.symbolId === CHERRY);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.reels).toBe(3);
    expect(wins[0]!.ways).toBe(2 * 1 * 3);
  });

  it('stops at the first reel without the symbol', () => {
    const board = grid(
      [CHERRY, CHERRY, CHERRY],
      [LEMON, LEMON, LEMON],
      [CHERRY, CHERRY, CHERRY],
      [CHERRY, CHERRY, CHERRY],
      [CHERRY, CHERRY, CHERRY],
    );
    // Broken at reel 2, so nothing pays however many follow.
    expect(evaluateWays(config, board, 10).filter((w) => w.symbolId === CHERRY)).toHaveLength(0);
  });

  it('lets wilds stand in', () => {
    const board = grid(
      [CHERRY, LEMON, LEMON],
      [WILD, LEMON, LEMON],
      [CHERRY, LEMON, LEMON],
      [LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON],
    );
    const win = evaluateWays(config, board, 10).find((w) => w.symbolId === CHERRY);
    expect(win?.reels).toBe(3);
  });

  it('never pays a scatter as a way', () => {
    const board = grid(
      [SCATTER, SCATTER, SCATTER],
      [SCATTER, SCATTER, SCATTER],
      [SCATTER, SCATTER, SCATTER],
      [SCATTER, SCATTER, SCATTER],
      [SCATTER, SCATTER, SCATTER],
    );
    expect(evaluateWays(config, board, 10).some((w) => w.symbolId === SCATTER)).toBe(false);
  });
});

describe('cluster pays', () => {
  const config: SlotConfig = { ...base, reels: 5, rows: 5 };

  it('pays a group of touching symbols', () => {
    const board = grid(
      [CHERRY, CHERRY, LEMON, LEMON, LEMON],
      [CHERRY, CHERRY, LEMON, LEMON, LEMON],
      [CHERRY, BELL, BELL, BELL, BELL],
      [BELL, BELL, BELL, BELL, BELL],
      [BELL, BELL, BELL, BELL, BELL],
    );
    const wins = evaluateCluster(config, board, 10);
    const cherry = wins.find((win) => win.symbolId === CHERRY);
    expect(cherry?.size).toBe(5);
  });

  it('does not connect diagonally', () => {
    // Two cherries touching only at a corner are two clusters of one, and
    // neither reaches the minimum.
    const board = grid(
      [CHERRY, LEMON, LEMON, LEMON, LEMON],
      [LEMON, CHERRY, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
    );
    expect(evaluateCluster(config, board, 10).some((w) => w.symbolId === CHERRY)).toBe(false);
  });

  it('ignores a group below the minimum', () => {
    const short = Array.from({ length: DEFAULT_MIN_CLUSTER - 1 }, () => CHERRY);
    const board = grid(
      [...short, LEMON].slice(0, 5),
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
    );
    expect(evaluateCluster(config, board, 10).some((w) => w.symbolId === CHERRY)).toBe(false);
  });

  it('lets a wild join a cluster but never seed one', () => {
    const allWild = grid(
      [WILD, WILD, WILD, WILD, WILD],
      [WILD, WILD, WILD, WILD, WILD],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
    );
    // A blob of wilds alone pays nothing: it belongs to no symbol.
    expect(evaluateCluster(config, allWild, 10).some((w) => w.symbolId === WILD)).toBe(false);
  });

  it('never counts one cell in two clusters', () => {
    const board = grid(
      [CHERRY, CHERRY, CHERRY, CHERRY, CHERRY],
      [CHERRY, CHERRY, CHERRY, CHERRY, CHERRY],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
    );
    const wins = evaluateCluster(config, board, 10);
    const cells = wins.flatMap((win) => win.cells);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('pays a bigger cluster more than a smaller one', () => {
    const small = grid(
      [CHERRY, CHERRY, CHERRY, LEMON, LEMON],
      [CHERRY, CHERRY, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
    );
    const large = grid(
      [CHERRY, CHERRY, CHERRY, CHERRY, CHERRY],
      [CHERRY, CHERRY, CHERRY, CHERRY, CHERRY],
      [CHERRY, CHERRY, CHERRY, CHERRY, CHERRY],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
      [LEMON, LEMON, LEMON, LEMON, LEMON],
    );
    const smallWin = evaluateCluster(config, small, 10)[0]!;
    const largeWin = evaluateCluster(config, large, 10)[0]!;
    expect(largeWin.credits).toBeGreaterThan(smallWin.credits);
  });
});

describe('megaways', () => {
  it('gives every reel a height in range', () => {
    const random = new SlotRandom('heights', 0);
    for (let spin = 0; spin < 200; spin += 1) {
      const heights = rollReelHeights(6, () => random.next());
      expect(heights).toHaveLength(6);
      for (const rows of heights) {
        expect(rows).toBeGreaterThanOrEqual(MEGAWAYS_MIN_ROWS);
        expect(rows).toBeLessThanOrEqual(MEGAWAYS_MAX_ROWS);
      }
    }
  });

  it('changes the number of ways from spin to spin', () => {
    const random = new SlotRandom('variety', 0);
    const seen = new Set<number>();
    for (let spin = 0; spin < 100; spin += 1) {
      seen.add(waysCount(rollReelHeights(6, () => random.next())));
    }
    // A machine whose ways never changed would be a fixed grid wearing a
    // different name.
    expect(seen.size).toBeGreaterThan(5);
  });

  it('reaches the headline figure at full height', () => {
    expect(waysCount([7, 7, 7, 7, 7, 7])).toBe(117_649);
  });
});

describe('cascades', () => {
  it('rises with each consecutive drop', () => {
    expect(cascadeMultiplier(0)).toBe(1);
    expect(cascadeMultiplier(3)).toBeGreaterThan(cascadeMultiplier(1));
  });

  it('drops survivors down and opens the gaps at the top', () => {
    const board = grid(['a', 'b', 'c'], ['d', 'e', 'f']);
    // Clear 'b' (reel 0, row 1).
    const next = collapseGrid(board, [1], 3);
    expect(next[0]).toEqual([null, 'a', 'c']);
    expect(next[1]).toEqual(['d', 'e', 'f']);
  });

  it('empties a column that was entirely cleared', () => {
    const board = grid(['a', 'b', 'c']);
    expect(collapseGrid(board, [0, 1, 2], 3)[0]).toEqual([null, null, null]);
  });

  it('keeps the column height whatever was removed', () => {
    const board = grid(['a', 'b', 'c', 'd']);
    for (const cleared of [[], [0], [1, 2], [0, 1, 2, 3]]) {
      expect(collapseGrid(board, cleared, 4)[0]).toHaveLength(4);
    }
  });
});

describe('hold and spin', () => {
  it('resets the respins whenever a new prize lands', () => {
    let state = { held: new Map<number, number>(), respinsLeft: HOLD_AND_SPIN_RESPINS };
    state = applyHoldAndSpin(state, new Map([[4, 50]]));
    expect(state.respinsLeft).toBe(HOLD_AND_SPIN_RESPINS);
    expect(holdAndSpinTotal(state)).toBe(50);
  });

  it('counts down when nothing lands, and ends', () => {
    let state = { held: new Map<number, number>([[1, 10]]), respinsLeft: HOLD_AND_SPIN_RESPINS };
    for (let spin = 0; spin < HOLD_AND_SPIN_RESPINS; spin += 1) {
      state = applyHoldAndSpin(state, new Map());
    }
    expect(state.respinsLeft).toBe(0);
  });

  it('never overwrites a cell already holding a prize', () => {
    let state = { held: new Map<number, number>([[1, 10]]), respinsLeft: 1 };
    state = applyHoldAndSpin(state, new Map([[1, 9_999]]));
    expect(state.held.get(1)).toBe(10);
    // Nothing new landed, so the counter still went down.
    expect(state.respinsLeft).toBe(0);
  });

  it('adds up everything held', () => {
    const state = { held: new Map([[0, 10], [3, 25], [7, 100]]), respinsLeft: 1 };
    expect(holdAndSpinTotal(state)).toBe(135);
  });
});

describe('progressive jackpots', () => {
  it('has four levels', () => {
    expect(JACKPOT_LEVELS).toHaveLength(4);
  });

  it('takes one per cent of every bet, split across the levels', () => {
    expect(totalJackpotContribution()).toBeCloseTo(0.01, 10);
  });

  it('feeds the small levels faster than the large ones', () => {
    const shares = jackpotContribution(10_000);
    expect(shares.MINI).toBeGreaterThan(shares.GRAND);
  });

  it('contributes nothing on a zero bet', () => {
    const shares = jackpotContribution(0);
    for (const level of JACKPOT_LEVELS) expect(shares[level]).toBe(0);
  });
});

describe('the catalogue of mechanics', () => {
  it('names every mechanic the arcade needs', () => {
    expect([...SLOT_MECHANICS].sort()).toEqual(['CLUSTER', 'LINES', 'MEGAWAYS', 'WAYS']);
  });
});
