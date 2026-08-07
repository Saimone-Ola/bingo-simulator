import { describe, expect, it } from 'vitest';
import {
  HALL_BOUNDS,
  HALL_COLLIDERS,
  PLAYER_RADIUS,
  SEATS,
  STAGE,
  TABLES,
  TABLE_ISLAND_RADIUS,
  standingSpotForSeat,
  type Collider,
} from '../hallLayout';
import {
  SPRINT_SPEED,
  WALK_SPEED,
  createMovementState,
  createPoseLatch,
  resolveCollider,
  resolveCollisions,
  shortestAngle,
  stepMovement,
} from '../movement';

function walk(
  state: ReturnType<typeof createMovementState>,
  input: { forward: number; strafe: number; yaw: number; sprint?: boolean },
  seconds: number,
  colliders: readonly Collider[] = HALL_COLLIDERS,
): void {
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    stepMovement(state, { sprint: false, ...input }, step, colliders);
  }
}

describe('resolveCollider', () => {
  it('pushes a player out of a round table without teleporting them across it', () => {
    const table: Collider = { kind: 'circle', x: 0, z: 0, radius: 1.4 };
    const resolved = resolveCollider(0.4, 0.2, PLAYER_RADIUS, table);
    const distance = Math.hypot(resolved.x, resolved.z);
    expect(distance).toBeCloseTo(1.4 + PLAYER_RADIUS, 6);
    // Same side of the table as where they came from.
    expect(resolved.x).toBeGreaterThan(0);
    expect(resolved.z).toBeGreaterThan(0);
  });

  it('leaves a player alone when they are clear of the obstacle', () => {
    const table: Collider = { kind: 'circle', x: 0, z: 0, radius: 1.4 };
    expect(resolveCollider(5, 5, PLAYER_RADIUS, table)).toEqual({ x: 5, z: 5 });
  });

  it('resolves a degenerate dead centre hit deterministically', () => {
    const table: Collider = { kind: 'circle', x: 2, z: 3, radius: 1 };
    const first = resolveCollider(2, 3, PLAYER_RADIUS, table);
    const second = resolveCollider(2, 3, PLAYER_RADIUS, table);
    expect(first).toEqual(second);
    expect(Math.hypot(first.x - 2, first.z - 3)).toBeCloseTo(1 + PLAYER_RADIUS, 6);
  });

  it('pushes out of a box along the shallowest axis', () => {
    const box: Collider = { kind: 'box', minX: -2, maxX: 2, minZ: -1, maxZ: 1 };
    // Just inside the front face: should be pushed forward, not sideways.
    const resolved = resolveCollider(0, 0.9, PLAYER_RADIUS, box);
    expect(resolved.x).toBe(0);
    expect(resolved.z).toBeCloseTo(1 + PLAYER_RADIUS, 6);
  });
});

