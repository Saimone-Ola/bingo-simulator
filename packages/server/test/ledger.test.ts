import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { hasTestDatabase } from './setup';
import { closeDatabase, db } from '../src/db/client';
import { avatars, ledgerEntries, users, wallets } from '../src/db/schema';
import {
  ensureWallet,
  getWalletState,
  postLedgerEntry,
  postLedgerEntryAtomic,
  verifyLedgerIntegrity,
} from '../src/services/ledger';
import { AppError } from '../src/errors';

/**
 * Ledger integrity under concurrency.
 *
 * Requires a real PostgreSQL database (TEST_DATABASE_URL, or DATABASE_URL
 * pointing at a throwaway Neon branch) with migrations applied. Without one the
 * whole suite is skipped so `pnpm test` still runs on a fresh checkout.
 *
 * Note: `ledger_entries` is append-only at the database level, so these tests
 * intentionally leave their rows behind. Point them at a disposable branch.
 */
const suite = hasTestDatabase ? describe : describe.skip;

async function createPlayer(startingCredits: number): Promise<string> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      email: `ledger-${id}@test.local`,
      displayName: `Test ${id.slice(0, 8)}`,
      passwordHash: 'not-a-real-hash',
    });
    await ensureWallet(tx, id);
    await tx.insert(avatars).values({ userId: id });
    if (startingCredits > 0) {
      await postLedgerEntry(tx, {
        userId: id,
        amount: startingCredits,
        reason: 'welcome_bonus',
        refType: 'user',
        refId: id,
      });
    }
  });
  return id;
}

suite('ledger integrity', () => {
  beforeAll(async () => {
    // Fail loudly rather than silently testing nothing.
    await db.select({ id: wallets.id }).from(wallets).limit(1);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('materialised balance always equals the sum of entries', async () => {
    const userId = await createPlayer(1000);

    await postLedgerEntryAtomic({ userId, amount: -250, reason: 'slot_bet' });
    await postLedgerEntryAtomic({ userId, amount: 600, reason: 'slot_win' });
    await postLedgerEntryAtomic({ userId, amount: -100, reason: 'bingo_card_purchase' });

    const state = await getWalletState(db, userId);
    expect(state.balance).toBe(1250);
    expect(state.entryCount).toBe(4);

    const [integrity] = await verifyLedgerIntegrity(db, userId);
    expect(integrity?.consistent).toBe(true);
    expect(integrity?.derivedBalance).toBe(1250);
  });

  it('survives 200 concurrent movements without losing a credit', async () => {
    const userId = await createPlayer(10_000);

    // 100 bets of 25 and 100 wins of 25: the balance must come back to exactly
    // where it started, with 201 entries and no gap in the sequence.
    const operations = [
      ...Array.from({ length: 100 }, () => ({ amount: -25, reason: 'slot_bet' as const })),
      ...Array.from({ length: 100 }, () => ({ amount: 25, reason: 'slot_win' as const })),
    ].sort(() => Math.random() - 0.5);

    await Promise.all(
      operations.map((operation) =>
        postLedgerEntryAtomic({ userId, amount: operation.amount, reason: operation.reason }),
      ),
    );

    const state = await getWalletState(db, userId);
    expect(state.balance).toBe(10_000);
    expect(state.entryCount).toBe(201);

    const [integrity] = await verifyLedgerIntegrity(db, userId);
    expect(integrity?.consistent).toBe(true);

    const entries = await db
      .select({ sequence: ledgerEntries.sequence, balanceAfter: ledgerEntries.balanceAfter })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, userId))
      .orderBy(ledgerEntries.sequence);

    // Sequences are dense and every balanceAfter is a valid running total.
    expect(entries.map((entry) => entry.sequence)).toEqual(
      Array.from({ length: 201 }, (_, index) => index + 1),
    );
    expect(entries.every((entry) => entry.balanceAfter >= 0)).toBe(true);
  });

  it('never lets concurrent debits overdraw the wallet', async () => {
    // 500 credits, twenty simultaneous attempts to spend 100: exactly five may
    // succeed. This is the test that would fail on a read-modify-write balance.
    const userId = await createPlayer(500);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        postLedgerEntryAtomic({ userId, amount: -100, reason: 'bingo_card_purchase' }),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(5);
    expect(rejected).toHaveLength(15);
    for (const failure of rejected) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
      expect(((failure as PromiseRejectedResult).reason as AppError).code).toBe(
        'insufficient_funds',
      );
    }

    const state = await getWalletState(db, userId);
    expect(state.balance).toBe(0);
    const [integrity] = await verifyLedgerIntegrity(db, userId);
    expect(integrity?.consistent).toBe(true);
  });

  it('pays out an idempotent action only once, even under a retry storm', async () => {
    const userId = await createPlayer(0);
    const key = `test-prize:${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        postLedgerEntryAtomic({
          userId,
          amount: 300,
          reason: 'prize_game_reward',
          idempotencyKey: key,
        }),
      ),
    );

    const ids = new Set(results.map((entry) => entry.id));
    expect(ids.size).toBe(1);
    expect(results.filter((entry) => entry.replayed)).toHaveLength(9);

    const state = await getWalletState(db, userId);
    expect(state.balance).toBe(300);
  });

  it('refuses an amount whose sign contradicts its reason', async () => {
    const userId = await createPlayer(1000);

    await expect(
      postLedgerEntryAtomic({ userId, amount: 100, reason: 'slot_bet' }),
    ).rejects.toMatchObject({ code: 'validation_error' });

    await expect(
      postLedgerEntryAtomic({ userId, amount: -100, reason: 'slot_win' }),
    ).rejects.toMatchObject({ code: 'validation_error' });

    await expect(
      postLedgerEntryAtomic({ userId, amount: 0, reason: 'admin_adjustment' }),
    ).rejects.toMatchObject({ code: 'validation_error' });

    expect((await getWalletState(db, userId)).balance).toBe(1000);
  });

  it('rejects UPDATE and DELETE on ledger_entries at the database level', async () => {
    const userId = await createPlayer(100);
    const entry = await postLedgerEntryAtomic({
      userId,
      amount: 50,
      reason: 'quest_reward',
    });

    await expect(
      db.update(ledgerEntries).set({ amount: 999_999 }).where(eq(ledgerEntries.id, entry.id)),
    ).rejects.toThrow();

    await expect(
      db.delete(ledgerEntries).where(eq(ledgerEntries.id, entry.id)),
    ).rejects.toThrow();

    const [integrity] = await verifyLedgerIntegrity(db, userId);
    expect(integrity?.consistent).toBe(true);
    expect(integrity?.derivedBalance).toBe(150);
  });
});
