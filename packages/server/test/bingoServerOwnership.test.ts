import { afterEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { hasTestDatabase } from './setup';
import { env } from '../src/env';
import { acquireBingoServerOwnership, type BingoServerOwnership } from '../src/services/bingoServerOwnership';

const suite = hasTestDatabase ? describe : describe.skip;

suite('Bingo server ownership (throwaway PostgreSQL)', () => {
  const leases: BingoServerOwnership[] = [];
  afterEach(async () => {
    for (const lease of leases.splice(0)) await lease.release();
  });

  it('blocks a second owner until the first closes its dedicated session', async () => {
    const lost = vi.fn();
    const first = await acquireBingoServerOwnership(lost);
    leases.push(first);
    await expect(acquireBingoServerOwnership(vi.fn())).rejects.toThrow('Another Bingo server owns this database');
    await first.release();
    await first.release();
    const next = await acquireBingoServerOwnership(lost);
    leases.push(next);
    expect(next.backendPid).not.toBe(first.backendPid);
    expect(lost).not.toHaveBeenCalled();
  });

  it('notifies the process on connection loss and permits recovery by a new owner', async () => {
    const lost = vi.fn();
    const owner = await acquireBingoServerOwnership(lost);
    leases.push(owner);
    const connectionString = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
    // This test terminates only the owner session it just acquired, on the
    // disposable test DB. No application connection or unrelated PID is touched.
    const admin = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} });
    try {
      await admin`select pg_terminate_backend(${owner.backendPid})`;
      await vi.waitFor(() => expect(lost).toHaveBeenCalledOnce(), { timeout: 8000 });
      await owner.release();
      leases.push(await acquireBingoServerOwnership(vi.fn()));
    } finally {
      await admin.end({ timeout: 5 });
    }
  });
});
