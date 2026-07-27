import { and, eq, sql as raw } from 'drizzle-orm';
import {
  assertCredits,
  isLedgerAmountSignValid,
  type LedgerReason,
  type LedgerRefType,
} from '@bingo/shared';
import { db, type Executor } from '../db/client';
import { ledgerEntries, wallets } from '../db/schema';
import { AppError } from '../errors';

/**
 * The single door through which every credit in the game moves.
 *
 * Rules this module exists to guarantee:
 *  - no balance is ever written except alongside the ledger entry that
 *    justifies it, in the same transaction;
 *  - the wallet row is locked FOR UPDATE first, so concurrent spins, card
 *    purchases and prize payouts serialise per player instead of racing;
 *  - a balance can never go negative;
 *  - an action carrying an idempotency key can be retried safely after a
 *    dropped connection without paying out twice.
 *
 * Nothing outside this module may UPDATE `wallets.balance`, and the database
 * itself refuses UPDATE/DELETE on `ledger_entries` (migration 0001).
 */

export interface PostEntryInput {
  userId: string;
  /** Signed amount in credits. Negative debits, positive credits. Never zero. */
  amount: number;
  reason: LedgerReason;
  refType?: LedgerRefType;
  refId?: string | null;
  /** Stable per logical action, e.g. `spin:<spinId>:bet`. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface PostedEntry {
  id: string;
  walletId: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  sequence: number;
  reason: LedgerReason;
  createdAt: Date;
  /** True when the entry already existed and was returned by idempotency key. */
  replayed: boolean;
}

/** Creates the wallet for a brand new user. Idempotent. */
export async function ensureWallet(exec: Executor, userId: string): Promise<{ id: string }> {
  const [created] = await exec
    .insert(wallets)
    .values({ userId })
    .onConflictDoNothing({ target: wallets.userId })
    .returning({ id: wallets.id });

  if (created) return created;

  const [existing] = await exec
    .select({ id: wallets.id })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);

  if (!existing) throw AppError.internal('Wallet could not be created');
  return existing;
}

/**
 * Appends one entry. MUST be called inside a transaction - use
 * {@link postLedgerEntries} or `db.transaction` if you are not already in one.
 */
export async function postLedgerEntry(
  tx: Executor,
  input: PostEntryInput,
): Promise<PostedEntry> {
  const amount = assertCredits(input.amount, Number.MIN_SAFE_INTEGER);

  if (amount === 0) {
    throw AppError.validation('A ledger entry cannot be for zero credits');
  }
  if (!isLedgerAmountSignValid(input.reason, amount)) {
    throw AppError.validation(
      `Reason "${input.reason}" cannot carry an amount of ${amount}`,
    );
  }

  // Lock the wallet first: everything below reads and writes it.
  const [wallet] = await tx
    .select({
      id: wallets.id,
      balance: wallets.balance,
      entryCount: wallets.entryCount,
    })
    .from(wallets)
    .where(eq(wallets.userId, input.userId))
    .for('update')
    .limit(1);

  if (!wallet) {
    throw AppError.notFound(`No wallet for user ${input.userId}`);
  }

  // Safe under the lock: a concurrent post for the same wallet is queued
  // behind us, so a duplicate key can only mean a genuine earlier retry.
  if (input.idempotencyKey) {
    const [existing] = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.idempotencyKey, input.idempotencyKey),
          eq(ledgerEntries.walletId, wallet.id),
        ),
      )
      .limit(1);

    if (existing) {
      return {
        id: existing.id,
        walletId: existing.walletId,
        userId: existing.userId,
        amount: existing.amount,
        balanceAfter: existing.balanceAfter,
        sequence: existing.sequence,
        reason: existing.reason,
        createdAt: existing.createdAt,
        replayed: true,
      };
    }
  }

  const balanceAfter = wallet.balance + amount;
  if (balanceAfter < 0) {
    throw AppError.insufficientFunds(
      `Balance ${wallet.balance} cannot absorb ${amount}`,
    );
  }

  const sequence = wallet.entryCount + 1;

  const [entry] = await tx
    .insert(ledgerEntries)
    .values({
      walletId: wallet.id,
      userId: input.userId,
      amount,
      balanceAfter,
      sequence,
      reason: input.reason,
      refType: input.refType ?? 'none',
      refId: input.refId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!entry) throw AppError.internal('Ledger entry was not written');

  // Materialise the cache. The guarded WHERE means that if anything ever
  // wrote the wallet behind our back the update matches zero rows and the
  // whole transaction fails loudly instead of drifting.
  const updated = await tx
    .update(wallets)
    .set({ balance: balanceAfter, entryCount: sequence, updatedAt: new Date() })
    .where(and(eq(wallets.id, wallet.id), eq(wallets.entryCount, wallet.entryCount)))
    .returning({ id: wallets.id });

  if (updated.length !== 1) {
    throw AppError.internal('Wallet materialisation conflict; transaction rolled back');
  }

  return {
    id: entry.id,
    walletId: entry.walletId,
    userId: entry.userId,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    sequence: entry.sequence,
    reason: entry.reason,
    createdAt: entry.createdAt,
    replayed: false,
  };
}

