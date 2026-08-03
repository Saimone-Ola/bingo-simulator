/**
 * The hub's geometry, shared by client and server.
 *
 * Both ends run the *same* collision and clamping code against these values:
 * the server because it owns the authoritative position, the client because it
 * predicts locally between snapshots. If they disagreed, every wall would
 * produce a visible rubber-band.
 */

export interface CircleObstacle {
  kind: 'circle';
  x: number;
  z: number;
  radius: number;
}

export interface BoxObstacle {
  kind: 'box';
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

export type Obstacle = CircleObstacle | BoxObstacle;

/** Playable area of the hub plaza, in metres. */
export const HUB_BOUNDS = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 } as const;

/** Collision radius of an avatar, in metres. */
export const AVATAR_RADIUS = 0.42;

/** Eye height used for the third-person camera target. */
export const AVATAR_EYE_HEIGHT = 1.5;

/**
 * Static blockers. Kept deliberately coarse: cheap to test against 20 avatars
 * at 20 Hz, and precise collision is not what makes a plaza feel good.
 */
export const HUB_OBSTACLES: readonly Obstacle[] = [
  // Central fountain
  { kind: 'circle', x: 0, z: 0, radius: 3.2 },
  // Bingo hall façade (north)
  { kind: 'box', x: 0, z: -20, halfX: 9, halfZ: 3 },
  // Slot arcade (east)
  { kind: 'box', x: 20, z: 0, halfX: 3, halfZ: 8 },
  // Prize pavilion (west)
  { kind: 'box', x: -20, z: 2, halfX: 3, halfZ: 6 },
  // Shop (south)
  { kind: 'box', x: 6, z: 19, halfX: 5, halfZ: 3 },
  // Planters framing the plaza
  { kind: 'circle', x: -10, z: -10, radius: 1.6 },
  { kind: 'circle', x: 10, z: -10, radius: 1.6 },
  { kind: 'circle', x: -10, z: 10, radius: 1.6 },
  { kind: 'circle', x: 10, z: 10, radius: 1.6 },
];

/** Players are spread across these so a busy hub does not stack everyone. */
export const HUB_SPAWN_POINTS: readonly { x: number; z: number; rotY: number }[] = [
  { x: -4, z: 8, rotY: Math.PI },
  { x: 0, z: 9, rotY: Math.PI },
  { x: 4, z: 8, rotY: Math.PI },
  { x: -7, z: 6, rotY: Math.PI * 0.85 },
  { x: 7, z: 6, rotY: Math.PI * 1.15 },
  { x: -2, z: 11, rotY: Math.PI },
  { x: 2, z: 11, rotY: Math.PI },
  { x: 0, z: 6, rotY: Math.PI },
];

/** Enterable destinations. The central fountain is scenery and collision only. */
export interface PointOfInterest {
  id: string;
  /** Italian label shown in the UI. */
  label: string;
  x: number;
  z: number;
  /** Where the player is placed when teleporting here. */
  standX: number;
  standZ: number;
  /** Which phase unlocks it; the UI greys out what does not exist yet. */
  availableFromPhase: number;
}

export const HUB_POIS: readonly PointOfInterest[] = [
  {
    id: 'bingo_hall',
    label: 'Sala Bingo',
    x: 0,
    z: -20,
    standX: 0,
    standZ: -15,
    availableFromPhase: 1,
  },
  {
    id: 'slot_arcade',
    label: 'Arcade Slot',
    x: 20,
    z: 0,
    standX: 15,
    standZ: 0,
    availableFromPhase: 1,
  },
  {
    id: 'prize_pavilion',
    label: 'Padiglione Premi',
    x: -20,
    z: 2,
    standX: -15,
    standZ: 2,
    availableFromPhase: 1,
  },
  {
    id: 'shop',
    label: 'Negozio',
    x: 6,
    z: 19,
    standX: 6,
    standZ: 14,
    availableFromPhase: 1,
  },
];

/** Clamps a point inside the plaza, accounting for the avatar's radius. */
export function clampToBounds(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(Math.max(x, HUB_BOUNDS.minX + AVATAR_RADIUS), HUB_BOUNDS.maxX - AVATAR_RADIUS),
    z: Math.min(Math.max(z, HUB_BOUNDS.minZ + AVATAR_RADIUS), HUB_BOUNDS.maxZ - AVATAR_RADIUS),
  };
}

/**
 * Pushes a point out of any obstacle it has entered.
 *
 * Resolves against every obstacle in order rather than solving them jointly:
 * with obstacles this sparse a single pass is enough, and it is deterministic,
 * which is what actually matters for client and server agreeing.
 */
export function resolveCollisions(x: number, z: number): { x: number; z: number } {
  let px = x;
  let pz = z;

  for (const obstacle of HUB_OBSTACLES) {
    if (obstacle.kind === 'circle') {
      const dx = px - obstacle.x;
      const dz = pz - obstacle.z;
      const minDistance = obstacle.radius + AVATAR_RADIUS;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq < minDistance * minDistance) {
        const distance = Math.sqrt(distanceSq);
        if (distance < 1e-6) {
          // Dead centre: push along +X so the result stays deterministic.
          px = obstacle.x + minDistance;
        } else {
          px = obstacle.x + (dx / distance) * minDistance;
          pz = obstacle.z + (dz / distance) * minDistance;
        }
      }
      continue;
    }

    const limitX = obstacle.halfX + AVATAR_RADIUS;
    const limitZ = obstacle.halfZ + AVATAR_RADIUS;
    const dx = px - obstacle.x;
    const dz = pz - obstacle.z;

    if (Math.abs(dx) < limitX && Math.abs(dz) < limitZ) {
      // Eject along the axis of least penetration.
      const pushX = limitX - Math.abs(dx);
      const pushZ = limitZ - Math.abs(dz);
      if (pushX < pushZ) {
        px = obstacle.x + Math.sign(dx || 1) * limitX;
      } else {
        pz = obstacle.z + Math.sign(dz || 1) * limitZ;
      }
    }
  }

  return { x: px, z: pz };
}

/** Bounds clamp plus obstacle resolution: the one movement rule both ends use. */
export function resolvePosition(x: number, z: number): { x: number; z: number } {
  const bounded = clampToBounds(x, z);
  const resolved = resolveCollisions(bounded.x, bounded.z);
  return clampToBounds(resolved.x, resolved.z);
}
