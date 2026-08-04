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
  /** See {@link BoxObstacle.occludes}. */
  occludes?: boolean;
  /** See {@link BoxObstacle.height}. */
  height?: number;
}

export interface BoxObstacle {
  kind: 'box';
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  /**
   * Whether this obstacle is tall enough to hide a standing player behind it.
   *
   * Buildings are; a knee-high planter or a fountain basin is not. Only used
   * for name tag visibility, never for collision — an obstacle blocks movement
   * regardless of how tall it is.
   */
  occludes?: boolean;
  /**
   * Height in metres, used to keep the third-person camera out of solid things.
   *
   * The camera moves in three dimensions where an avatar only moves in two, so
   * it needs to know it can pass *over* a planter but not through a façade.
   */
  height?: number;
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
  // Central fountain. Low enough to see a player standing on the far side.
  { kind: 'circle', x: 0, z: 0, radius: 3.2, height: 2.2 },
  // Bingo hall façade (north)
  { kind: 'box', x: 0, z: -20, halfX: 9, halfZ: 3, occludes: true, height: 4.5 },
  // Slot arcade (east)
  { kind: 'box', x: 20, z: 0, halfX: 3, halfZ: 8, occludes: true, height: 5 },
  // Prize pavilion (west)
  { kind: 'box', x: -20, z: 2, halfX: 3, halfZ: 6, occludes: true, height: 4.8 },
  // Shop (south)
  { kind: 'box', x: 6, z: 19, halfX: 5, halfZ: 3, occludes: true, height: 4.2 },
  // Planters framing the plaza. Waist high, so they never hide anyone.
  { kind: 'circle', x: -10, z: -10, radius: 1.6, height: 0.9 },
  { kind: 'circle', x: 10, z: -10, radius: 1.6, height: 0.9 },
  { kind: 'circle', x: -10, z: 10, radius: 1.6, height: 0.9 },
  { kind: 'circle', x: 10, z: 10, radius: 1.6, height: 0.9 },
];

/** Fallback height for an obstacle that does not declare one. */
export const DEFAULT_OBSTACLE_HEIGHT = 2.5;

/** Lowest the third-person camera may ever sit above the plaza floor. */
export const CAMERA_MIN_HEIGHT = 0.8;

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

/** Squared distance from a point to a segment, all in the XZ plane. */
function distanceToSegmentSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq < 1e-12) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  let t = ((px - ax) * abx + (pz - az) * abz) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return dx * dx + dz * dz;
}

/** Slab test: does the segment A→B cross this axis aligned box in XZ? */
function segmentHitsBox(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  box: BoxObstacle,
): boolean {
  const minX = box.x - box.halfX;
  const maxX = box.x + box.halfX;
  const minZ = box.z - box.halfZ;
  const maxZ = box.z + box.halfZ;

  let enter = 0;
  let exit = 1;

  const clip = (origin: number, delta: number, min: number, max: number): boolean => {
    if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
    const near = (min - origin) / delta;
    const far = (max - origin) / delta;
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    if (lo > enter) enter = lo;
    if (hi < exit) exit = hi;
    return enter <= exit;
  };

  if (!clip(ax, bx - ax, minX, maxX)) return false;
  return clip(az, bz - az, minZ, maxZ);
}

/**
 * Whether the straight line between two points is broken by something tall.
 *
 * Used to hide a name tag whose owner is behind a building. This is an analytic
 * test against the obstacle list rather than a scene raycast: it costs a handful
 * of arithmetic operations per player, needs no access to the render graph, and
 * reuses the very geometry that already decides where a player may walk — so a
 * tag can never be visible through a wall the player could not have walked
 * through either.
 */
/**
 * How far the third-person camera may travel from the player before it would
 * end up inside something, as a fraction of the requested distance.
 *
 * The camera is swept as a ray from the avatar's head towards where the player
 * asked it to be, in three dimensions: unlike the avatar it can rise over a
 * planter, so a purely top-down test would yank it in for no reason. Returns
 * the free fraction of the ray in [0, 1]; 1 means nothing is in the way.
 *
 * Analytic for the same reasons as {@link isSightBlocked}, plus one more: this
 * runs inside the render loop, and a scene raycast there is a per-frame walk of
 * the whole graph.
 */
export function sweepCameraFraction(
  originX: number,
  originY: number,
  originZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  padding = 0.35,
): number {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const dz = targetZ - originZ;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 1e-6) return 1;

  let earliest = 1;

  for (const obstacle of HUB_OBSTACLES) {
    const height = obstacle.height ?? DEFAULT_OBSTACLE_HEIGHT;
    // Vertical extent first: both ends above the roof can never hit it.
    if (originY > height + padding && targetY > height + padding) continue;

    let enter = 0;
    let exit = 1;

    const clip = (origin: number, delta: number, min: number, max: number): boolean => {
      if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
      const near = (min - origin) / delta;
      const far = (max - origin) / delta;
      const lo = Math.min(near, far);
      const hi = Math.max(near, far);
      if (lo > enter) enter = lo;
      if (hi < exit) exit = hi;
      return enter <= exit;
    };

    if (!clip(originY, dy, -padding, height + padding)) continue;

    if (obstacle.kind === 'box') {
      if (!clip(originX, dx, obstacle.x - obstacle.halfX - padding, obstacle.x + obstacle.halfX + padding)) {
        continue;
      }
      if (!clip(originZ, dz, obstacle.z - obstacle.halfZ - padding, obstacle.z + obstacle.halfZ + padding)) {
        continue;
      }
    } else {
      // Ray against an infinite vertical cylinder, then intersected with the
      // height slab already clipped above.
      const radius = obstacle.radius + padding;
      const ox = originX - obstacle.x;
      const oz = originZ - obstacle.z;
      const a = dx * dx + dz * dz;
      const b = 2 * (ox * dx + oz * dz);
      const c = ox * ox + oz * oz - radius * radius;

      if (a < 1e-9) {
        // Straight up or down: inside the circle for the whole segment or never.
        if (c > 0) continue;
      } else {
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) continue;
        const root = Math.sqrt(discriminant);
        const lo = (-b - root) / (2 * a);
        const hi = (-b + root) / (2 * a);
        if (lo > enter) enter = lo;
        if (hi < exit) exit = hi;
        if (enter > exit) continue;
      }
    }

    if (exit < 0 || enter > 1) continue;
    // An origin already inside the obstacle yields enter <= 0; pulling the
    // camera all the way onto the player is the right answer there.
    if (enter < earliest) earliest = Math.max(0, enter);
  }

  return earliest;
}

export function isSightBlocked(ax: number, az: number, bx: number, bz: number): boolean {
  for (const obstacle of HUB_OBSTACLES) {
    if (!obstacle.occludes) continue;
    if (obstacle.kind === 'circle') {
      if (distanceToSegmentSq(obstacle.x, obstacle.z, ax, az, bx, bz) < obstacle.radius ** 2) {
        return true;
      }
      continue;
    }
    if (segmentHitsBox(ax, az, bx, bz, obstacle)) return true;
  }
  return false;
}
