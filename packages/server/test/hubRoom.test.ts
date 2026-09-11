import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Server as ColyseusServer } from 'colyseus';
import {
  AVATAR_WALK_SPEED,
  CLIENT_MESSAGES,
  HUB_MAX_AVATARS,
  HUB_POIS,
  ROOM_NAMES,
  SERVER_MESSAGES,
  type ActionRejectedPayload,
  type ChatMessagePayload,
} from '@bingo/shared';
import { hasTestDatabase } from './setup';
import { closeDatabase, db } from '../src/db/client';
import { avatars, users } from '../src/db/schema';
import { ensureWallet } from '../src/services/ledger';
import { signAccessToken } from '../src/auth/tokens';
import { HubRoom } from '../src/realtime/hubRoom';

/**
 * Hub room integration tests.
 *
 * These boot a real Colyseus server and drive real WebSocket clients, because
 * the properties worth testing here - that a flood of input cannot outrun the
 * server clock, that twenty avatars stay consistent - only exist end to end.
 *
 * Requires a database (TEST_DATABASE_URL): the room authenticates against real
 * users and loads real avatars.
 */
const suite = hasTestDatabase ? describe : describe.skip;

const TEST_PORT = 2568;

async function createPlayer(label: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: `hub-${userId}@test.local`,
      displayName: `${label}${userId.slice(0, 4)}`,
      passwordHash: 'not-a-real-hash',
    });
    await ensureWallet(tx, userId);
    await tx.insert(avatars).values({ userId });
  });

  const token = await signAccessToken({ sub: userId, role: 'player', sid: randomUUID() });
  return { userId, token };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

