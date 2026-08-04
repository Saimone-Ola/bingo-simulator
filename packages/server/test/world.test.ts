import { describe, expect, it } from 'vitest';
import {
  AVATAR_EYE_HEIGHT,
  AVATAR_RADIUS,
  HUB_BOUNDS,
  HUB_OBSTACLES,
  clampToBounds,
  isSightBlocked,
  resolveCollisions,
  resolvePosition,
  sweepCameraFraction,
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

describe('line of sight', () => {
  it('sees a player standing in the open', () => {
    expect(isSightBlocked(0, 10, 5, 12)).toBe(false);
  });

  it('is blocked by a building between the two points', () => {
    // Camera south of the bingo hall, player behind it to the north.
    expect(isSightBlocked(0, -10, 0, -26)).toBe(true);
  });

  it('sees past a building when the line misses it', () => {
    // Same depth, but well to the side of the hall's 18 m façade.
    expect(isSightBlocked(20, -10, 20, -26)).toBe(false);
  });

  it('is not blocked by the fountain or the planters', () => {
    // Straight through the middle of the fountain, and through a planter.
    expect(isSightBlocked(-8, 0, 8, 0)).toBe(false);
    expect(isSightBlocked(-10, -14, -10, -6)).toBe(false);
  });

  it('is symmetric: sight is not one-way', () => {
    expect(isSightBlocked(0, -10, 0, -26)).toBe(isSightBlocked(0, -26, 0, -10));
    expect(isSightBlocked(-18, 8, -22, 8)).toBe(isSightBlocked(-22, 8, -18, 8));
  });

  it('does not block a zero length segment outside any building', () => {
    expect(isSightBlocked(4, 4, 4, 4)).toBe(false);
  });

  it('reports a point inside a building as blocked from outside', () => {
    expect(isSightBlocked(-20, 2, -20, 12)).toBe(true);
  });

  it('agrees with collision: nothing occluding is ever walkable', () => {
    // A tag may only be hidden by something a player could not stand inside.
    for (const obstacle of HUB_OBSTACLES) {
      if (!obstacle.occludes) continue;
      const resolved = resolvePosition(obstacle.x, obstacle.z);
      expect(Math.hypot(resolved.x - obstacle.x, resolved.z - obstacle.z)).toBeGreaterThan(0.1);
    }
  });
});

describe('camera sweep', () => {
  const HEAD = AVATAR_EYE_HEIGHT;

  it('leaves the camera alone in open space', () => {
    expect(sweepCameraFraction(0, HEAD, 10, 0, 5, 18)).toBe(1);
  });

  it('pulls the camera in when a building is behind the player', () => {
    // Standing just south of the bingo hall, camera pushed north into it.
    const fraction = sweepCameraFraction(0, HEAD, -16, 0, 4, -26);
    expect(fraction).toBeLessThan(1);
    expect(fraction).toBeGreaterThan(0);
  });

  it('lets the camera rise over a waist-high planter', () => {
    // Planter at (-10, -10) is 0.9 m tall; the camera passes well above it.
    expect(sweepCameraFraction(-10, HEAD, -4, -10, 6, -16)).toBe(1);
  });

  it('stops the camera going through a planter at head height', () => {
    expect(sweepCameraFraction(-10, 0.6, -4, -10, 0.6, -16)).toBeLessThan(1);
  });

  it('stops the camera passing through the fountain at low height', () => {
    expect(sweepCameraFraction(-8, 1.2, 0, 8, 1.2, 0)).toBeLessThan(1);
  });

  it('lets the camera fly over the fountain', () => {
    expect(sweepCameraFraction(-8, 4, 0, 8, 4, 0)).toBe(1);
  });

  it('collapses to zero when the camera origin is already inside a wall', () => {
    expect(sweepCameraFraction(0, 2, -20, 0, 5, -30)).toBe(0);
  });

  it('returns a fraction inside [0, 1] for a sweep of the whole plaza', () => {
    for (let x = -28; x <= 28; x += 4) {
      for (let z = -28; z <= 28; z += 4) {
        const fraction = sweepCameraFraction(x, HEAD, z, x + 9, 5, z + 9);
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1);
        expect(Number.isFinite(fraction)).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    const first = sweepCameraFraction(0, HEAD, -16, 0, 4, -26);
    const second = sweepCameraFraction(0, HEAD, -16, 0, 4, -26);
    expect(first).toBe(second);
  });

  it('treats a zero length sweep as unobstructed', () => {
    expect(sweepCameraFraction(3, 2, 3, 3, 2, 3)).toBe(1);
  });
});
