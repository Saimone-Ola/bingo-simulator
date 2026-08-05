import { describe, expect, it } from 'vitest';
import { convergenceRun, runInstantChecks } from '../thesisChecks';

/**
 * The presentation mode shows these results live. A failure here means the
 * project would be demonstrating a property it no longer has, which is worse
 * than not demonstrating it at all.
 */

describe('live thesis checks', () => {
  const results = runInstantChecks();

  it('passes every claim it puts on screen', () => {
    for (const result of results) {
      expect(result, `${result.id}: ${result.evidence}`).toMatchObject({ passed: true });
    }
  });

  it('gives each claim a consequence and a place to look', () => {
    for (const result of results) {
      expect(result.claim.length).toBeGreaterThan(20);
      expect(result.source).toMatch(/^packages\/.+ · .+/);
      expect(result.evidence.length).toBeGreaterThan(10);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
  });
});

describe('convergence run', () => {
  it('reports progress in batches and settles near the publishable window', () => {
    const samples = [...convergenceRun('medium', 20_000, 5_000)];
    expect(samples.map((s) => s.spins)).toEqual([5_000, 10_000, 15_000, 20_000]);

    const last = samples.at(-1)!;
    // Not asserting the exact figure: this is a measurement, and pinning it
    // would make the test a copy of the answer rather than a check on it.
    expect(last.measured).toBeGreaterThan(0.8);
    expect(last.measured).toBeLessThan(1.1);
    // The base game is a lower bound, so the measurement must sit above it.
    expect(last.measured).toBeGreaterThan(last.analytic);
  });

  it('keeps the analytic reference constant across the run', () => {
    const samples = [...convergenceRun('high', 10_000, 5_000)];
    expect(new Set(samples.map((s) => s.analytic)).size).toBe(1);
  });
});
