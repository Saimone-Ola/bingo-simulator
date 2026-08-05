/**
 * Frame rate independent smoothing.
 *
 * One copy, because there were two: the hub crowd and the Bingo hall each had
 * their own `damp`/`dampAngle`, identical in intent and subtly different in
 * implementation. Two copies of a smoothing function are two things to tune and
 * one of them will be missed.
 */

/** Shortest signed way round from one angle to another, in radians. */
export function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

/**
 * Exponential approach towards a target.
 *
 * `lambda` is the rate per second, so the result is the same whether the frame
 * took 4 ms or 40 — which a naive `current += (target - current) * 0.1` is not,
 * and which is why smoothing written that way speeds up on a faster machine.
 */
export function damp(current: number, target: number, lambda: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

/** As `damp`, but turns the short way round instead of unwinding through π. */
export function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  return current + shortestAngle(current, target) * (1 - Math.exp(-lambda * delta));
}
