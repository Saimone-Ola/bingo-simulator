import * as argon2 from 'argon2';

/**
 * Argon2id with deliberately conservative parameters: ~64 MiB and 3 passes,
 * which costs a few hundred milliseconds on the API box and makes offline
 * cracking of a leaked dump expensive.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} satisfies argon2.HashOptions;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed stored hash must read as "wrong password", never as a crash.
    return false;
  }
}

/** True when the stored hash was produced with weaker settings than current. */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, {
    memoryCost: HASH_OPTIONS.memoryCost,
    timeCost: HASH_OPTIONS.timeCost,
    parallelism: HASH_OPTIONS.parallelism,
  });
}

/**
 * Burns roughly the same time as a real verification. Called when the email is
 * unknown so that response timing does not reveal which accounts exist.
 */
const DUMMY_HASH_PROMISE = hashPassword('bingo-simulator-timing-equaliser');

export async function fakeVerifyForTiming(): Promise<void> {
  const dummy = await DUMMY_HASH_PROMISE;
  await verifyPassword(dummy, 'not-the-password');
}
