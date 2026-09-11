import { HALL_BOUNDS } from './hallLayout';

/** Derived from the current hall: the old ±9 m loop cut through seated guests. */
export const WAITER_PATH = [
  [HALL_BOUNDS.minX + 0.8, HALL_BOUNDS.maxZ - 3.2],
  [HALL_BOUNDS.minX + 0.8, HALL_BOUNDS.minZ + 0.8],
  [HALL_BOUNDS.maxX - 0.8, HALL_BOUNDS.minZ + 0.8],
  [HALL_BOUNDS.maxX - 0.8, HALL_BOUNDS.maxZ - 3.2],
] as const;

const LENGTHS = WAITER_PATH.map((from, index) => {
  const to = WAITER_PATH[(index + 1) % WAITER_PATH.length]!;
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
});
export const WAITER_PATH_LENGTH = LENGTHS.reduce((total, length) => total + length, 0);
export const WAITER_SPEED = 1.05;

/** Metres travelled, not a percentage of segments of unequal length. */
export function waiterPose(distance: number) {
  let remaining = ((distance % WAITER_PATH_LENGTH) + WAITER_PATH_LENGTH) % WAITER_PATH_LENGTH;
  for (let index = 0; index < WAITER_PATH.length; index += 1) {
    const length = LENGTHS[index]!;
    if (remaining <= length) {
      const from = WAITER_PATH[index]!;
      const to = WAITER_PATH[(index + 1) % WAITER_PATH.length]!;
      const t = remaining / length;
      return { x: from[0] + (to[0] - from[0]) * t, z: from[1] + (to[1] - from[1]) * t, yaw: Math.atan2(to[0] - from[0], to[1] - from[1]) };
    }
    remaining -= length;
  }
  return { x: WAITER_PATH[0][0], z: WAITER_PATH[0][1], yaw: Math.PI };
}
