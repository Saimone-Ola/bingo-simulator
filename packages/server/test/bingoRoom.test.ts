import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Server as ColyseusServer } from 'colyseus';
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_SERVER_MESSAGES,
  ROOM_NAMES,
  type BingoSnapshotPayload,
} from '@bingo/shared';
import { hasTestDatabase } from './setup';
import { closeDatabase, db } from '../src/db/client';
import { avatars, users } from '../src/db/schema';
import { ensureWallet } from '../src/services/ledger';
import { signAccessToken } from '../src/auth/tokens';
import { BingoRoom } from '../src/realtime/bingoRoom';

/**
 * Bingo room integration tests.
 *
 * The room had none, and it is where the two worst regressions of this branch
 * lived: a hall that never seated its guests, and a seat claim the person who
 * made it never heard about. Both are properties of the round trip, so they can
 * only be caught by driving a real client against a real room.
 *
 * Requires a database (TEST_DATABASE_URL): the room authenticates real users.
 */
const suite = hasTestDatabase ? describe : describe.skip;

const TEST_PORT = 2569;

async function createPlayer(label: string): Promise<{ userId: string; token: string }> {
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: `bingo-${userId}@test.local`,
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

suite('bingo room seating', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    const config = {
      initializeGameServer: (gameServer: ColyseusServer) => {
        gameServer.define(ROOM_NAMES.bingo, BingoRoom);
      },
    } as unknown as Parameters<typeof boot>[0];
    colyseus = await boot(config, TEST_PORT);
  });

  afterAll(async () => {
    await colyseus.shutdown();
    await closeDatabase();
  });

  /** Connects a client and returns the snapshots it receives, newest last. */
  async function connect(label: string) {
    const room = await colyseus.createRoom(ROOM_NAMES.bingo);
    const player = await createPlayer(label);
    const client = await colyseus.connectTo(room, { accessToken: player.token });
    const snapshots: BingoSnapshotPayload[] = [];
    client.onMessage(BINGO_SERVER_MESSAGES.snapshot, (message) => snapshots.push(message));
    await room.waitForNextPatch();
    await wait(250);
    return { room, client, player, snapshots };
  }

  it('fills the hall with guests as soon as the first player walks in', async () => {
    // seatNpcs used to run only on reconnect, so the first person into a fresh
    // room found 512 empty chairs and a hall that looked broken.
    const { room, client, snapshots } = await connect('Primo');
    const latest = snapshots.at(-1);

    expect(latest, 'no snapshot arrived').toBeDefined();
    expect(latest!.seating.filter((row) => row.kind === 'NPC').length).toBeGreaterThan(0);

    await client.leave();
    await room.disconnect();
  });

  it('lets a lone host reach the minimum player count', async () => {
    // Once "enough players" started counting seated guests rather than a
    // configured number, an unpopulated hall meant a solo host could never
    // start a round at all.
    const { room, client, snapshots } = await connect('Solo');
    const latest = snapshots.at(-1)!;
    const present =
      latest.players.length + latest.seating.filter((row) => row.kind === 'NPC').length;

    expect(present).toBeGreaterThanOrEqual(latest.config.minPlayers);

    await client.leave();
    await room.disconnect();
  });

  it('tells the player who sat down that they are sitting', async () => {
    // The claim was broadcast as a seating chart and nothing else. mySeatId
    // lives in the snapshot, and the client reads its own posture from it — so
    // everyone else watched you sit while you stayed standing in your own view.
    const { room, client, snapshots } = await connect('Seduto');
    const before = snapshots.at(-1)!;
    expect(before.mySeatId).toBeNull();

    const free = before.seating.map((row) => row.seatId);
    const target = ['t0s0', 't0s1', 't0s2', 't1s0'].find((id) => !free.includes(id))!;

    client.send(BINGO_CLIENT_MESSAGES.takeSeat, { seatId: target });
    await wait(400);

    expect(snapshots.at(-1)!.mySeatId).toBe(target);

    client.send(BINGO_CLIENT_MESSAGES.leaveSeat, {});
    await wait(400);
    expect(snapshots.at(-1)!.mySeatId).toBeNull();

    await client.leave();
    await room.disconnect();
  });

  it('seats one of two clients racing for the same chair and refuses the other', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.bingo);
    const [alice, bruno] = await Promise.all([createPlayer('Alice'), createPlayer('Bruno')]);
    const first = await colyseus.connectTo(room, { accessToken: alice.token });
    const second = await colyseus.connectTo(room, { accessToken: bruno.token });
    await room.waitForNextPatch();
    await wait(250);

    const charts: BingoSnapshotPayload[] = [];
    const seats = [first, second].map((client) => {
      const taken: (string | null)[] = [];
      client.onMessage(BINGO_SERVER_MESSAGES.snapshot, (message: BingoSnapshotPayload) => {
        charts.push(message);
        taken.push(message.mySeatId);
      });
      return taken;
    });

    const rejected: string[] = [];
    for (const client of [first, second]) {
      client.onMessage(BINGO_SERVER_MESSAGES.seatRejected, (message: { reason: string }) =>
        rejected.push(message.reason),
      );
    }

    first.send(BINGO_CLIENT_MESSAGES.takeSeat, { seatId: 'probe' });
    await wait(300);
    // Taken from the chart rather than guessed: the guests fill from the back
    // of the hall, so the far corner is the *first* chair to go, not the last.
    const occupied = new Set(charts.at(-1)?.seating.map((row) => row.seatId) ?? []);
    const target = [...Array(64).keys()]
      .flatMap((table) => [...Array(8).keys()].map((seat) => `t${table}s${seat}`))
      .find((id) => !occupied.has(id));
    expect(target, 'the hall left no free chair to race for').toBeDefined();

    first.send(BINGO_CLIENT_MESSAGES.takeSeat, { seatId: target! });
    second.send(BINGO_CLIENT_MESSAGES.takeSeat, { seatId: target! });
    await wait(600);

    // Exactly one of them is sitting in it, and the loser was told why.
    const winners = seats.filter((taken) => taken.at(-1) === target);
    expect(winners).toHaveLength(1);
    expect(rejected).toContain('seat_taken');

    await first.leave();
    await second.leave();
    await room.disconnect();
  });
});
