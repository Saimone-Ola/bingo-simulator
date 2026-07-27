import { describe, expect, it } from 'vitest';
import { PG_UNIQUE_VIOLATION, findPostgresError, sanitizeError } from '../src/logging';

/**
 * Regression cover for a real leak: Drizzle wraps driver failures in an error
 * whose message and `params` carry every bound value of the failed query. On a
 * duplicate registration that means the argon2 hash of the password was being
 * written to the log, and the 23505 code was invisible to a plain
 * `error.code` check because it lives on the wrapped cause.
 */
function drizzleLikeError(): Error {
  const pgError = Object.assign(
    new Error('duplicate key value violates unique constraint "users_email_unique"'),
    { code: PG_UNIQUE_VIOLATION, constraint_name: 'users_email_unique' },
  );

  return Object.assign(
    new Error(
      'Failed query: insert into "users" ... returning "id"\n' +
        'params: mario@example.com,$argon2id$v=19$m=65536,p=1,t=3$SALT$SECRETHASH,Mario',
    ),
    { name: 'DrizzleQueryError', cause: pgError },
  );
}

describe('sanitizeError', () => {
  it('strips the bound parameters out of the logged message', () => {
    const serialized = sanitizeError(drizzleLikeError());
    const asText = JSON.stringify(serialized);

    expect(asText).not.toContain('argon2id');
    expect(asText).not.toContain('SECRETHASH');
    expect(asText).not.toContain('mario@example.com');
    expect(serialized.message).toContain('Failed query');
  });

  it('keeps the diagnostic detail that is actually useful', () => {
    const serialized = sanitizeError(drizzleLikeError());
    expect(serialized.type).toBe('DrizzleQueryError');
    expect(serialized.pgCode).toBe(PG_UNIQUE_VIOLATION);
    expect(serialized.constraint).toBe('users_email_unique');
    expect(serialized.causes[0]).toContain('duplicate key value');
  });

  it('caps runaway messages', () => {
    const serialized = sanitizeError(new Error('x'.repeat(5000)));
    expect(serialized.message.length).toBeLessThanOrEqual(301);
  });

  it('survives non-error values', () => {
    expect(sanitizeError('boom').message).toBe('boom');
    expect(sanitizeError(null).type).toBe('Error');
  });

  it('does not loop on a self-referencing cause chain', () => {
    const first = new Error('first') as Error & { cause?: unknown };
    const second = new Error('second') as Error & { cause?: unknown };
    first.cause = second;
    second.cause = first;

    expect(sanitizeError(first).causes).toHaveLength(2);
  });
});

describe('findPostgresError', () => {
  it('finds the code through the wrapper', () => {
    const found = findPostgresError(drizzleLikeError());
    expect(found?.code).toBe(PG_UNIQUE_VIOLATION);
    expect(found?.constraint).toBe('users_email_unique');
  });

  it('returns null when there is no driver error in the chain', () => {
    expect(findPostgresError(new Error('plain'))).toBeNull();
    expect(findPostgresError(undefined)).toBeNull();
  });

  it('ignores codes that are not Postgres SQLSTATEs', () => {
    const nodeError = Object.assign(new Error('dns'), { code: 'ENOTFOUND' });
    expect(findPostgresError(nodeError)).toBeNull();
  });
});