describe('resolveCollisions', () => {
  it('never lets a player leave the hall', () => {
    for (const [x, z] of [
      [999, 0],
      [-999, 0],
      [0, 999],
      [0, -999],
    ] as const) {
      const resolved = resolveCollisions(x, z, HALL_COLLIDERS);
      expect(resolved.x).toBeGreaterThanOrEqual(HALL_BOUNDS.minX + PLAYER_RADIUS - 1e-6);
      expect(resolved.x).toBeLessThanOrEqual(HALL_BOUNDS.maxX - PLAYER_RADIUS + 1e-6);
      expect(resolved.z).toBeGreaterThanOrEqual(HALL_BOUNDS.minZ + PLAYER_RADIUS - 1e-6);
      expect(resolved.z).toBeLessThanOrEqual(HALL_BOUNDS.maxZ - PLAYER_RADIUS + 1e-6);
    }
  });

  it('never leaves the player standing inside a table', () => {
    for (const table of TABLES) {
      const resolved = resolveCollisions(table.x, table.z, HALL_COLLIDERS);
      expect(Math.hypot(resolved.x - table.x, resolved.z - table.z)).toBeGreaterThan(
        table.radius,
      );
    }
  });

  it('pushes the player clear of the whole table island, chairs included', () => {
    for (const seat of SEATS.slice(0, 8)) {
      const table = TABLES[seat.tableIndex];
      expect(table).toBeDefined();
      if (!table) continue;
      const resolved = resolveCollisions(seat.x, seat.z, HALL_COLLIDERS);
      expect(Math.hypot(resolved.x - table.x, resolved.z - table.z)).toBeGreaterThanOrEqual(
        TABLE_ISLAND_RADIUS - 1e-6,
      );
    }
  });

  it('resolves a table hit outwards, never onto the table top', () => {
    // Regression guard: with a collider per chair, being pushed off a table
    // landed the player inside a chair, which pushed them straight back on.
    for (const table of TABLES) {
      for (const angle of [0, 1, 2, 3, 4, 5]) {
        const x = table.x + Math.cos(angle) * 0.4;
        const z = table.z + Math.sin(angle) * 0.4;
        const resolved = resolveCollisions(x, z, HALL_COLLIDERS);
        expect(Math.hypot(resolved.x - table.x, resolved.z - table.z)).toBeGreaterThan(
          table.radius,
        );
      }
    }
  });

  it('leaves the standing spot of every seat walkable', () => {
    for (const seat of SEATS) {
      const spot = standingSpotForSeat(seat);
      const resolved = resolveCollisions(spot.x, spot.z, HALL_COLLIDERS);
      expect(Math.hypot(resolved.x - spot.x, resolved.z - spot.z)).toBeLessThan(0.02);
    }
  });
});

describe('stepMovement', () => {
  it('walks forward along -Z at yaw 0', () => {
    const state = createMovementState(0, 8);
    walk(state, { forward: 1, strafe: 0, yaw: 0 }, 0.5, []);
    expect(state.z).toBeLessThan(8);
    expect(Math.abs(state.x)).toBeLessThan(1e-6);
  });

  it('strafes to the right along +X at yaw 0', () => {
    const state = createMovementState(0, 8);
    walk(state, { forward: 0, strafe: 1, yaw: 0 }, 0.5, []);
    expect(state.x).toBeGreaterThan(0);
  });

  it('respects the camera yaw when converting input to world motion', () => {
    const state = createMovementState(0, 0);
    // Yaw of PI looks along +Z, so "forward" must now increase Z.
    walk(state, { forward: 1, strafe: 0, yaw: Math.PI }, 0.5, []);
    expect(state.z).toBeGreaterThan(0);
  });

  it('accelerates towards the walk speed rather than snapping to it', () => {
    const state = createMovementState(0, 0);
    stepMovement(state, { forward: 1, strafe: 0, yaw: 0, sprint: false }, 1 / 60, []);
    const initial = Math.hypot(state.velocityX, state.velocityZ);
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThan(WALK_SPEED * 0.5);

    walk(state, { forward: 1, strafe: 0, yaw: 0 }, 2, []);
    expect(Math.hypot(state.velocityX, state.velocityZ)).toBeCloseTo(WALK_SPEED, 1);
  });

  it('decelerates to a full stop when input is released', () => {
    const state = createMovementState(0, 0);
    walk(state, { forward: 1, strafe: 0, yaw: 0 }, 1, []);
    walk(state, { forward: 0, strafe: 0, yaw: 0 }, 2, []);
    expect(state.velocityX).toBe(0);
    expect(state.velocityZ).toBe(0);
  });

  it('walks faster while sprinting, but not by a silly amount', () => {
    const state = createMovementState(0, 0);
    for (let index = 0; index < 240; index += 1) {
      stepMovement(state, { forward: 1, strafe: 0, yaw: 0, sprint: true }, 1 / 60, []);
    }
    const speed = Math.hypot(state.velocityX, state.velocityZ);
    expect(speed).toBeCloseTo(SPRINT_SPEED, 1);
    expect(SPRINT_SPEED / WALK_SPEED).toBeLessThan(2);
  });

  it('normalises diagonal input so strafing is not faster than walking', () => {
    const straight = createMovementState(0, 0);
    const diagonal = createMovementState(0, 0);
    walk(straight, { forward: 1, strafe: 0, yaw: 0 }, 2, []);
    walk(diagonal, { forward: 1, strafe: 1, yaw: 0 }, 2, []);
    expect(Math.hypot(diagonal.velocityX, diagonal.velocityZ)).toBeCloseTo(
      Math.hypot(straight.velocityX, straight.velocityZ),
      2,
    );
  });

  it('stops the player at the table instead of walking through it', () => {
    const table = TABLES[4];
    expect(table).toBeDefined();
    if (!table) return;
    const state = createMovementState(table.x, table.z + 4);
    walk(state, { forward: 1, strafe: 0, yaw: 0 }, 6);
    expect(Math.hypot(state.x - table.x, state.z - table.z)).toBeGreaterThan(table.radius);
    // Still on the near side: the table was not crossed.
    expect(state.z).toBeGreaterThan(table.z);
  });

  it('stops the player at the stage instead of walking onto it', () => {
    const state = createMovementState(0, 0);
    walk(state, { forward: 1, strafe: 0, yaw: 0 }, 12);
    expect(state.z).toBeGreaterThan(STAGE.maxZ);
  });

  it('keeps the player inside the hall after a long run at a wall', () => {
    const state = createMovementState(0, 0);
    walk(state, { forward: 0, strafe: 1, yaw: 0 }, 20);
    expect(state.x).toBeLessThanOrEqual(HALL_BOUNDS.maxX - PLAYER_RADIUS + 1e-6);
  });

  it('records travelled distance for footsteps and head bob', () => {
    const state = createMovementState(0, 8);
    walk(state, { forward: 1, strafe: 0, yaw: 0 }, 1, []);
    expect(state.travelled).toBeGreaterThan(0.5);
  });

  it('ignores absurd frame times instead of teleporting the player', () => {
    const state = createMovementState(0, 8);
    stepMovement(state, { forward: 1, strafe: 0, yaw: 0, sprint: false }, 30, []);
    expect(Math.abs(state.z - 8)).toBeLessThan(1);
  });
});

