/**
 * Geometry of the slot arcade.
 *
 * Same shape as the Bingo hall's layout module and for the same reason: one
 * place decides where a cabinet stands, and both the renderer and the collision
 * code read it, so a machine cannot be drawn somewhere you can walk through.
 */

import type { Collider, HallBounds } from '../bingo/hallLayout';

export const ARCADE_BOUNDS: HallBounds = {
  minX: -8.6,
  maxX: 8.6,
  minZ: -9.4,
  maxZ: 8.2,
};

export const ARCADE_SHELL = {
  minX: -9.2,
  maxX: 9.2,
  minZ: -10,
  maxZ: 8.8,
  wallHeight: 5.2,
  ceilingHeight: 5,
} as const;

export const ARCADE_SPAWN = { x: 0, z: 7, yaw: 0 } as const;

/** Where a player stands to play, and which way the cabinet faces. */
export interface CabinetPlacement {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  /** Three.js rotation.y for a cabinet modelled facing +Z. */
  readonly facing: number;
  /** Spot in front of the screen where the interaction prompt appears. */
  readonly standX: number;
  readonly standZ: number;
}

const CABINET_DEPTH = 0.62;
const CABINET_WIDTH = 1.15;
/** How far in front of a cabinet a player is close enough to play. */
export const CABINET_REACH = 1.5;

function place(index: number, x: number, z: number, facing: number): CabinetPlacement {
  return {
    index,
    x,
    z,
    facing,
    standX: x + Math.sin(facing) * 1.15,
    standZ: z + Math.cos(facing) * 1.15,
  };
}

/**
 * Two banks along the side walls facing the middle, plus a back row under the
 * jackpot sign. Leaves a wide central aisle, which is what stops an arcade
 * reading as a warehouse full of boxes.
 */
export const CABINETS: readonly CabinetPlacement[] = [
  place(0, -7.1, 3.2, Math.PI / 2),
  place(1, -7.1, 1, Math.PI / 2),
  place(2, -7.1, -1.2, Math.PI / 2),
  place(3, -7.1, -3.4, Math.PI / 2),
  place(4, 7.1, 3.2, -Math.PI / 2),
  place(5, 7.1, 1, -Math.PI / 2),
  place(6, 7.1, -1.2, -Math.PI / 2),
  place(7, 7.1, -3.4, -Math.PI / 2),
  place(8, -2.4, -8.2, 0),
  place(9, 0, -8.2, 0),
  place(10, 2.4, -8.2, 0),
];

function cabinetCollider(cabinet: CabinetPlacement): Collider {
  // Cabinets stand square to a wall, so an axis aligned box is exact rather
  // than an approximation.
  const alongX = Math.abs(Math.cos(cabinet.facing)) > 0.5;
  const halfX = alongX ? CABINET_WIDTH / 2 : CABINET_DEPTH / 2;
  const halfZ = alongX ? CABINET_DEPTH / 2 : CABINET_WIDTH / 2;
  return {
    kind: 'box',
    minX: cabinet.x - halfX,
    maxX: cabinet.x + halfX,
    minZ: cabinet.z - halfZ,
    maxZ: cabinet.z + halfZ,
  };
}

export const ARCADE_COLLIDERS: readonly Collider[] = [
  ...CABINETS.map(cabinetCollider),
  // Change booth by the entrance, purely to break up the room.
  { kind: 'box', minX: 4.2, maxX: 6.4, minZ: 6.4, maxZ: 7.4 },
];

export function distanceTo(x: number, z: number, targetX: number, targetZ: number): number {
  return Math.hypot(x - targetX, z - targetZ);
}

/**
 * Cabinet the player is standing in front of, or `null`.
 *
 * `machineCount` is how many cabinets actually have a machine in them. Empty
 * pitches are skipped rather than reported and then refused: offering "premi E"
 * on something that answers "fuori servizio" is a dead end, and on a fresh
 * database every cabinet was one.
 */
export function nearestCabinet(
  x: number,
  z: number,
  machineCount: number = CABINETS.length,
): CabinetPlacement | null {
  let best: CabinetPlacement | null = null;
  let bestDistance = CABINET_REACH;
  for (const cabinet of CABINETS) {
    if (cabinet.index >= machineCount) continue;
    const distance = distanceTo(x, z, cabinet.standX, cabinet.standZ);
    if (distance <= bestDistance) {
      best = cabinet;
      bestDistance = distance;
    }
  }
  return best;
}

/** Cabinets with a machine standing in them, which are the ones to draw. */
export function occupiedCabinets(machineCount: number): readonly CabinetPlacement[] {
  return CABINETS.slice(0, Math.max(0, Math.min(machineCount, CABINETS.length)));
}
