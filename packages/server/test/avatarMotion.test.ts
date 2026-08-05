import { describe, expect, it } from 'vitest';
import {
  AVATAR_RUN_SPEED,
  AVATAR_WALK_SPEED,
  avatarFacing,
  createAvatarMotion,
  stepAvatarMotion,
  type AvatarIntent,
} from '@bingo/shared';

/**
 * Avatar kinematics.
 *
 * The client predicts this and the server re-simulates it. The property that
 * matters is not that the two agree exactly — they integrate on different
 * clocks and never could — but that they agree closely enough that the
 * reconciliation threshold is never tripped by the maths alone.
 */

const FORWARD: AvatarIntent = { dirX: 0, dirZ: 1, run: false };
const STILL: AvatarIntent = { dirX: 0, dirZ: 0, run: false };

/** Runs `seconds` of the same intent in fixed steps of `dt`. */
function run(intent: AvatarIntent, seconds: number, dt: number) {
  const motion = createAvatarMotion(0, 0);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) stepAvatarMotion(motion, intent, dt);
  return motion;
}

describe('avatar motion', () => {
  it('accelerates instead of starting at full speed', () => {
    const motion = createAvatarMotion(0, 0);
    const first = stepAvatarMotion(motion, FORWARD, 1 / 60);
    // A sixtieth of a second in, the avatar is moving but nowhere near walking
    // pace: that ramp is the whole point of the module.
    expect(first.speed).toBeGreaterThan(0);
    expect(first.speed).toBeLessThan(AVATAR_WALK_SPEED * 0.25);
  });

  it('reaches walking speed and never exceeds it', () => {
    const motion = run(FORWARD, 2, 1 / 60);
    const speed = Math.hypot(motion.vx, motion.vz);
    expect(speed).toBeGreaterThan(AVATAR_WALK_SPEED * 0.99);
    expect(speed).toBeLessThanOrEqual(AVATAR_WALK_SPEED + 1e-9);
  });

  it('cannot be made to overshoot by a huge step', () => {
    const motion = createAvatarMotion(0, 0);
    stepAvatarMotion(motion, { dirX: 0, dirZ: 1, run: true }, 10);
    expect(Math.hypot(motion.vx, motion.vz)).toBeLessThanOrEqual(AVATAR_RUN_SPEED + 1e-9);
  });

  it('comes to a complete rest rather than drifting forever', () => {
    const motion = run(FORWARD, 2, 1 / 60);
    for (let i = 0; i < 120; i += 1) stepAvatarMotion(motion, STILL, 1 / 60);
    expect(motion.vx).toBe(0);
    expect(motion.vz).toBe(0);
  });

  it('normalises the intent so a diagonal is not faster', () => {
    const straight = run({ dirX: 0, dirZ: 1, run: false }, 3, 1 / 60);
    const diagonal = run({ dirX: 1, dirZ: 1, run: false }, 3, 1 / 60);
    expect(Math.hypot(diagonal.vx, diagonal.vz)).toBeCloseTo(
      Math.hypot(straight.vx, straight.vz),
      6,
    );
  });

  it('agrees between a 60 Hz client and a 20 Hz server well inside the reconcile threshold', () => {
    // The client integrates at frame rate, the server at its tick rate. Any
    // gap between them is what the reconciliation has to absorb, so it must
    // stay far below the threshold that pulls the player to the server.
    for (const seconds of [0.5, 1, 3]) {
      const client = run(FORWARD, seconds, 1 / 60);
      const server = run(FORWARD, seconds, 1 / 20);
      const gap = Math.hypot(client.x - server.x, client.z - server.z);
      expect(gap).toBeLessThan(0.05);
    }
  });

  it('faces the way it is actually travelling, not the key being held', () => {
    const motion = run({ dirX: 1, dirZ: 0, run: false }, 1, 1 / 60);
    expect(avatarFacing(motion)).toBeCloseTo(Math.PI / 2, 3);

    // Released: still coasting east, so still facing east.
    stepAvatarMotion(motion, STILL, 1 / 60);
    expect(avatarFacing(motion)).toBeCloseTo(Math.PI / 2, 3);
  });

  it('has no facing at all once it has stopped', () => {
    const motion = createAvatarMotion(0, 0);
    expect(avatarFacing(motion)).toBeNull();
  });
});
