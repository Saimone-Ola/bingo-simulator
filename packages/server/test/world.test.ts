import { describe, expect, it } from 'vitest';
import {
  AVATAR_RADIUS,
  HUB_BOUNDS,
  HUB_OBSTACLES,
  clampToBounds,
  resolveCollisions,
  resolvePosition,
} from '@bingo/shared';

/**
 * The world geometry is the one piece of simulation that runs on both ends:
 * the server to decide where a player actually is, the client to predict it
 * between snapshots. If these two disagreed, every wall in the hub would
 * rubber-band. Hence the determinism tests.
 */

function isInsideAnyObstacle(x: number, z: number): boolean {
  return HUB_OBSTACLES.some((obstacle) => {
    if (obstacle.kind === 'circle') {
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      // Allow a hair of tolerance for float error at the exact boundary.
      return Math.hypot(dx, dz) < obstacle.radius + AVATAR_RADIUS - 1e-6;
    }
    return (
      Math.abs(x - obstacle.x) < obstacle.halfX + AVATAR_RADIUS - 1e-6 &&
      Math.abs(z - obstacle.z) < obstacle.halfZ + AVATAR_RADIUS - 1e-6
    );
  });
}

describe('bounds', () => {
  it('keeps a player inside the plaza', () => {
    const escaped = clampToBounds(500, -500);
    expect(escaped.x).toBeLessThanOrEqual(HUB_BOUNDS.maxX);
    expect(escaped.z).toBeGreaterThanOrEqual(HUB_BOUNDS.minZ);
  });

  it('leaves an interior point untouched', () => {
    expect(clampToBounds(5, -7)).toEqual({ x: 5, z: -7 });
  });
});

describe('collision resolution', () => {
  it('pushes a player out of the fountain', () => {
    const resolved = resolveCollisions(0.5, 0.5);
    expect(isInsideAnyObstacle(resolved.x, resolved.z)).toBe(false);
  });

  it('resolves the exact centre of a circle deterministically', () => {
    // Without a tie-break this is a division by zero and the player teleports
    // to NaN, which then propagates into the replicated state.
    const first = resolveCollisions(0, 0);
    const second = resolveCollisions(0, 0);
    expect(Number.isFinite(first.x)).toBe(true);
    expect(Number.isFinite(first.z)).toBe(true);
    expect(first).toEqual(second);
    expect(isInsideAnyObstacle(first.x, first.z)).toBe(false);
  });

  it('ejects from a box along the shallowest axis', () => {
    // Just inside the north façade, much closer to its south face.
    const resolved = resolveCollisions(0, -17.5);
    expect(isInsideAnyObstacle(resolved.x, resolved.z)).toBe(false);
    expect(resolved.z).toBeGreaterThan(-17.5);
  });

  it('never leaves a player inside geometry, sweeping the whole plaza', () => {
    // A grid sweep is worth more here than a handful of cases: it is the only
    // way to catch the corner where two obstacles overlap.
    for (let x = HUB_BOUNDS.minX; x <= HUB_BOUNDS.maxX; x += 0.5) {
      for (let z = HUB_BOUNDS.minZ; z <= HUB_BOUNDS.maxZ; z += 0.5) {
        const resolved = resolvePosition(x, z);
        expect(Number.isFinite(resolved.x)).toBe(true);
        expect(Number.isFinite(resolved.z)).toBe(true);
        expect(isInsideAnyObstacle(resolved.x, resolved.z)).toBe(false);
      }
    }
  });

  it('is deterministic: same input, same output, every time', () => {
    const samples = [
      [0, 0],
      [3, -19],
      [19.5, 1],
      [-21, 3],
      [10.2, 10.2],
    ] as const;

    for (const [x, z] of samples) {
      const a = resolvePosition(x, z);
      const b = resolvePosition(x, z);
      expect(a).toEqual(b);
    }
  });
});
