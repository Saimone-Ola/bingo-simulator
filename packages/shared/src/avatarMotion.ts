/**
 * How an avatar accelerates, coasts and stops in the hub.
 *
 * This lives in `@bingo/shared` for the same reason `resolvePosition` does: the
 * client predicts the local player's motion and the server re-simulates it from
 * the same intents, so the two must run *the same code*, not two
 * implementations of the same paragraph. A copy on each side would drift apart
 * the first time one of them was tuned.
 *
 * Before this module the avatar had no inertia at all — pressing a key set the
 * velocity to full speed for that frame and releasing it set the velocity to
 * zero — which is exactly why walking felt like sliding a chess piece. The
 * velocity now approaches its target exponentially, which is frame rate
 * independent: the same intent held for the same wall clock time produces the
 * same distance whether it was integrated in three steps or in three hundred.
 */

import { AVATAR_RUN_SPEED, AVATAR_WALK_SPEED } from './protocol';
import { resolvePosition } from './world';

/**
 * Rate at which velocity closes on the target, per second.
 *
 * Stopping is quicker than starting. A player who releases the keys expects to
 * stop roughly where they let go, while a slower ramp up is what reads as
 * weight rather than as lag.
 */
export const AVATAR_ACCELERATION = 12;
export const AVATAR_DECELERATION = 18;

/** Below this the avatar is standing still, and residual drift is discarded. */
export const AVATAR_REST_SPEED = 0.05;

export interface AvatarMotion {
  x: number;
  z: number;
  /** Velocity in the XZ plane, metres per second. */
  vx: number;
  vz: number;
}

export interface AvatarIntent {
  /** Direction the player is asking to move. Not required to be normalised. */
  dirX: number;
  dirZ: number;
  run: boolean;
}

export function createAvatarMotion(x: number, z: number): AvatarMotion {
  return { x, z, vx: 0, vz: 0 };
}

export interface AvatarStepResult {
  /** Whether the avatar is moving fast enough to play a walk cycle. */
  moving: boolean;
  /** Speed after the step, so a caller can pick between walking and running. */
  speed: number;
}

/**
 * Advances one avatar by `dt` seconds and writes the result back into `motion`.
 *
 * The intent is normalised here rather than trusted, which is what stops a
 * client sending (1, 1) from travelling 1.41 times faster on the diagonal. The
 * server relied on that already; keeping it inside the shared step means the
 * client cannot accidentally predict a speed the server will refuse.
 */
export function stepAvatarMotion(
  motion: AvatarMotion,
  intent: AvatarIntent,
  dt: number,
): AvatarStepResult {
  const magnitude = Math.hypot(intent.dirX, intent.dirZ);
  const wants = magnitude > 0.01;
  const speed = intent.run ? AVATAR_RUN_SPEED : AVATAR_WALK_SPEED;

  const targetVx = wants ? (intent.dirX / magnitude) * speed : 0;
  const targetVz = wants ? (intent.dirZ / magnitude) * speed : 0;

  // Exponential approach: frame rate independent, and it can never overshoot
  // the target however large the step, which a linear ramp would.
  const lambda = wants ? AVATAR_ACCELERATION : AVATAR_DECELERATION;
  const blend = 1 - Math.exp(-lambda * dt);
  motion.vx += (targetVx - motion.vx) * blend;
  motion.vz += (targetVz - motion.vz) * blend;

  const current = Math.hypot(motion.vx, motion.vz);
  if (current < AVATAR_REST_SPEED) {
    motion.vx = 0;
    motion.vz = 0;
    return { moving: false, speed: 0 };
  }

  // Collision resolution stays where it was: one shared function, applied to
  // the integrated position, so a wall stops the prediction and the
  // authoritative simulation at the same place.
  const resolved = resolvePosition(motion.x + motion.vx * dt, motion.z + motion.vz * dt);
  motion.x = resolved.x;
  motion.z = resolved.z;

  return { moving: true, speed: current };
}

/**
 * Facing the avatar should turn towards, or `null` when it is not moving.
 *
 * Derived from velocity rather than from the key being held, so an avatar
 * decelerating out of a turn keeps facing where it is actually going.
 */
export function avatarFacing(motion: AvatarMotion): number | null {
  if (motion.vx === 0 && motion.vz === 0) return null;
  return Math.atan2(motion.vx, motion.vz);
}
