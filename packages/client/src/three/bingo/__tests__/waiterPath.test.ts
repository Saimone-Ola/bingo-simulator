import { describe, expect, it } from 'vitest';
import { HALL_BOUNDS, HALL_COLLIDERS } from '../hallLayout';
import { WAITER_PATH_LENGTH, WAITER_SPEED, waiterPose } from '../waiterPath';

describe('waiter in the resized hall', () => {
  it('keeps the whole perimeter route clear of tables, chairs and reception', () => {
    for (let distance = 0; distance < WAITER_PATH_LENGTH; distance += 0.2) {
      const { x, z } = waiterPose(distance);
      expect(x).toBeGreaterThan(HALL_BOUNDS.minX);
      expect(x).toBeLessThan(HALL_BOUNDS.maxX);
      expect(z).toBeGreaterThan(HALL_BOUNDS.minZ);
      expect(z).toBeLessThan(HALL_BOUNDS.maxZ);
      for (const obstacle of HALL_COLLIDERS) {
        if (obstacle.kind === 'circle') {
          expect(Math.hypot(x - obstacle.x, z - obstacle.z)).toBeGreaterThan(obstacle.radius + 0.2);
        } else {
          expect(x < obstacle.minX - 0.2 || x > obstacle.maxX + 0.2 || z < obstacle.minZ - 0.2 || z > obstacle.maxZ + 0.2).toBe(true);
        }
      }
    }
  });

  it('travels in metres per second and closes the loop exactly', () => {
    const from = waiterPose(1);
    const to = waiterPose(1 + WAITER_SPEED);
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeCloseTo(WAITER_SPEED, 8);
    expect(waiterPose(WAITER_PATH_LENGTH)).toEqual(waiterPose(0));
  });
});