/**
 * Posts several entries atomically: all of them land, or none does. Use this
 * for anything with two sides, such as a slot bet plus its win.
 */
export async function postLedgerEntries(
  inputs: readonly PostEntryInput[],
): Promise<PostedEntry[]> {
  if (inputs.length === 0) return [];

  return db.transaction(async (tx) => {
    const posted: PostedEntry[] = [];
    // Deterministic order by user id keeps multi-wallet transfers from
    // deadlocking against each other.
    const ordered = [...inputs].sort((a, b) => a.userId.localeCompare(b.userId));
    for (const input of ordered) {
      posted.push(await postLedgerEntry(tx, input));
    }
    return posted;
  });
}

/** Convenience for the common single-entry case outside a transaction. */
export async function postLedgerEntryAtomic(input: PostEntryInput): Promise<PostedEntry> {
  const [entry] = await postLedgerEntries([input]);
  if (!entry) throw AppError.internal('Ledger entry was not written');
  return entry;
}

export interface WalletState {
  walletId: string;
  balance: number;
  entryCount: number;
}

export async function getWalletState(exec: Executor, userId: string): Promise<WalletState> {
  const [wallet] = await exec
    .select({ id: wallets.id, balance: wallets.balance, entryCount: wallets.entryCount })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);

  if (!wallet) throw AppError.notFound(`No wallet for user ${userId}`);
  return { walletId: wallet.id, balance: wallet.balance, entryCount: wallet.entryCount };
}

export interface IntegrityResult {
  walletId: string;
  userId: string;
  materialisedBalance: number;
  derivedBalance: number;
  materialisedEntryCount: number;
  derivedEntryCount: number;
  consistent: boolean;
}

/**
 * Re-derives every balance from the ledger and compares it against the
 * materialised column. Run by `pnpm db:check` and by the integrity test suite.
 */
export async function verifyLedgerIntegrity(
  exec: Executor = db,
  userId?: string,
): Promise<IntegrityResult[]> {
  const rows = await exec
    .select({
      walletId: wallets.id,
      userId: wallets.userId,
      materialisedBalance: wallets.balance,
      materialisedEntryCount: wallets.entryCount,
      derivedBalance: raw<number>`coalesce(sum(${ledgerEntries.amount}), 0)::bigint`,
      derivedEntryCount: raw<number>`count(${ledgerEntries.id})::bigint`,
    })
    .from(wallets)
    .leftJoin(ledgerEntries, eq(ledgerEntries.walletId, wallets.id))
    .where(userId ? eq(wallets.userId, userId) : undefined)
    .groupBy(wallets.id);

  return rows.map((row) => ({
    walletId: row.walletId,
    userId: row.userId,
    materialisedBalance: Number(row.materialisedBalance),
    derivedBalance: Number(row.derivedBalance),
    materialisedEntryCount: Number(row.materialisedEntryCount),
    derivedEntryCount: Number(row.derivedEntryCount),
    consistent:
      Number(row.materialisedBalance) === Number(row.derivedBalance) &&
      Number(row.materialisedEntryCount) === Number(row.derivedEntryCount),
  }));
}
