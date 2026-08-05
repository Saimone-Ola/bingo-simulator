/**
 * First person locomotion for the Bingo hall.
 *
 * Kept as pure functions so the walk speed, the acceleration curve and above all
 * the collision response can be tested without a renderer. The controller
 * component only feeds input in and copies the result onto the camera.
 */

import {
  HALL_BOUNDS,
  PLAYER_RADIUS,
  type Collider,
  type HallBounds,
} from './hallLayout';

export const WALK_SPEED = 2.35;
export const SPRINT_SPEED = 3.7;
const ACCELERATION = 14;
const DECELERATION = 18;

export type PlayerStance = 'STANDING' | 'SEATED';

export interface MovementState {
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  /** Distance walked since spawn, drives head bob and footstep audio. */
  travelled: number;
}

export interface MovementInput {
  /** 1 forward, -1 backward. */
  readonly forward: number;
  /** 1 right, -1 left. */
  readonly strafe: number;
  /** Camera yaw in radians; forward is (-sin(yaw), -cos(yaw)). */
  readonly yaw: number;
  readonly sprint: boolean;
}

export function createMovementState(x: number, z: number): MovementState {
  return { x, z, velocityX: 0, velocityZ: 0, travelled: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Pushes a circle out of a single collider, returning the corrected centre.
 *
 * Boxes resolve along the shallowest axis, which stops the player from popping
 * through a wide obstacle such as the stage when they walk into its face.
 */
export function resolveCollider(
  x: number,
  z: number,
  radius: number,
  collider: Collider,
): { x: number; z: number } {
  if (collider.kind === 'circle') {
    const dx = x - collider.x;
    const dz = z - collider.z;
    const minDistance = collider.radius + radius;
    const distance = Math.hypot(dx, dz);
    if (distance >= minDistance) return { x, z };
    if (distance < 1e-5) {
      // Degenerate case: dead centre of the obstacle. Any direction works, so
      // pick +Z to stay deterministic between frames and between clients.
      return { x, z: collider.z + minDistance };
    }
    const scale = minDistance / distance;
    return { x: collider.x + dx * scale, z: collider.z + dz * scale };
  }

  const insideX = x > collider.minX - radius && x < collider.maxX + radius;
  const insideZ = z > collider.minZ - radius && z < collider.maxZ + radius;
  if (!insideX || !insideZ) return { x, z };

  const toLeft = x - (collider.minX - radius);
  const toRight = collider.maxX + radius - x;
  const toBack = z - (collider.minZ - radius);
  const toFront = collider.maxZ + radius - z;
  const smallest = Math.min(toLeft, toRight, toBack, toFront);
  if (smallest === toLeft) return { x: collider.minX - radius, z };
  if (smallest === toRight) return { x: collider.maxX + radius, z };
  if (smallest === toBack) return { x, z: collider.minZ - radius };
  return { x, z: collider.maxZ + radius };
}

/**
 * Applies every collider in turn, twice, so a player wedged into a corner is
 * pushed out of both surfaces instead of oscillating between them.
 */
export function resolveCollisions(
  x: number,
  z: number,
  colliders: readonly Collider[],
  radius = PLAYER_RADIUS,
  bounds: HallBounds = HALL_BOUNDS,
): { x: number; z: number } {
  let currentX = clamp(x, bounds.minX + radius, bounds.maxX - radius);
  let currentZ = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
  for (let pass = 0; pass < 2; pass += 1) {
    for (const collider of colliders) {
      const resolved = resolveCollider(currentX, currentZ, radius, collider);
      currentX = resolved.x;
      currentZ = resolved.z;
    }
    currentX = clamp(currentX, bounds.minX + radius, bounds.maxX - radius);
    currentZ = clamp(currentZ, bounds.minZ + radius, bounds.maxZ - radius);
  }
  return { x: currentX, z: currentZ };
}

/**
 * Integrates one frame of locomotion.
 *
 * Mutates and returns the same state object: this runs inside `useFrame` and
 * allocating a fresh object (or a `Vector3`) sixty times a second is exactly the
 * kind of churn the hall cannot afford with dozens of characters on screen.
 */
export function stepMovement(
  state: MovementState,
  input: MovementInput,
  deltaSeconds: number,
  colliders: readonly Collider[],
  bounds: HallBounds = HALL_BOUNDS,
): MovementState {
  const delta = clamp(deltaSeconds, 0, 0.1);
  const magnitude = Math.hypot(input.forward, input.strafe);
  const targetSpeed = input.sprint ? SPRINT_SPEED : WALK_SPEED;

  let targetX = 0;
  let targetZ = 0;
  if (magnitude > 1e-4) {
    const forward = input.forward / magnitude;
    const strafe = input.strafe / magnitude;
    const sin = Math.sin(input.yaw);
    const cos = Math.cos(input.yaw);
    // Forward is (-sin, -cos); right is that vector turned 90° clockwise.
    targetX = (-forward * sin + strafe * cos) * targetSpeed;
    targetZ = (-forward * cos - strafe * sin) * targetSpeed;
  }

  const rate = magnitude > 1e-4 ? ACCELERATION : DECELERATION;
  const blend = 1 - Math.exp(-rate * delta);
  state.velocityX += (targetX - state.velocityX) * blend;
  state.velocityZ += (targetZ - state.velocityZ) * blend;
  if (Math.abs(state.velocityX) < 1e-3) state.velocityX = 0;
  if (Math.abs(state.velocityZ) < 1e-3) state.velocityZ = 0;

  const nextX = state.x + state.velocityX * delta;
  const nextZ = state.z + state.velocityZ * delta;
  const resolved = resolveCollisions(nextX, nextZ, colliders, PLAYER_RADIUS, bounds);

  state.travelled += Math.hypot(resolved.x - state.x, resolved.z - state.z);
  state.x = resolved.x;
  state.z = resolved.z;
  return state;
}

// Smoothing lives in ../damping and is re-exported here so the callers that
// already import it from this module keep working.
export { damp, dampAngle, shortestAngle } from '../damping';
