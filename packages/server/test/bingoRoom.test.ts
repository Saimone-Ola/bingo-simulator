import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import type { Server as ColyseusServer } from 'colyseus';
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_SERVER_MESSAGES,
  ROOM_NAMES,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
} from '@bingo/shared';
import { hasTestDatabase } from './setup';
import { closeDatabase, db } from '../src/db/client';
import { avatars, users } from '../src/db/schema';
import { ensureWallet, getWalletState, postLedgerEntry } from '../src/services/ledger';
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
    await postLedgerEntry(tx, { userId, amount: 100, reason: 'welcome_bonus' });
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

  it('shows decorative guests without counting them as round competitors', async () => {
    const { room, client, snapshots } = await connect('Solo');
    const latest = snapshots.at(-1)!;
    expect(latest.seating.filter((row) => row.kind === 'NPC').length).toBeGreaterThan(0);
    expect(latest.players.filter((player) => player.participation === 'PARTICIPANT')).toHaveLength(0);
    expect(latest.startBlockedReason).toBe('minimum_players');
    expect(latest.config.training).toBe(false);

    await client.leave();
    await room.disconnect();
  });

  it('plays a shared round over two real connections with one debit, matching draws and tied paid results', async () => {
    const room = await colyseus.createRoom(ROOM_NAMES.bingo);
    const [alice, bruno] = await Promise.all([createPlayer('RoundAlice'), createPlayer('RoundBruno')]);
    const first = await colyseus.connectTo(room, { accessToken: alice.token });
    const second = await colyseus.connectTo(room, { accessToken: bruno.token });
    const snapshots: BingoSnapshotPayload[][] = [[], []];
    const winners: BingoWinnerPayload[][] = [[], []];
    for (const [index, client] of [first, second].entries()) {
      client.onMessage(BINGO_SERVER_MESSAGES.snapshot, (message: BingoSnapshotPayload) => snapshots[index]!.push(message));
      client.onMessage(BINGO_SERVER_MESSAGES.winner, (message: BingoWinnerPayload) => winners[index]!.push(message));
      client.onMessage(BINGO_SERVER_MESSAGES.purchaseConfirmed, () => undefined);
      client.onMessage(BINGO_SERVER_MESSAGES.ballCalled, () => undefined);
      client.onMessage(BINGO_SERVER_MESSAGES.actionRejected, () => undefined);
      client.onMessage(BINGO_SERVER_MESSAGES.seating, () => undefined);
    }
    const until = async (predicate: () => boolean) => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (predicate()) return;
        await wait(50);
      }
      throw new Error('Timed out waiting for Bingo round condition');
    };
    const roundId = (room as unknown as { roundId: string }).roundId;
    first.send(BINGO_CLIENT_MESSAGES.purchaseCards, { roundId, quantity: 1, markingMode: 'MANUAL', requestId: 'alice-purchase' });
    second.send(BINGO_CLIENT_MESSAGES.purchaseCards, { roundId, quantity: 6, markingMode: 'AUTOMATIC', requestId: 'bruno-purchase' });
    await until(() => snapshots[0]!.at(-1)?.myCards.length === 1 && snapshots[1]!.at(-1)?.myCards.length === 6);
    const initial = snapshots[0]!.at(-1)!;
    console.info('Bingo integration snapshot measurement', JSON.stringify({
      scenario: 'two real Colyseus connections, 1 manual card and 6 automatic cards, decorative crowd',
      runtime: process.version, platform: process.platform,
      peers: initial.players.filter((player) => !player.isNpc && player.connected).length,
      decorativeNpcs: initial.seating.filter((seat) => seat.kind === 'NPC').length,
      manualSnapshotBytes: Buffer.byteLength(JSON.stringify(initial), 'utf8'),
      automaticSnapshotBytes: Buffer.byteLength(JSON.stringify(snapshots[1]!.at(-1)), 'utf8'),
    }));
    first.send(BINGO_CLIENT_MESSAGES.purchaseCards, { roundId: initial.roundId, quantity: 1, markingMode: 'MANUAL', requestId: 'alice-purchase' });
    await wait(200);
    expect((await getWalletState(db, alice.userId)).balance).toBe(90);
    expect(new Set(snapshots[1]!.at(-1)!.myCards.flatMap((card) => card.cells.filter((n) => n !== null))).size).toBe(90);
    first.send(BINGO_CLIENT_MESSAGES.setReady, { ready: true }); second.send(BINGO_CLIENT_MESSAGES.setReady, { ready: true });
    await until(() => snapshots[0]!.at(-1)?.phase === 'COUNTDOWN');
    // Advance the authoritative scheduler, never inject state from either client.
    const control = room as unknown as { countdownEndsAt: number; tick(): void; drawNumber(): void; claimWindow: { closesAt: number }; settleClaimWindow(): Promise<void> };
    control.countdownEndsAt = Date.now() - 1; control.tick();
    await until(() => snapshots[0]!.at(-1)?.phase === 'PLAYING');
    for (let draw = 0; draw < 90; draw += 1) control.drawNumber();
    await until(() => snapshots[0]!.at(-1)?.drawnNumbers.length === 90 && snapshots[1]!.at(-1)?.drawnNumbers.length === 90);
    expect(snapshots[0]!.at(-1)!.drawnNumbers).toEqual(snapshots[1]!.at(-1)!.drawnNumbers);
    expect(snapshots[0]!.at(-1)!.myCards[0]!.markedIndices).toEqual([]);
    expect(snapshots[1]!.at(-1)!.myCards.every((card) => card.markedIndices.length === 15)).toBe(true);
    for (const client of [first, second]) client.send(BINGO_CLIENT_MESSAGES.claim, { round: initial.round, roundId: initial.roundId, tier: 'BINGO', cardIndex: 0, requestId: 'bingo-tied-claim' });
    await until(() => snapshots[0]!.at(-1)?.claimWindow !== null && snapshots[0]!.at(-1)?.claimWindow !== undefined);
    await wait(150); control.claimWindow.closesAt = Date.now() - 1; await control.settleClaimWindow();
    await until(() => winners.every((list) => list.length === 2));
    // Winner messages precede the final snapshot; wait for both wire deliveries.
    await until(() => snapshots.every((list) => {
      const snapshot = list.at(-1);
      return snapshot?.phase === 'RESULTS' && snapshot.results.length === 2 && snapshot.results.every((result) => result.status === 'PAID');
    }));
    expect(winners[0]).toEqual(winners[1]);
    expect(winners[0]!.reduce((sum, winner) => sum + winner.prizeCredits, 0)).toBe(initial.prizePool.perTier.BINGO);
    expect(snapshots[0]!.at(-1)?.phase).toBe('RESULTS');
    expect(snapshots[0]!.at(-1)?.results.every((result) => result.status === 'PAID')).toBe(true);
    await first.leave(); await second.leave(); await room.disconnect();
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