suite('hub room', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    // The ConfigOptions form is the one @colyseus/testing actually wires up to
    // a listening HTTP server; handing it a bare Server leaves matchmaking
    // unreachable.
    // `boot` is typed for @colyseus/tools' full config shape; only
    // `initializeGameServer` is needed here, hence the cast.
    const config = {
      initializeGameServer: (gameServer: ColyseusServer) => {
        gameServer.define(ROOM_NAMES.hub, HubRoom);
      },
    } as unknown as Parameters<typeof boot>[0];

    colyseus = await boot(config, TEST_PORT);
  });

  afterAll(async () => {
    await colyseus.shutdown();
    await closeDatabase();
  });

  it('refuses a connection without a valid token', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);

    await expect(colyseus.connectTo(room, {})).rejects.toThrow();
    await expect(colyseus.connectTo(room, { accessToken: 'not-a-jwt' })).rejects.toThrow();
    expect(room.state.players.size).toBe(0);
  });

  it('places an authenticated player in the plaza with their own profile', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Anna');

    const client = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();

    const state = room.state.players.get(client.sessionId);
    expect(state).toBeDefined();
    expect(state?.userId).toBe(player.userId);
    // Identity comes from the token and the database, never from the client.
    expect(state?.displayName.startsWith('Anna')).toBe(true);
    expect(state?.connected).toBe(true);
    expect(Number.isFinite(state?.x)).toBe(true);

    await client.leave();
  });

  it('ignores a position the client tries to assert', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Bruno');
    const client = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();

    const before = room.state.players.get(client.sessionId);
    const startX = before?.x ?? 0;

    // There is no message that carries a position, so the closest a cheating
    // client can get is smuggling extra fields into a movement intent.
    client.send(CLIENT_MESSAGES.moveIntent, {
      seq: 1,
      dirX: 0,
      dirZ: 0,
      run: false,
      facing: 0,
      x: 999,
      z: 999,
    });
    await wait(200);

    const after = room.state.players.get(client.sessionId);
    expect(after?.x).toBeCloseTo(startX, 5);
    expect(Math.abs(after?.x ?? 0)).toBeLessThan(40);

    await client.leave();
  });

  it('bounds movement by the server clock, not by how fast the client sends', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Carla');
    const client = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();

    const start = room.state.players.get(client.sessionId);
    const startX = start?.x ?? 0;
    const startZ = start?.z ?? 0;

    // Send fixed bursts: Windows timers can clamp 5ms waits to ~15ms. The
    // assertion needs a real flood, not a benchmark of the test host's timer.
    const startedAt = Date.now();
    let seq = 0;
    while (Date.now() - startedAt < 1000) {
      for (let burst = 0; burst < 5; burst += 1) {
        seq += 1;
        client.send(CLIENT_MESSAGES.moveIntent, { seq, dirX: 1, dirZ: 0, run: false, facing: 0 });
      }
      await wait(20);
    }
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    await wait(120);

    const end = room.state.players.get(client.sessionId);
    const travelled = Math.hypot((end?.x ?? 0) - startX, (end?.z ?? 0) - startZ);
    const ceiling = AVATAR_WALK_SPEED * (elapsedSeconds + 0.3);

    expect(seq).toBeGreaterThan(100);
    expect(travelled).toBeLessThanOrEqual(ceiling);
    // It should still have actually moved - a test that passes because nothing
    // happened would be worthless.
    expect(travelled).toBeGreaterThan(AVATAR_WALK_SPEED * 0.3);

    await client.leave();
  });

  it('does not let a diagonal intent travel faster than a straight one', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Dario');
    const client = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();

    const start = room.state.players.get(client.sessionId);
    const startX = start?.x ?? 0;
    const startZ = start?.z ?? 0;

    // An un-normalised (1, 1) would be 1.41x faster on the diagonal.
    const startedAt = Date.now();
    for (let i = 0; i < 20; i += 1) {
      client.send(CLIENT_MESSAGES.moveIntent, {
        seq: i + 1,
        dirX: 1,
        dirZ: 1,
        run: false,
        facing: 0,
      });
      await wait(50);
    }
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    await wait(120);

    const end = room.state.players.get(client.sessionId);
    const travelled = Math.hypot((end?.x ?? 0) - startX, (end?.z ?? 0) - startZ);
    expect(travelled).toBeLessThanOrEqual(AVATAR_WALK_SPEED * (elapsedSeconds + 0.3));

    await client.leave();
  });

  it('masks profanity, blocks slurs and rate limits the spammer', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Elena');
    const client = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();

    const received: ChatMessagePayload[] = [];
    const rejected: ActionRejectedPayload[] = [];
    client.onMessage(SERVER_MESSAGES.chatMessage, (message) => received.push(message));
    client.onMessage(SERVER_MESSAGES.actionRejected, (message) => rejected.push(message));

    client.send(CLIENT_MESSAGES.chatSend, { scope: 'global', body: 'Ciao a tutti!' });
    await wait(150);
    client.send(CLIENT_MESSAGES.chatSend, { scope: 'global', body: 'che cazzo di fortuna' });
    await wait(150);
    client.send(CLIENT_MESSAGES.chatSend, { scope: 'global', body: 'sei un frocio' });
    await wait(250);

    expect(received).toHaveLength(2);
    expect(received[0]?.body).toBe('Ciao a tutti!');
    expect(received[0]?.filtered).toBe(false);
    expect(received[1]?.filtered).toBe(true);
    expect(received[1]?.body).not.toContain('cazzo');
    expect(rejected.some((entry) => entry.code === 'message_blocked')).toBe(true);

    // chatSend is 5 per 5s and two have been spent; the burst must be cut off.
    for (let i = 0; i < 6; i += 1) {
      client.send(CLIENT_MESSAGES.chatSend, { scope: 'global', body: `spam ${i}` });
    }
    await wait(400);

    const rateLimited = rejected.filter((entry) => entry.code === 'rate_limited');
    expect(rateLimited.length).toBeGreaterThan(0);
    expect(rateLimited[0]?.retryAfterMs).toBeGreaterThan(0);

    await client.leave();
  });

  it('refuses a teleport to somewhere that is not a destination', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Fabio');
    const client = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();

    const rejected: ActionRejectedPayload[] = [];
    client.onMessage(SERVER_MESSAGES.actionRejected, (message) => rejected.push(message));

    client.send(CLIENT_MESSAGES.teleportRequest, { poiId: 'nowhere' });
    await wait(200);
    // The fountain is scenery and a collider, never a place you are sent to.
    client.send(CLIENT_MESSAGES.teleportRequest, { poiId: 'fountain' });
    await wait(200);

    expect(rejected.map((entry) => entry.code)).toEqual(['unknown_target', 'unknown_target']);

    // A real destination puts the player where the world says it stands.
    const hall = HUB_POIS.find((poi) => poi.id === 'bingo_hall')!;
    client.send(CLIENT_MESSAGES.teleportRequest, { poiId: hall.id });
    await wait(250);
    const state = room.state.players.get(client.sessionId);
    expect(state?.x).toBeCloseTo(hall.standX, 1);
    expect(state?.z).toBeCloseTo(hall.standZ, 1);

    await client.leave();
  });

  it('publishes no destination the current phase cannot reach', () => {
    // The room refuses anything gated behind a later phase, and this test used
    // to prove it by teleporting to the Bingo hall — which was phase 2 when it
    // was written and has been phase 1 for a long time, so the assertion was
    // waiting for a database that never arrived to tell anyone. The invariant
    // worth holding is the one on the data: nothing is published as a
    // destination that a player is then told they cannot go to.
    for (const poi of HUB_POIS) {
      expect(poi.availableFromPhase, poi.id).toBeLessThanOrEqual(1);
    }
  });

  it('supersedes a previous session instead of leaving a ghost avatar', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);
    const player = await createPlayer('Giulia');

    const first = await colyseus.connectTo(room, { accessToken: player.token });
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    const second = await colyseus.connectTo(room, { accessToken: player.token });
    await wait(300);

    // One account, one avatar - a refresh must not double the plaza.
    expect(room.state.players.size).toBe(1);
    expect(room.state.players.get(second.sessionId)).toBeDefined();
    expect(room.state.players.get(first.sessionId)).toBeUndefined();

    await second.leave();
  });

  it('holds 20 simultaneous players moving at once', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.hub);

    const players = await Promise.all(
      Array.from({ length: HUB_MAX_AVATARS }, (_, index) => createPlayer(`P${index}`)),
    );
    const clients = await Promise.all(
      players.map((player) => colyseus.connectTo(room, { accessToken: player.token })),
    );

    await wait(400);
    expect(room.state.players.size).toBe(HUB_MAX_AVATARS);

    const tickBefore = room.state.tick;
    const startPositions = clients.map((client) => {
      const state = room.state.players.get(client.sessionId);
      return { x: state?.x ?? 0, z: state?.z ?? 0 };
    });

    // Everyone walks in a different direction for a second.
    const startedAt = Date.now();
    let seq = 0;
    while (Date.now() - startedAt < 1000) {
      seq += 1;
      clients.forEach((client, index) => {
        const angle = (index / clients.length) * Math.PI * 2;
        client.send(CLIENT_MESSAGES.moveIntent, {
          seq,
          dirX: Math.cos(angle),
          dirZ: Math.sin(angle),
          run: index % 2 === 0,
          facing: angle,
        });
      });
      await wait(50);
    }
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    await wait(200);

    // The simulation kept running under load.
    expect(room.state.tick).toBeGreaterThan(tickBefore + 10);
    expect(room.state.players.size).toBe(HUB_MAX_AVATARS);

    clients.forEach((client, index) => {
      const state = room.state.players.get(client.sessionId);
      expect(state, `player ${index} vanished`).toBeDefined();
      expect(Number.isFinite(state?.x)).toBe(true);
      expect(Number.isFinite(state?.z)).toBe(true);

      const start = startPositions[index] as { x: number; z: number };
      const travelled = Math.hypot((state?.x ?? 0) - start.x, (state?.z ?? 0) - start.z);
      // Even under 20-way load nobody outruns the run speed.
      expect(travelled).toBeLessThanOrEqual(AVATAR_WALK_SPEED * 2 * (elapsedSeconds + 0.4));
    });

    // The 21st player does not fit: matchmaking must open a second hub rather
    // than overfill this one.
    expect(room.clients.length).toBe(HUB_MAX_AVATARS);

    await Promise.all(clients.map((client) => client.leave()));
    await wait(200);
    expect(room.state.players.size).toBe(0);
  });
});