describe('shortestAngle', () => {
  it('turns the short way around the circle', () => {
    expect(shortestAngle(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 6);
    expect(shortestAngle(Math.PI * 2 - 0.1, 0.1)).toBeCloseTo(0.2, 6);
  });
});

describe('sitting down and standing up', () => {
  /**
   * The bug this exists for: you sat down, pressed the key to get up, and were
   * dragged back beside the chair. The seat arrives rebuilt on every room
   * snapshot, so anything keyed on its identity fires several times a second.
   */
  it('moves the body once per transition, however often the snapshot arrives', () => {
    const latch = createPoseLatch();
    expect(latch.shouldApply('t0s0', 'SEATED')).toBe(true);
    // Twenty more snapshots, same seat, same stance: nothing to do.
    for (let patch = 0; patch < 20; patch += 1) {
      expect(latch.shouldApply('t0s0', 'SEATED'), `patch ${patch}`).toBe(false);
    }
  });

  it('fires again when the player actually stands up', () => {
    const latch = createPoseLatch();
    latch.shouldApply('t0s0', 'SEATED');
    expect(latch.shouldApply('t0s0', 'STANDING')).toBe(true);
    // And then leaves them alone, so they can walk away from the table.
    for (let patch = 0; patch < 20; patch += 1) {
      expect(latch.shouldApply('t0s0', 'STANDING'), `patch ${patch}`).toBe(false);
    }
  });

  it('fires when the player changes chair', () => {
    const latch = createPoseLatch();
    latch.shouldApply('t0s0', 'SEATED');
    expect(latch.shouldApply('t3s5', 'SEATED')).toBe(true);
  });

  it('treats having no seat as a state of its own', () => {
    const latch = createPoseLatch();
    expect(latch.shouldApply(null, 'STANDING')).toBe(true);
    expect(latch.shouldApply(null, 'STANDING')).toBe(false);
    expect(latch.shouldApply('t0s0', 'SEATED')).toBe(true);
    // Standing up releases the seat, so the id goes away with the stance.
    expect(latch.shouldApply(null, 'STANDING')).toBe(true);
  });
});
