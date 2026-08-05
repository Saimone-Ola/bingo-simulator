import { describe, expect, it } from 'vitest';
import {
  BUILD_WIDTHS,
  MAX_HEIGHT_CM,
  MIN_HEIGHT_CM,
  REFERENCE_HEIGHT_CM,
  bodyProportions,
  clampHeightCm,
  headsTall,
  type BodyType,
} from '../bodyProportions';

const BODY_TYPES: BodyType[] = ['neutral', 'slim', 'athletic', 'curvy'];

describe('height', () => {
  it('sets the height with the vertical scale', () => {
    expect(bodyProportions(140).vertical).toBeCloseTo(140 / 175, 6);
    expect(bodyProportions(210).vertical).toBeCloseTo(210 / 175, 6);
    expect(bodyProportions(REFERENCE_HEIGHT_CM).vertical).toBe(1);
  });

  it('grows breadth more slowly than height', () => {
    // A tall avatar must not be as much wider as it is taller, or it reads as
    // a giant rather than a tall person.
    const tall = bodyProportions(MAX_HEIGHT_CM);
    expect(tall.horizontal).toBeGreaterThan(1);
    expect(tall.horizontal).toBeLessThan(tall.vertical);

    const short = bodyProportions(MIN_HEIGHT_CM);
    expect(short.horizontal).toBeLessThan(1);
    expect(short.horizontal).toBeGreaterThan(short.vertical);
  });

  it('scales the head far less than the body', () => {
    const short = bodyProportions(MIN_HEIGHT_CM);
    const tall = bodyProportions(MAX_HEIGHT_CM);
    // Relative to the body, a short avatar's head is bigger and a tall one's
    // smaller — which is what uniform scaling could never produce.
    expect(short.headRelative).toBeGreaterThan(bodyProportions(REFERENCE_HEIGHT_CM).headRelative);
    expect(tall.headRelative).toBeLessThan(bodyProportions(REFERENCE_HEIGHT_CM).headRelative);
  });

  it('is monotonic in height', () => {
    let previous = 0;
    for (let cm = MIN_HEIGHT_CM; cm <= MAX_HEIGHT_CM; cm += 1) {
      const { vertical } = bodyProportions(cm);
      expect(vertical).toBeGreaterThanOrEqual(previous);
      previous = vertical;
    }
  });

  it('clamps nonsense rather than producing a nonsense body', () => {
    expect(clampHeightCm(10)).toBe(MIN_HEIGHT_CM);
    expect(clampHeightCm(900)).toBe(MAX_HEIGHT_CM);
    expect(clampHeightCm(Number.NaN)).toBe(REFERENCE_HEIGHT_CM);
    expect(clampHeightCm(175.4)).toBe(175);
  });
});

describe('head-to-body ratio', () => {
  it('keeps every height in stylised-adult territory, never toddler', () => {
    // A toddler is about four heads tall and an adult seven to eight. The rig
    // measured 4.7 before this module existed, which is most of why the
    // avatars did not read as people.
    for (let cm = MIN_HEIGHT_CM; cm <= MAX_HEIGHT_CM; cm += 5) {
      const heads = headsTall(cm);
      expect(heads, `${cm} cm`).toBeGreaterThan(5.5);
      expect(heads, `${cm} cm`).toBeLessThan(7.5);
    }
  });

  it('makes short avatars proportionally bigger-headed than tall ones', () => {
    // The real effect this models: shorter adults are nearer seven heads,
    // taller ones nearer eight.
    expect(headsTall(MIN_HEIGHT_CM)).toBeLessThan(headsTall(REFERENCE_HEIGHT_CM));
    expect(headsTall(REFERENCE_HEIGHT_CM)).toBeLessThan(headsTall(MAX_HEIGHT_CM));
  });

  it('spreads the range enough to be visible but not grotesque', () => {
    const spread = headsTall(MAX_HEIGHT_CM) - headsTall(MIN_HEIGHT_CM);
    expect(spread).toBeGreaterThan(0.4);
    expect(spread).toBeLessThan(2);
  });
});

describe('builds', () => {
  it('gives every body type a distinguishable silhouette', () => {
    // With one width multiplier the four types differed by a few per cent and
    // were indistinguishable in play.
    const signatures = BODY_TYPES.map((type) => {
      const { chest, shoulders, hips } = BUILD_WIDTHS[type];
      return `${chest}:${shoulders}:${hips}`;
    });
    expect(new Set(signatures).size).toBe(BODY_TYPES.length);
  });

  it('separates athletic from curvy by where the width is, not how much', () => {
    const athletic = BUILD_WIDTHS.athletic;
    const curvy = BUILD_WIDTHS.curvy;
    // Athletic: shoulders clear of the hips. Curvy: the other way round.
    expect(athletic.shoulders).toBeGreaterThan(athletic.hips);
    expect(curvy.hips).toBeGreaterThan(curvy.shoulders);
    // And the difference is a real one, not a rounding error.
    expect(athletic.shoulders - athletic.hips).toBeGreaterThan(0.15);
    expect(curvy.hips - curvy.shoulders).toBeGreaterThan(0.15);
  });

  it('keeps the slim build narrow everywhere', () => {
    for (const value of Object.values(BUILD_WIDTHS.slim)) {
      expect(value).toBeLessThan(1);
    }
  });

  it('leaves neutral as the untouched rig', () => {
    expect(BUILD_WIDTHS.neutral).toEqual({ chest: 1, shoulders: 1, hips: 1 });
  });

  it('carries the build through with the proportions', () => {
    for (const type of BODY_TYPES) {
      expect(bodyProportions(175, type).widths).toBe(BUILD_WIDTHS[type]);
    }
  });
});
