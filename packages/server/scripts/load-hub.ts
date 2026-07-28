import { randomUUID } from 'node:crypto';
import { Client, type Room } from '@colyseus/sdk';
import { HUB_MAX_AVATARS } from '@bingo/shared';
import { closeDatabase, db } from '../src/db/client';
import { avatars, users } from '../src/db/schema';
import { ensureWallet } from '../src/services/ledger';
import { signAccessToken } from '../src/auth/tokens';

/**
 * Fills the hub with synthetic players so the client can be profiled against a
 * full room.
 *
 * Accounts are created straight in the database and their tokens signed
 * locally, deliberately bypassing `POST /api/auth/register` - that endpoint is
 * rate limited to ten calls a minute per IP, and it should stay that way.
 *
 *   pnpm --filter @bingo/server load:hub -- --bots 19
 *
 * Runs until interrupted. The accounts it leaves behind are disposable; point
 * it at a throwaway database.
 */
const WS_URL = process.env.LOAD_WS_URL ?? 'ws://127.0.0.1:2567';

function readBotCount(): number {
  const flagIndex = process.argv.indexOf('--bots');
  const raw = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  const parsed = Number(raw ?? HUB_MAX_AVATARS - 1);
  return Math.max(1, Math.min(parsed, HUB_MAX_AVATARS));
}

async function createBot(index: number): Promise<string> {
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: `loadbot-${userId}@test.local`,
      displayName: `Bot ${String(index).padStart(2, '0')}${userId.slice(0, 3)}`,
      passwordHash: 'not-a-real-hash',
    });
    await ensureWallet(tx, userId);
    await tx.insert(avatars).values({
      userId,
      // Spread the colours so the crowd is visually distinguishable.
      colorway: {
        shirt: ['#7c5cff', '#ffb020', '#2fbf71', '#e5484d', '#3ec9e0'][index % 5],
        pants: '#2a2750',
      },
      heightCm: 165 + (index % 5) * 5,
    });
  });

  return signAccessToken({ sub: userId, role: 'player', sid: randomUUID() });
}

async function main(): Promise<void> {
  const count = readBotCount();
  console.log(`Creating ${count} bots and connecting to ${WS_URL}…`);

  const rooms: Room[] = [];
  for (let index = 0; index < count; index += 1) {
    const token = await createBot(index);
    const client = new Client(WS_URL);
    const room = await client.joinOrCreate('hub', { accessToken: token });
    rooms.push(room);
    // Stagger the joins: twenty simultaneous handshakes tell us nothing about
    // steady-state rendering, which is what this script is for.
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  console.log(`${rooms.length} bots connected. Walking them in circles; Ctrl-C to stop.`);

  let seq = 0;
  const timer = setInterval(() => {
    seq += 1;
    rooms.forEach((room, index) => {
      const angle = (index / rooms.length) * Math.PI * 2 + seq * 0.02;
      room.send('move_intent', {
        seq,
        dirX: Math.cos(angle),
        dirZ: Math.sin(angle),
        run: index % 3 === 0,
        facing: angle,
      });
    });
  }, 50);

  const stop = async (): Promise<void> => {
    clearInterval(timer);
    await Promise.all(rooms.map((room) => room.leave(true).catch(() => undefined)));
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch(async (error: unknown) => {
  console.error('Load harness failed:', error);
  await closeDatabase();
  process.exit(1);
});
