/**
 * How an avatar's build and height are turned into scales for the rig.
 *
 * Two things were wrong with what this replaces.
 *
 * **The head was enormous.** Measured off the rig, the character stood about
 * 4.7 heads tall. An adult human is between seven and eight; five is roughly a
 * toddler. That single ratio is most of why the avatars did not read as people.
 *
 * **Height was a uniform scale.** Multiplying the whole character by
 * `heightCm / 175` makes a 150 cm avatar an adult shrunk in every direction,
 * head included, which reads as a child — and a 205 cm one a giant rather than
 * a tall person. Real stature variation is *allometric*: different parts scale
 * at different rates. Breadth lags behind height, and head size lags much
 * further, which is why shorter adults are proportionally bigger-headed
 * (about seven heads) than taller ones (about eight).
 *
 * Everything here is a pure function of the appearance, so the proportions can
 * be asserted in a test instead of judged by eye.
 */

/* ------------------------------------------------------------------ *
 * Measurements of the rig itself, in its own units.
 * ------------------------------------------------------------------ */

/** Chin height: everything below the head, which scales with the body. */
const RIG_CHIN_HEIGHT = 1.641;
/** Chin to crown at the rig's modelled head size. */
const RIG_HEAD_HEIGHT = 0.442;
/**
 * Distance from the head group's origin down to the chin, before scaling.
 *
 * Needed because shrinking the head about its own origin lifts the chin, and a
 * head that keeps its old position ends up floating above the shoulders on a
 * stretched neck. Scaling the offset by the same factor puts the chin back
 * where the neck expects it.
 */
const RIG_HEAD_ORIGIN_TO_CHIN = 0.209;

/**
 * Head size relative to how the rig was modelled.
 *
 * Chosen to land the character near six heads tall: still stylised, and far
 * enough from an adult's seven and a half that it stays friendly rather than
 * uncanny, but nowhere near the toddler proportion it had.
 */
export const HEAD_BASE_SCALE = 0.68;

/** Stature the untouched rig is modelled at. */
export const REFERENCE_HEIGHT_CM = 175;

/** Range the customiser offers, and the range the rig still looks right in. */
export const MIN_HEIGHT_CM = 140;
export const MAX_HEIGHT_CM = 210;

/**
 * Exponents relating breadth and head size to stature.
 *
 * 1 would be uniform scaling, 0 would be not scaling at all. Both sit below 1
 * because both quantities lag behind height, and the head lags furthest.
 */
const BREADTH_EXPONENT = 0.55;
const HEAD_EXPONENT = 0.45;

export type BodyType = 'neutral' | 'slim' | 'athletic' | 'curvy';

/**
 * A build, as the three widths that actually distinguish one.
 *
 * Shoulders and hips are separate because that is the whole difference between
 * an athletic build and a curvy one. With a single width multiplier the four
 * body types differed by a few per cent and were indistinguishable in play.
 */
export interface BuildWidths {
  /** Chest and torso depth. */
  chest: number;
  shoulders: number;
  hips: number;
}

export const BUILD_WIDTHS: Record<BodyType, BuildWidths> = {
  neutral: { chest: 1, shoulders: 1, hips: 1 },
  // Narrow throughout, shoulders barely wider than the hips.
  slim: { chest: 0.85, shoulders: 0.9, hips: 0.88 },
  // The V: shoulders well clear of the hips.
  athletic: { chest: 1.08, shoulders: 1.22, hips: 0.98 },
  // The inverse: hips clearly the widest measurement.
  curvy: { chest: 1.06, shoulders: 0.97, hips: 1.24 },
};

export interface BodyProportions {
  /** Multiplier along Y: this is the one that sets the height. */
  vertical: number;
  /** Multiplier along X and Z, for the body. */
  horizontal: number;
  /**
   * Scale for the head group, *relative to the root*.
   *
   * Above 1 for a short avatar and below 1 for a tall one, so that after the
   * root's own scaling the head lands where it should rather than where
   * uniform scaling would put it.
   */
  headRelative: number;
  widths: BuildWidths;
}

export function clampHeightCm(heightCm: number): number {
  if (!Number.isFinite(heightCm)) return REFERENCE_HEIGHT_CM;
  return Math.min(MAX_HEIGHT_CM, Math.max(MIN_HEIGHT_CM, Math.round(heightCm)));
}

export function bodyProportions(heightCm: number, bodyType: BodyType = 'neutral'): BodyProportions {
  const vertical = clampHeightCm(heightCm) / REFERENCE_HEIGHT_CM;
  return {
    vertical,
    horizontal: vertical ** BREADTH_EXPONENT,
    // The head's absolute scale is HEAD_BASE_SCALE * vertical ** HEAD_EXPONENT;
    // dividing by `vertical` gives what to hand the child group, since the root
    // has already applied its own.
    headRelative: (HEAD_BASE_SCALE * vertical ** HEAD_EXPONENT) / vertical,
    widths: BUILD_WIDTHS[bodyType],
  };
}

/**
 * Height measured in head heights — the ratio the eye actually reads.
 *
 * Both terms move: the body below the chin scales with `vertical`, the head
 * with its own smaller factor, so the total is not simply proportional to
 * either.
 */
/**
 * Where to place the head group so the chin stays on the neck.
 *
 * The neck ends at a fixed height in the rig, so the chin has to land there
 * whatever size the head is.
 */
export function headGroupY(headRelative: number): number {
  // The chin also settles slightly lower as the head shrinks. Without this the
  // exposed neck keeps its original length against a smaller head and reads as
  // a giraffe: the neck belongs to the head visually, not to the torso.
  const chin = RIG_CHIN_HEIGHT - NECK_TIGHTEN * (1 - headRelative);
  return chin + RIG_HEAD_ORIGIN_TO_CHIN * headRelative;
}

/** How far the chin drops per unit of head shrink. */
const NECK_TIGHTEN = 0.13;

/** Scale for the neck mesh, which shortens with the head rather than the body. */
export function neckScale(headRelative: number): number {
  return 0.55 + 0.45 * headRelative;
}

export function headsTall(heightCm: number): number {
  const { vertical, headRelative } = bodyProportions(heightCm);
  const headScale = vertical * headRelative;
  const stature = RIG_CHIN_HEIGHT * vertical + RIG_HEAD_HEIGHT * headScale;
  return stature / (RIG_HEAD_HEIGHT * headScale);
}
